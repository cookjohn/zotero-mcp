import { BasicExampleFactory } from "./modules/examples";
import { httpServer } from "./modules/httpServer"; // 使用单例导出
import { serverPreferences } from "./modules/serverPreferences";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { MCPSettingsService } from "./modules/mcpSettingsService";
import { registerSemanticIndexColumn, unregisterSemanticIndexColumn, refreshSemanticColumn } from "./modules/semanticIndexColumn";

// Preference keys for semantic search settings
const PREF_SEMANTIC_ENABLED = 'extensions.zotero.zotero-mcp-plugin.semantic.enabled';
const PREF_SEMANTIC_AUTO_UPDATE = 'extensions.zotero.zotero-mcp-plugin.semantic.autoUpdate';

// Store notifier ID for cleanup
let itemNotifierID: string | null = null;

// Debounce timer for auto-update
let autoUpdateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_UPDATE_DEBOUNCE_MS = 5000; // Wait 5 seconds after last change before updating

// Queue of item keys to update
const pendingAutoUpdateKeys = new Set<string>();

// Flag to prevent recursive auto-update during indexing
let isAutoIndexing = false;

// Auto index check interval (10 minutes)
const AUTO_INDEX_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let autoIndexCheckTimer: ReturnType<typeof setInterval> | null = null;
let autoIndexInitialTimer: ReturnType<typeof setTimeout> | null = null;

// Track all setTimeout calls for cleanup on shutdown
const pendingTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

// Global flag to prevent new async operations during shutdown
let isShuttingDown = false;

/**
 * Create a tracked setTimeout that will be cleaned up on shutdown
 */
function trackedSetTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => {
    pendingTimeouts.delete(timer);
    if (!isShuttingDown) {
      callback();
    }
  }, delay);
  pendingTimeouts.add(timer);
  return timer;
}

/**
 * Clear all pending tracked timeouts
 */
function clearAllPendingTimeouts(): void {
  for (const timer of pendingTimeouts) {
    clearTimeout(timer);
  }
  pendingTimeouts.clear();
  ztoolkit.log(`[MCP Plugin] All pending timeouts cleared`);
}

/**
 * Process pending auto-update items
 */
async function processPendingAutoUpdates() {
  if (isShuttingDown) return;
  if (pendingAutoUpdateKeys.size === 0) return;

  // Check if semantic search is enabled
  const semanticEnabled = Zotero.Prefs.get(PREF_SEMANTIC_ENABLED, true);
  if (semanticEnabled === false) return;

  const keysToUpdate = Array.from(pendingAutoUpdateKeys);
  pendingAutoUpdateKeys.clear();

  ztoolkit.log(`[MCP Plugin] Auto-updating semantic index for ${keysToUpdate.length} items`);

  // Set flag to prevent recursive calls during indexing
  isAutoIndexing = true;

  try {
    const { getSemanticSearchService } = await import("./modules/semantic");
    const semanticService = getSemanticSearchService();

    // Check if service is ready
    const isReady = await semanticService.isReady();
    if (!isReady) {
      ztoolkit.log("[MCP Plugin] Semantic service not ready, skipping auto-update");
      return;
    }

    // Build index for new items only (rebuild: false to avoid clearing all data)
    await semanticService.buildIndex({
      itemKeys: keysToUpdate,
      rebuild: false,  // Only add new indexes, don't clear existing data
      onProgress: (progress) => {
        ztoolkit.log(`[MCP Plugin] Auto-update progress: ${progress.processed}/${progress.total}`);
      }
    });

    // Refresh semantic column to show updated status
    refreshSemanticColumn();
    ztoolkit.log(`[MCP Plugin] Auto-update completed for ${keysToUpdate.length} items`);
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Auto-update failed: ${error}`, 'error');
  } finally {
    // Always reset the flag
    isAutoIndexing = false;
  }
}

/**
 * Schedule auto-update with debouncing
 */
function scheduleAutoUpdate(itemKey: string) {
  pendingAutoUpdateKeys.add(itemKey);

  // Clear existing timer
  if (autoUpdateDebounceTimer) {
    clearTimeout(autoUpdateDebounceTimer);
  }

  // Set new timer
  autoUpdateDebounceTimer = setTimeout(() => {
    autoUpdateDebounceTimer = null;
    processPendingAutoUpdates();
  }, AUTO_UPDATE_DEBOUNCE_MS);
}

/**
 * Handle deleted items - remove their indexes
 */
async function handleItemsDeleted(itemIds: number[], extraData: any) {
  try {
    const { getVectorStore } = await import("./modules/semantic/vectorStore");
    const vectorStore = getVectorStore();

    // Try to get item keys from extraData (Zotero passes old data for deleted items)
    const itemKeys: string[] = [];
    if (extraData) {
      for (const id of itemIds) {
        const oldData = extraData[id];
        if (oldData?.key) {
          itemKeys.push(oldData.key);
        }
      }
    }

    if (itemKeys.length === 0) {
      ztoolkit.log(`[MCP Plugin] No item keys found for deleted items, skipping index cleanup`);
      return;
    }

    ztoolkit.log(`[MCP Plugin] Cleaning up indexes for ${itemKeys.length} deleted items`);

    for (const itemKey of itemKeys) {
      try {
        // Delete vectors and content cache (item is permanently deleted)
        await vectorStore.deleteItemVectors(itemKey, true);
        ztoolkit.log(`[MCP Plugin] Deleted index and cache for item: ${itemKey}`);
      } catch (e) {
        // Ignore errors for items that weren't indexed
      }
    }
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error handling deleted items: ${error}`, 'warn');
  }
}

/**
 * Register Zotero notifier to watch for item changes
 */
function registerItemNotifier() {
  // Check if auto-update is enabled
  const autoUpdateEnabled = Zotero.Prefs.get(PREF_SEMANTIC_AUTO_UPDATE, true);
  if (autoUpdateEnabled === undefined) {
    // Set default value if not set
    Zotero.Prefs.set(PREF_SEMANTIC_AUTO_UPDATE, false, true);
  }

  itemNotifierID = Zotero.Notifier.registerObserver({
    notify: async (event: string, type: string, ids: (string | number)[], extraData: any) => {
      // Don't process during shutdown
      if (isShuttingDown) return;

      // Don't process during auto-indexing (prevent loops)
      if (isAutoIndexing) return;

      // Only process item events
      if (type !== 'item') return;

      // Check if semantic search and auto-update are enabled
      const semanticOn = Zotero.Prefs.get(PREF_SEMANTIC_ENABLED, true);
      if (semanticOn === false) return;
      const enabled = Zotero.Prefs.get(PREF_SEMANTIC_AUTO_UPDATE, true);
      if (!enabled) return;

      // Only process add and delete events (not modify - to avoid loops)
      if (event !== 'add' && event !== 'delete') return;

      ztoolkit.log(`[MCP Plugin] Item notifier: event=${event}, type=${type}, ids=${ids.length}`);

      const numericIds = ids.map(id => typeof id === 'string' ? parseInt(id, 10) : id);

      if (event === 'add') {
        // For add events, schedule indexing for new items
        const items = Zotero.Items.get(numericIds);
        for (const item of items) {
          // Only index regular items (not attachments, notes, etc.)
          if (item.isRegularItem?.()) {
            scheduleAutoUpdate(item.key);
          }
        }
      } else if (event === 'delete') {
        // For delete events, remove index for deleted items
        // Extract item keys from extraData (items are already deleted)
        handleItemsDeleted(numericIds, extraData);
      }
    }
  }, ['item'], 'zotero-mcp-plugin-auto-update');

  ztoolkit.log(`[MCP Plugin] Item notifier registered: ${itemNotifierID}`);

  // Start periodic auto-index check (every 10 minutes)
  startAutoIndexCheck();
}

/**
 * Start periodic auto-index check timer
 */
function startAutoIndexCheck() {
  // Clear existing timers if any
  if (autoIndexCheckTimer) {
    clearInterval(autoIndexCheckTimer);
    autoIndexCheckTimer = null;
  }
  if (autoIndexInitialTimer) {
    clearTimeout(autoIndexInitialTimer);
    autoIndexInitialTimer = null;
  }

  // Run first check after 30 seconds (let Zotero fully initialize)
  autoIndexInitialTimer = setTimeout(() => {
    autoIndexInitialTimer = null;
    triggerAutoIndexBuild();
  }, 30000);

  // Then run every 10 minutes
  autoIndexCheckTimer = setInterval(() => {
    triggerAutoIndexBuild();
  }, AUTO_INDEX_CHECK_INTERVAL_MS);

  ztoolkit.log(`[MCP Plugin] Auto-index check timer started (interval: ${AUTO_INDEX_CHECK_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop periodic auto-index check timer
 */
function stopAutoIndexCheck() {
  if (autoIndexInitialTimer) {
    clearTimeout(autoIndexInitialTimer);
    autoIndexInitialTimer = null;
  }
  if (autoIndexCheckTimer) {
    clearInterval(autoIndexCheckTimer);
    autoIndexCheckTimer = null;
  }
  ztoolkit.log("[MCP Plugin] Auto-index check timers stopped");
}

/**
 * Trigger automatic index build for unindexed items (when auto-update is enabled)
 */
async function triggerAutoIndexBuild() {
  // Don't start new operations during shutdown
  if (isShuttingDown) return;

  // Don't start if already indexing
  if (isAutoIndexing) {
    ztoolkit.log("[MCP Plugin] Auto-indexing already in progress, skipping");
    return;
  }

  try {
    const enabled = Zotero.Prefs.get(PREF_SEMANTIC_AUTO_UPDATE, true);
    if (!enabled) {
      ztoolkit.log("[MCP Plugin] Auto-update disabled, skipping auto index check");
      return;
    }

    // Check if semantic search is enabled
    const semanticEnabled = Zotero.Prefs.get(PREF_SEMANTIC_ENABLED, true);
    if (semanticEnabled === false) {
      ztoolkit.log("[MCP Plugin] Semantic search disabled, skipping auto index check");
      return;
    }

    ztoolkit.log("[MCP Plugin] Periodic auto-index check...");

    const { getSemanticSearchService } = await import("./modules/semantic");
    const semanticService = getSemanticSearchService();

    // Check if service is ready (API configured)
    const isReady = await semanticService.isReady();
    if (!isReady) {
      ztoolkit.log("[MCP Plugin] Semantic service not ready (API not configured), skipping");
      return;
    }

    // Check current index status
    const stats = await semanticService.getStats();
    if (stats.indexProgress.status === 'indexing') {
      ztoolkit.log("[MCP Plugin] Indexing already in progress, skipping");
      return;
    }

    // Set flag to prevent recursive calls during indexing
    isAutoIndexing = true;

    // Start building index for unindexed items (rebuild=false means only index new items)
    ztoolkit.log("[MCP Plugin] Starting auto index build for unindexed items...");
    semanticService.buildIndex({
      rebuild: false,  // Only index items that haven't been indexed
      onProgress: (progress) => {
        if (progress.processed % 10 === 0) {
          ztoolkit.log(`[MCP Plugin] Auto index progress: ${progress.processed}/${progress.total}`);
        }
      }
    }).then((result) => {
      if (result.processed > 0) {
        ztoolkit.log(`[MCP Plugin] Auto index completed: ${result.processed}/${result.total} items`);
        refreshSemanticColumn();
      } else {
        ztoolkit.log("[MCP Plugin] Auto index check: no new items to index");
      }
    }).catch((error) => {
      ztoolkit.log(`[MCP Plugin] Auto index failed: ${error}`, 'error');
    }).finally(() => {
      // Always reset the flag
      isAutoIndexing = false;
    });

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error in triggerAutoIndexBuild: ${error}`, 'error');
    isAutoIndexing = false;
  }
}

/**
 * Unregister item notifier
 */
function unregisterItemNotifier() {
  if (itemNotifierID) {
    Zotero.Notifier.unregisterObserver(itemNotifierID);
    ztoolkit.log(`[MCP Plugin] Item notifier unregistered: ${itemNotifierID}`);
    itemNotifierID = null;
  }

  // Stop auto-index check timer
  stopAutoIndexCheck();

  // Clear any pending timer
  if (autoUpdateDebounceTimer) {
    clearTimeout(autoUpdateDebounceTimer);
    autoUpdateDebounceTimer = null;
  }
  pendingAutoUpdateKeys.clear();
}

async function onStartup() {
  // 进程诊断 - 检测当前运行在哪个进程中
  try {
    const runtime = (Cc as any)["@mozilla.org/xre/app-info;1"]?.getService((Ci as any).nsIXULRuntime);
    const processType = runtime?.processType;
    const processID = runtime?.processID;
    const processTypeNames: Record<number, string> = { 0: 'PARENT', 2: 'CONTENT', 4: 'GPU', 9: 'UTILITY' };
    ztoolkit.log(`[MCP Plugin] ======== STARTUP BEGIN ======== PID=${processID}, processType=${processType} (${processTypeNames[processType] || 'UNKNOWN'})`);
  } catch (e) {
    ztoolkit.log(`[MCP Plugin] ======== STARTUP BEGIN ======== (process info unavailable: ${e})`);
  }

  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  ztoolkit.log("[MCP Plugin] [STARTUP] Zotero initialization promises resolved");

  initLocale();

  // Initialize MCP settings with defaults
  try {
    MCPSettingsService.initializeDefaults();
    ztoolkit.log(`[MCP Plugin] [STARTUP] MCP settings initialized`);
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] [STARTUP] Error initializing MCP settings: ${error}`, 'error');
  }

  // Check if this is first installation and show config prompt
  checkFirstInstallation();

  // 启动HTTP服务器
  try {
    const port = serverPreferences.getPort();
    const enabled = serverPreferences.isServerEnabled();
    ztoolkit.log(`[MCP Plugin] [STARTUP] HTTP server config - enabled: ${enabled}, port: ${port}`);

    addon.data.httpServer = httpServer;

    if (enabled === false) {
      ztoolkit.log(`[MCP Plugin] [STARTUP] HTTP server disabled, skipping`);
    } else {
      if (!port || isNaN(port)) {
        throw new Error(`Invalid port value: ${port}`);
      }
      ztoolkit.log(`[MCP Plugin] [STARTUP] Starting HTTP server on port ${port}...`);
      httpServer.start(port);
      ztoolkit.log(`[MCP Plugin] [STARTUP] HTTP server started on port ${port}`);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [STARTUP] Failed to start HTTP server: ${err.message}`, "error");
  }

  // 监听偏好设置变化
  serverPreferences.addObserver(async (name) => {
    if (isShuttingDown) return; // 关闭时不处理偏好变化
    ztoolkit.log(`[MCP Plugin] Preference changed: ${name}`);

    if (name === "extensions.zotero.zotero-mcp-plugin.mcp.server.port" || name === "extensions.zotero.zotero-mcp-plugin.mcp.server.enabled") {
      try {
        if (httpServer.isServerRunning()) {
          httpServer.stop();
          ztoolkit.log("[MCP Plugin] HTTP server stopped for restart");
        }

        if (serverPreferences.isServerEnabled()) {
          const port = serverPreferences.getPort();
          httpServer.start(port);
          ztoolkit.log(`[MCP Plugin] HTTP server restarted on port ${port}`);
        } else {
          ztoolkit.log("[MCP Plugin] HTTP server disabled by user");
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ztoolkit.log(`[MCP Plugin] Error handling preference change: ${err.message}`, "error");
      }
    }
  });

  BasicExampleFactory.registerPrefs();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
  ztoolkit.log("[MCP Plugin] [STARTUP] Main windows loaded");

  // Register item notifier for auto-update semantic index
  registerItemNotifier();
  ztoolkit.log("[MCP Plugin] [STARTUP] Item notifier registered");

  addon.data.initialized = true;
  ztoolkit.log("[MCP Plugin] ======== STARTUP COMPLETE ========");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Also load addon.ftl and preferences.ftl
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-addon.ftl`,
  );
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-preferences.ftl`,
  );

  // Register context menu for semantic indexing
  registerSemanticIndexMenu(win);

  // Register semantic index status column
  registerSemanticIndexColumn();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.log("[MCP Plugin] ======== SHUTDOWN START ========");

  // Set shutdown flag to prevent new async operations
  isShuttingDown = true;

  // Clear all pending timeouts immediately
  ztoolkit.log("[MCP Plugin] [SHUTDOWN 1/7] Clearing pending timeouts...");
  clearAllPendingTimeouts();
  ztoolkit.log("[MCP Plugin] [SHUTDOWN 1/7] Done");

  // 取消注册条目变化监听器
  try {
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 2/7] Unregistering item notifier...");
    unregisterItemNotifier();
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 2/7] Done");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 2/7] Error: ${err.message}`, "error");
  }

  // 注销语义索引状态列
  try {
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 3/7] Unregistering semantic index column...");
    unregisterSemanticIndexColumn();
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 3/7] Done");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 3/7] Error: ${err.message}`, "error");
  }

  // 停止HTTP服务器 - 这是阻止进程退出的最可能原因
  try {
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 4/7] Stopping HTTP server (running: ${httpServer.isServerRunning()})...`);
    if (httpServer.isServerRunning()) {
      httpServer.stop();
    }
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 4/7] Done (running: ${httpServer.isServerRunning()})`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 4/7] Error: ${err.message}`, "error");
  }

  // 停止语义搜索服务
  try {
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 5/7] Stopping semantic search service...");
    const { getSemanticSearchService, resetSemanticSearchService } = require("./modules/semantic");
    const semanticService = getSemanticSearchService();
    semanticService.abortIndex();
    semanticService.destroy();
    resetSemanticSearchService();
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 5/7] Done");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 5/7] Error: ${err.message}`, "error");
  }

  // 停止嵌入服务
  try {
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 6/7] Stopping embedding service...");
    const { getEmbeddingService } = require("./modules/semantic/embeddingService");
    const embeddingService = getEmbeddingService();
    embeddingService.destroy();
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 6/7] Done");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 6/7] Error: ${err.message}`, "error");
  }

  // 关闭向量存储数据库
  try {
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 7/7] Closing vector store...");
    const { resetVectorStore } = require("./modules/semantic/vectorStore");
    resetVectorStore();
    ztoolkit.log("[MCP Plugin] [SHUTDOWN 7/7] Done");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`[MCP Plugin] [SHUTDOWN 7/7] Error: ${err.message}`, "error");
  }

  ztoolkit.log("[MCP Plugin] [SHUTDOWN] Unregistering server preferences...");
  serverPreferences.unregister();

  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];

  ztoolkit.log("[MCP Plugin] ======== SHUTDOWN COMPLETE ========");
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Preferences event: ${type}`);
  
  switch (type) {
    case "load":
      ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Loading preference scripts...`);
      
      // 诊断设置面板加载环境
      try {
        if (data.window) {
          ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Preference window available`);
          
          // 检查当前偏好设置状态
          const currentEnabled = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.enabled", true);
          const currentPort = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.port", true);
          ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Current prefs at panel load - enabled: ${currentEnabled}, port: ${currentPort}`);
          
          // 检查preference元素是否存在
          trackedSetTimeout(() => {
            try {
              const doc = data.window.document;
              const enabledElement = doc?.querySelector('#zotero-prefpane-zotero-mcp-plugin-mcp-server-enabled');
              const portElement = doc?.querySelector('#zotero-prefpane-zotero-mcp-plugin-mcp-server-port');

              ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Preference elements - enabled: ${!!enabledElement}, port: ${!!portElement}`);

              if (enabledElement) {
                const hasChecked = enabledElement.hasAttribute('checked');
                ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Enabled checkbox state: ${hasChecked}`);
              }

            } catch (error) {
              ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Error checking preference elements: ${error}`, 'error');
            }
          }, 500);
          
        } else {
          ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] WARNING: No preference window in data`, 'error');
        }
      } catch (error) {
        ztoolkit.log(`===MCP=== [hooks.ts] [DIAGNOSTIC] Error in preference load diagnostic: ${error}`, 'error');
      }
      
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

/**
 * Check if this is the first installation and prompt user to configure
 */
function checkFirstInstallation() {
  try {
    const hasShownPrompt = Zotero.Prefs.get("mcp.firstInstallPromptShown", false);
    if (!hasShownPrompt) {
      // Mark as shown immediately to prevent multiple prompts
      Zotero.Prefs.set("mcp.firstInstallPromptShown", true);
      
      // Show prompt after a short delay to ensure UI is ready
      trackedSetTimeout(() => {
        showFirstInstallPrompt();
      }, 3000);
    }
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error checking first installation: ${error}`, "error");
  }
}

/**
 * Show first installation configuration prompt
 */
function showFirstInstallPrompt() {
  try {
    // Use bilingual text for first install prompt
    const title = "欢迎使用 Zotero MCP 插件 / Welcome to Zotero MCP Plugin";
    const promptText = "感谢安装 Zotero MCP 插件！为了开始使用，您需要为您的 AI 客户端生成配置文件。是否现在打开设置页面来生成配置？\n\nThank you for installing the Zotero MCP Plugin! To get started, you need to generate configuration files for your AI clients. Would you like to open the settings page now to generate configurations?";
    const openPrefsText = "打开设置 / Open Settings";
    const laterText = "稍后配置 / Configure Later";
    
    // Use a simple window confirm instead of Services.prompt for compatibility
    const message = `${title}\n\n${promptText}\n\n${openPrefsText} (OK) / ${laterText} (Cancel)`;
    
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) {
      ztoolkit.log("[MCP Plugin] No main window available", "error");
      return;
    }
    
    const result = mainWindow.confirm(message);
    
    if (result) {
      // User chose to open preferences
      trackedSetTimeout(() => {
        openPreferencesWindow();
      }, 100);
    }
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error showing first install prompt: ${error}`, "error");
  }
}

/**
 * Open the preferences window
 */
function openPreferencesWindow() {
  try {
    const windowName = `${addon.data.config.addonRef}-preferences`;
    const existingWindow = Zotero.getMainWindow().ZoteroPane.openPreferences(null, windowName);
    
    if (existingWindow) {
      existingWindow.focus();
    }
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error opening preferences: ${error}`, "error");
    
    // Fallback: try to open standard preferences
    try {
      Zotero.getMainWindow().openPreferences();
    } catch (fallbackError) {
      ztoolkit.log(`[MCP Plugin] Fallback preferences open failed: ${fallbackError}`, "error");
    }
  }
}

/**
 * Register semantic index context menu
 */
function registerSemanticIndexMenu(win: _ZoteroTypes.MainWindow) {
  try {
    const doc = win.document;

    // Find the item context menu
    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (!itemMenu) {
      ztoolkit.log("[MCP Plugin] Item menu not found, skipping context menu registration");
      return;
    }

    // Create menu separator
    const separator = doc.createXULElement("menuseparator");
    separator.id = "zotero-mcp-semantic-separator";

    // Create parent menu
    const parentMenu = doc.createXULElement("menu");
    parentMenu.id = "zotero-mcp-semantic-menu";
    parentMenu.setAttribute("label", getString("menu-semantic-index" as any) || "Update Semantic Index");

    // Create popup for submenu
    const popup = doc.createXULElement("menupopup");
    popup.id = "zotero-mcp-semantic-popup";

    // Create "Index Selected Items" menu item
    const indexSelectedItem = doc.createXULElement("menuitem");
    indexSelectedItem.id = "zotero-mcp-index-selected";
    indexSelectedItem.setAttribute("label", getString("menu-semantic-index-selected" as any) || "Index Selected Items");
    indexSelectedItem.addEventListener("command", () => {
      handleIndexSelected(win);
    });

    // Create "Index All Items" menu item
    const indexAllItem = doc.createXULElement("menuitem");
    indexAllItem.id = "zotero-mcp-index-all";
    indexAllItem.setAttribute("label", getString("menu-semantic-index-all" as any) || "Index All Items");
    indexAllItem.addEventListener("command", () => {
      handleIndexAll(win);
    });

    // Create "Clear Selected Items Index" menu item
    const clearSelectedItem = doc.createXULElement("menuitem");
    clearSelectedItem.id = "zotero-mcp-clear-selected";
    clearSelectedItem.setAttribute("label", getString("menu-semantic-clear-selected" as any) || "Clear Selected Items Index");
    clearSelectedItem.addEventListener("command", () => {
      handleClearSelectedIndex(win);
    });

    // Assemble menu
    popup.appendChild(indexSelectedItem);
    popup.appendChild(indexAllItem);
    popup.appendChild(clearSelectedItem);
    parentMenu.appendChild(popup);

    // Add to item menu
    itemMenu.appendChild(separator);
    itemMenu.appendChild(parentMenu);

    ztoolkit.log("[MCP Plugin] Semantic index context menu registered");
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error registering context menu: ${error}`, "error");
  }

  // Also register collection context menu
  registerCollectionSemanticIndexMenu(win);
}

/**
 * Register semantic index context menu for collections
 */
function registerCollectionSemanticIndexMenu(win: _ZoteroTypes.MainWindow) {
  try {
    const doc = win.document;

    // Find the collection context menu
    const collectionMenu = doc.getElementById("zotero-collectionmenu");
    if (!collectionMenu) {
      ztoolkit.log("[MCP Plugin] Collection menu not found, skipping collection context menu registration");
      return;
    }

    // Create menu separator
    const separator = doc.createXULElement("menuseparator");
    separator.id = "zotero-mcp-collection-semantic-separator";

    // Create parent menu
    const parentMenu = doc.createXULElement("menu");
    parentMenu.id = "zotero-mcp-collection-semantic-menu";
    parentMenu.setAttribute("label", getString("menu-collection-semantic-index" as any) || "Semantic Index");

    // Create popup for submenu
    const popup = doc.createXULElement("menupopup");
    popup.id = "zotero-mcp-collection-semantic-popup";

    // Create "Build Index" menu item (incremental, only unindexed items)
    const buildIndexItem = doc.createXULElement("menuitem");
    buildIndexItem.id = "zotero-mcp-collection-build-index";
    buildIndexItem.setAttribute("label", getString("menu-collection-build-index" as any) || "Build Index");
    buildIndexItem.addEventListener("command", () => {
      handleIndexCollection(win, false);
    });

    // Create "Rebuild Index" menu item (rebuild all items in collection)
    const rebuildIndexItem = doc.createXULElement("menuitem");
    rebuildIndexItem.id = "zotero-mcp-collection-rebuild-index";
    rebuildIndexItem.setAttribute("label", getString("menu-collection-rebuild-index" as any) || "Rebuild Index");
    rebuildIndexItem.addEventListener("command", () => {
      handleIndexCollection(win, true);
    });

    // Create "Clear Index" menu item
    const clearIndexItem = doc.createXULElement("menuitem");
    clearIndexItem.id = "zotero-mcp-collection-clear-index";
    clearIndexItem.setAttribute("label", getString("menu-collection-clear-index" as any) || "Clear Index");
    clearIndexItem.addEventListener("command", () => {
      handleClearCollectionIndex(win);
    });

    // Assemble menu
    popup.appendChild(buildIndexItem);
    popup.appendChild(rebuildIndexItem);
    popup.appendChild(clearIndexItem);
    parentMenu.appendChild(popup);

    // Add to collection menu
    collectionMenu.appendChild(separator);
    collectionMenu.appendChild(parentMenu);

    ztoolkit.log("[MCP Plugin] Collection semantic index context menu registered");
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error registering collection context menu: ${error}`, "error");
  }
}

/**
 * Recursively get all item IDs from a collection and its subcollections
 */
function getAllItemIDsFromCollection(collection: any): number[] {
  const itemIDs = new Set<number>();

  // Get direct child items
  const directItems = collection.getChildItems(true) || [];
  for (const id of directItems) {
    itemIDs.add(id);
  }

  // Recursively get items from subcollections
  const childCollectionIDs = collection.getChildCollections(true) || [];
  for (const childCollectionID of childCollectionIDs) {
    const childCollection = Zotero.Collections.get(childCollectionID);
    if (childCollection) {
      const childItems = getAllItemIDsFromCollection(childCollection);
      for (const id of childItems) {
        itemIDs.add(id);
      }
    }
  }

  return Array.from(itemIDs);
}

/**
 * Handle indexing a collection
 * @param rebuild If true, rebuild index for all items (even if already indexed)
 */
async function handleIndexCollection(win: _ZoteroTypes.MainWindow, rebuild: boolean = false) {
  try {
    const ZoteroPane = win.ZoteroPane;
    if (!ZoteroPane) {
      ztoolkit.log("[MCP Plugin] ZoteroPane not available", "error");
      return;
    }

    // Get selected collection
    const collection = ZoteroPane.getSelectedCollection?.();
    if (!collection) {
      ztoolkit.log("[MCP Plugin] No collection selected");
      showNotification(win, getString("menu-semantic-index-no-collection" as any) || "Please select a collection");
      return;
    }

    ztoolkit.log(`[MCP Plugin] ${rebuild ? 'Rebuilding' : 'Building'} index for collection: ${collection.name}`);

    // Get all items in the collection (including nested subcollections)
    const itemIDs = getAllItemIDsFromCollection(collection);
    if (!itemIDs || itemIDs.length === 0) {
      ztoolkit.log("[MCP Plugin] Collection has no items");
      showNotification(win, getString("menu-semantic-index-no-items" as any) || "Collection has no items");
      return;
    }

    // Convert IDs to item objects and filter for regular items
    const items = Zotero.Items.get(itemIDs);
    const itemKeys = items
      .filter((item: any) => item.isRegularItem?.())
      .map((item: any) => item.key);

    if (itemKeys.length === 0) {
      ztoolkit.log("[MCP Plugin] No regular items in collection");
      showNotification(win, getString("menu-semantic-index-no-items" as any) || "No indexable items in collection");
      return;
    }

    ztoolkit.log(`[MCP Plugin] ${rebuild ? 'Rebuilding' : 'Building'} index for ${itemKeys.length} items from collection "${collection.name}"`);

    // Import and use semantic search service
    const { getSemanticSearchService } = await import("./modules/semantic");
    const semanticService = getSemanticSearchService();
    await semanticService.initialize();

    // Show starting notification
    const startMessage = `${getString("menu-semantic-index-started" as any) || "Semantic indexing started"}: ${collection.name} (${itemKeys.length})`;
    showNotification(win, startMessage);

    // Build index for collection items
    semanticService.buildIndex({
      itemKeys,
      rebuild,
      onProgress: (progress) => {
        ztoolkit.log(`[MCP Plugin] Index progress: ${progress.processed}/${progress.total}`);
      }
    }).then((result) => {
      ztoolkit.log(`[MCP Plugin] Collection indexing completed: ${result.processed}/${result.total} items`);
      // Refresh semantic column to show updated status
      refreshSemanticColumn();
      // Show success notification
      const completedMsg = `${getString("menu-semantic-index-completed" as any) || "Indexing completed"}: ${collection.name} (${result.processed}/${result.total})`;
      showNotification(win, completedMsg);
    }).catch((error) => {
      ztoolkit.log(`[MCP Plugin] Collection indexing failed: ${error}`, "error");
      // Refresh column anyway to show current status
      refreshSemanticColumn();
      // Show error notification
      const errorMsg = `${getString("menu-semantic-index-error" as any) || "Indexing failed"}: ${error.message || error}`;
      showNotification(win, errorMsg);
    });

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error handling collection index: ${error}`, "error");
    showNotification(win, getString("menu-semantic-index-error" as any) || "Semantic indexing failed");
  }
}

/**
 * Handle clearing index for a collection
 */
async function handleClearCollectionIndex(win: _ZoteroTypes.MainWindow) {
  try {
    const ZoteroPane = win.ZoteroPane;
    if (!ZoteroPane) {
      ztoolkit.log("[MCP Plugin] ZoteroPane not available", "error");
      return;
    }

    // Get selected collection
    const collection = ZoteroPane.getSelectedCollection?.();
    if (!collection) {
      ztoolkit.log("[MCP Plugin] No collection selected");
      showNotification(win, getString("menu-semantic-index-no-collection" as any) || "Please select a collection");
      return;
    }

    // Confirm before clearing
    const confirmMsg = getString("menu-collection-clear-confirm" as any) ||
      `Are you sure you want to clear the semantic index for "${collection.name}"?`;
    if (!win.confirm(confirmMsg)) {
      return;
    }

    ztoolkit.log(`[MCP Plugin] Clearing index for collection: ${collection.name}`);

    // Get all items in the collection (including nested subcollections)
    const itemIDs = getAllItemIDsFromCollection(collection);
    if (!itemIDs || itemIDs.length === 0) {
      ztoolkit.log("[MCP Plugin] Collection has no items");
      showNotification(win, getString("menu-semantic-index-no-items" as any) || "Collection has no items");
      return;
    }

    // Convert IDs to item objects and get keys
    const items = Zotero.Items.get(itemIDs);
    const itemKeys = items
      .filter((item: any) => item.isRegularItem?.())
      .map((item: any) => item.key);

    if (itemKeys.length === 0) {
      ztoolkit.log("[MCP Plugin] No regular items in collection");
      return;
    }

    // Delete vectors for these items
    const { getVectorStore } = await import("./modules/semantic/vectorStore");
    const vectorStore = getVectorStore();
    await vectorStore.initialize();

    let clearedCount = 0;
    for (const itemKey of itemKeys) {
      try {
        await vectorStore.deleteItemVectors(itemKey);
        clearedCount++;
      } catch (e) {
        // Ignore errors for items that weren't indexed
      }
    }

    ztoolkit.log(`[MCP Plugin] Cleared index for ${clearedCount} items in collection "${collection.name}"`);

    // Refresh semantic column
    refreshSemanticColumn();

    // Show notification
    const message = `${getString("menu-collection-index-cleared" as any) || "Index cleared"}: ${collection.name} (${clearedCount})`;
    showNotification(win, message);

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error clearing collection index: ${error}`, "error");
    showNotification(win, getString("menu-semantic-index-error" as any) || "Failed to clear index");
  }
}

/**
 * Handle clearing index for selected items
 */
async function handleClearSelectedIndex(win: _ZoteroTypes.MainWindow) {
  try {
    const ZoteroPane = win.ZoteroPane;
    if (!ZoteroPane) {
      ztoolkit.log("[MCP Plugin] ZoteroPane not available", "error");
      return;
    }

    const selectedItems = ZoteroPane.getSelectedItems();
    if (!selectedItems || selectedItems.length === 0) {
      ztoolkit.log("[MCP Plugin] No items selected");
      return;
    }

    // Get item keys
    const itemKeys = selectedItems
      .filter((item: any) => item.isRegularItem?.())
      .map((item: any) => item.key);

    if (itemKeys.length === 0) {
      ztoolkit.log("[MCP Plugin] No regular items selected");
      return;
    }

    // Confirm before clearing
    const confirmMsg = getString("menu-semantic-clear-selected-confirm" as any) ||
      `Are you sure you want to clear the semantic index for ${itemKeys.length} selected item(s)?`;
    if (!win.confirm(confirmMsg)) {
      return;
    }

    ztoolkit.log(`[MCP Plugin] Clearing index for ${itemKeys.length} selected items...`);

    // Delete vectors for these items
    const { getVectorStore } = await import("./modules/semantic/vectorStore");
    const vectorStore = getVectorStore();
    await vectorStore.initialize();

    let clearedCount = 0;
    for (const itemKey of itemKeys) {
      try {
        await vectorStore.deleteItemVectors(itemKey);
        clearedCount++;
      } catch (e) {
        // Ignore errors for items that weren't indexed
      }
    }

    ztoolkit.log(`[MCP Plugin] Cleared index for ${clearedCount} items`);

    // Refresh semantic column
    refreshSemanticColumn();

    // Show notification
    const message = `${getString("menu-semantic-clear-selected-done" as any) || "Index cleared for"} ${clearedCount} ${getString("menu-semantic-items" as any) || "items"}`;
    showNotification(win, message);

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error clearing selected items index: ${error}`, "error");
    showNotification(win, getString("menu-semantic-index-error" as any) || "Failed to clear index");
  }
}

/**
 * Handle indexing selected items
 */
async function handleIndexSelected(win: _ZoteroTypes.MainWindow) {
  try {
    const ZoteroPane = win.ZoteroPane;
    if (!ZoteroPane) {
      ztoolkit.log("[MCP Plugin] ZoteroPane not available", "error");
      return;
    }

    const selectedItems = ZoteroPane.getSelectedItems();
    if (!selectedItems || selectedItems.length === 0) {
      ztoolkit.log("[MCP Plugin] No items selected");
      return;
    }

    // Get item keys
    const itemKeys = selectedItems
      .filter((item: any) => item.isRegularItem?.())
      .map((item: any) => item.key);

    if (itemKeys.length === 0) {
      ztoolkit.log("[MCP Plugin] No regular items selected");
      return;
    }

    ztoolkit.log(`[MCP Plugin] Indexing ${itemKeys.length} selected items...`);

    // Import and use semantic search service
    const { getSemanticSearchService } = await import("./modules/semantic");
    const semanticService = getSemanticSearchService();
    await semanticService.initialize();

    // Show starting notification
    showNotification(win, `${getString("menu-semantic-index-started" as any) || "Semantic indexing started"}: ${itemKeys.length} ${getString("menu-semantic-items" as any) || "items"}`);

    // Build index for selected items
    semanticService.buildIndex({
      itemKeys,
      rebuild: false,
      onProgress: (progress) => {
        ztoolkit.log(`[MCP Plugin] Index progress: ${progress.processed}/${progress.total}`);
      }
    }).then((result) => {
      ztoolkit.log(`[MCP Plugin] Indexing completed: ${result.processed}/${result.total} items`);
      // Refresh semantic column to show updated status
      refreshSemanticColumn();
      // Show success notification
      const completedMsg = `${getString("menu-semantic-index-completed" as any) || "Indexing completed"}: ${result.processed}/${result.total} ${getString("menu-semantic-items" as any) || "items"}`;
      showNotification(win, completedMsg);
    }).catch((error) => {
      ztoolkit.log(`[MCP Plugin] Indexing failed: ${error}`, "error");
      // Refresh column anyway to show current status
      refreshSemanticColumn();
      // Show error notification
      const errorMsg = `${getString("menu-semantic-index-error" as any) || "Indexing failed"}: ${error.message || error}`;
      showNotification(win, errorMsg);
    });

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error handling index selected: ${error}`, "error");
    showNotification(win, getString("menu-semantic-index-error" as any) || "Semantic indexing failed");
  }
}

/**
 * Handle indexing all items
 */
async function handleIndexAll(win: _ZoteroTypes.MainWindow) {
  try {
    ztoolkit.log("[MCP Plugin] Indexing all items...");

    // Import and use semantic search service
    const { getSemanticSearchService } = await import("./modules/semantic");
    const semanticService = getSemanticSearchService();
    await semanticService.initialize();

    // Show starting notification
    showNotification(win, getString("menu-semantic-index-started" as any) || "Semantic indexing started");

    // Build index for all items
    semanticService.buildIndex({
      rebuild: false,
      onProgress: (progress) => {
        ztoolkit.log(`[MCP Plugin] Index progress: ${progress.processed}/${progress.total}`);
      }
    }).then((result) => {
      ztoolkit.log(`[MCP Plugin] Indexing completed: ${result.processed}/${result.total} items`);
      // Refresh semantic column to show updated status
      refreshSemanticColumn();
      // Show success notification
      const completedMsg = `${getString("menu-semantic-index-completed" as any) || "Indexing completed"}: ${result.processed}/${result.total} ${getString("menu-semantic-items" as any) || "items"}`;
      showNotification(win, completedMsg);
    }).catch((error) => {
      ztoolkit.log(`[MCP Plugin] Indexing failed: ${error}`, "error");
      // Refresh column anyway to show current status
      refreshSemanticColumn();
      // Show error notification
      const errorMsg = `${getString("menu-semantic-index-error" as any) || "Indexing failed"}: ${error.message || error}`;
      showNotification(win, errorMsg);
    });

  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error handling index all: ${error}`, "error");
    showNotification(win, getString("menu-semantic-index-error" as any) || "Semantic indexing failed");
  }
}

/**
 * Show a simple notification
 */
function showNotification(win: _ZoteroTypes.MainWindow, message: string) {
  try {
    // Use Zotero's progress window for notification
    const progressWin = new Zotero.ProgressWindow({ closeOnClick: true });
    progressWin.changeHeadline("Zotero MCP");
    progressWin.addDescription(message);
    progressWin.show();
    progressWin.startCloseTimer(3000);
  } catch (error) {
    ztoolkit.log(`[MCP Plugin] Error showing notification: ${error}`, "warn");
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
