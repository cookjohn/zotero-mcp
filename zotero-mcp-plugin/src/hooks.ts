import { BasicExampleFactory } from "./modules/examples";
import { httpServer } from "./modules/httpServer"; // 使用单例导出
import { serverPreferences } from "./modules/serverPreferences";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { MCPSettingsService } from "./modules/mcpSettingsService";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Initialize MCP settings with defaults
  try {
    MCPSettingsService.initializeDefaults();
    ztoolkit.log(`===MCP=== [hooks.ts] MCP settings initialized successfully`);
  } catch (error) {
    ztoolkit.log(`===MCP=== [hooks.ts] Error initializing MCP settings: ${error}`, 'error');
  }

  // Check if this is first installation and show config prompt
  checkFirstInstallation();

  // 启动HTTP服务器
  try {
    ztoolkit.log(`===MCP=== [hooks.ts] Attempting to get server preferences...`);
    const port = serverPreferences.getPort();
    const enabled = serverPreferences.isServerEnabled();

    ztoolkit.log(
      `===MCP=== [hooks.ts] Port retrieved: ${port} (type: ${typeof port})`,
    );
    ztoolkit.log(`===MCP=== [hooks.ts] Server enabled: ${enabled}`);

    if (!enabled) {
      ztoolkit.log(`===MCP=== [hooks.ts] Server is disabled, skipping startup`);
      return;
    }

    if (!port || isNaN(port)) {
      throw new Error(`Invalid port value: ${port}`);
    }

    ztoolkit.log(
      `===MCP=== [hooks.ts] Starting HTTP server on port ${port}...`,
    );
    httpServer.start(port); // No await, let it run in background
    addon.data.httpServer = httpServer; // 保存引用以便后续使用
    ztoolkit.log(
      `===MCP=== [hooks.ts] HTTP server start initiated on port ${port}`,
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(
      `===MCP=== [hooks.ts] Failed to start HTTP server: ${err.message}`,
      "error",
    );
    Zotero.debug(
      `===MCP=== [hooks.ts] Server start error details: ${err.stack}`,
    );
  }

  // 监听偏好设置变化
  serverPreferences.addObserver(async (name) => {
    ztoolkit.log(`[MCP Plugin] Preference changed: ${name}`);

    if (name === "extensions.zotero.zotero-mcp-plugin.mcp.server.port" || name === "extensions.zotero.zotero-mcp-plugin.mcp.server.enabled") {
      try {
        // 先停止服务器
        if (httpServer.isServerRunning()) {
          ztoolkit.log("[MCP Plugin] Stopping HTTP server for restart...");
          httpServer.stop();
          ztoolkit.log("[MCP Plugin] HTTP server stopped");
        }

        // 如果启用了服务器，重新启动
        if (serverPreferences.isServerEnabled()) {
          const port = serverPreferences.getPort();
          ztoolkit.log(
            `[MCP Plugin] Restarting HTTP server on port ${port}...`,
          );
          httpServer.start(port);
          ztoolkit.log(
            `[MCP Plugin] HTTP server restarted successfully on port ${port}`,
          );
        } else {
          ztoolkit.log("[MCP Plugin] HTTP server disabled by user preference");
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ztoolkit.log(
          `[MCP Plugin] Error handling preference change: ${err.message}`,
          "error",
        );
      }
    }
  });

  BasicExampleFactory.registerPrefs();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
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
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.log("[MCP Plugin] Shutting down...");

  // 停止HTTP服务器
  try {
    if (httpServer.isServerRunning()) {
      httpServer.stop();
      ztoolkit.log("[MCP Plugin] HTTP server stopped during shutdown");
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(
      `[MCP Plugin] Error stopping server during shutdown: ${err.message}`,
      "error",
    );
  }

  serverPreferences.unregister();
  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
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
  switch (type) {
    case "load":
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
      setTimeout(() => {
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
      setTimeout(() => {
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

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
