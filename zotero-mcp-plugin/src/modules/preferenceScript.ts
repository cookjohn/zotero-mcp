import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { ClientConfigGenerator } from "./clientConfigGenerator";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Registering preference scripts...`);
  
  addon.data.prefs = { window: _window };
  
  // 诊断当前偏好设置状态
  try {
    const currentEnabled = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.enabled", true);
    const currentPort = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.port", true);
    ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Current preferences - enabled: ${currentEnabled}, port: ${currentPort}`);
    
    // 检查是否是环境兼容性问题
    const doc = _window.document;
    ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Document available: ${!!doc}`);
    
    if (doc) {
      const prefElements = doc.querySelectorAll('[preference]');
      ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Found ${prefElements.length} preference-bound elements`);
      
      // 特别检查服务器启用元素
      const serverEnabledElement = doc.querySelector('#zotero-prefpane-zotero-mcp-plugin-mcp-server-enabled');
      if (serverEnabledElement) {
        ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Server enabled element found, initial checked state: ${serverEnabledElement.hasAttribute('checked')}`);
      } else {
        ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] WARNING: Server enabled element NOT found`);
      }
    }
  } catch (error) {
    ztoolkit.log(`[PreferenceScript] [DIAGNOSTIC] Error in preference diagnostic: ${error}`, 'error');
  }
  
  bindPrefEvents();
}

function bindPrefEvents() {
  const doc = addon.data.prefs!.window.document;
  
  // Server enabled checkbox with manual event handling
  const serverEnabledCheckbox = doc?.querySelector(
    `#zotero-prefpane-${config.addonRef}-mcp-server-enabled`,
  ) as HTMLInputElement;
  
  if (serverEnabledCheckbox) {
    // Initialize checkbox state
    const currentEnabled = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.enabled", true);
    if (currentEnabled !== false) {
      serverEnabledCheckbox.setAttribute('checked', 'true');
    } else {
      serverEnabledCheckbox.removeAttribute('checked');
    }
    ztoolkit.log(`[PreferenceScript] Initialized checkbox state: ${currentEnabled}`);
    
    // Add command listener (XUL checkbox uses 'command' event)
    serverEnabledCheckbox.addEventListener("command", (event: Event) => {
      const checkbox = event.target as Element;
      const checked = checkbox.hasAttribute('checked');
      ztoolkit.log(`[PreferenceScript] Checkbox command event - checked: ${checked}`);
      
      // Update preference manually
      Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.mcp.server.enabled", checked, true);
      ztoolkit.log(`[PreferenceScript] Updated preference to: ${checked}`);
      
      // Verify the preference was set
      const verify = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.enabled", true);
      ztoolkit.log(`[PreferenceScript] Verified preference value: ${verify}`);
      
      // Directly control server since observer isn't working
      try {
        const httpServer = addon.data.httpServer;
        if (httpServer) {
          if (checked) {
            ztoolkit.log(`[PreferenceScript] Starting server manually...`);
            if (!httpServer.isServerRunning()) {
              const portPref = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.port", true);
              const port = typeof portPref === 'number' ? portPref : 23120;
              httpServer.start(port);
              ztoolkit.log(`[PreferenceScript] Server started on port ${port}`);
            }
          } else {
            ztoolkit.log(`[PreferenceScript] Stopping server manually...`);
            if (httpServer.isServerRunning()) {
              httpServer.stop();
              ztoolkit.log(`[PreferenceScript] Server stopped`);
            }
          }
        }
      } catch (error) {
        ztoolkit.log(`[PreferenceScript] Error controlling server: ${error}`, 'error');
      }
    });
    
    // Add click listener for additional debugging
    serverEnabledCheckbox.addEventListener("click", (event: Event) => {
      const checkbox = event.target as Element;
      ztoolkit.log(`[PreferenceScript] Checkbox clicked - hasAttribute('checked'): ${checkbox.hasAttribute('checked')}`);
      
      // Use setTimeout to check state after the click is processed
      setTimeout(() => {
        ztoolkit.log(`[PreferenceScript] Checkbox state after click: ${checkbox.hasAttribute('checked')}`);
      }, 10);
    });
  }
  
  // Port input validation (preference binding handled by XUL)
  const portInput = doc?.querySelector(
    `#zotero-prefpane-${config.addonRef}-mcp-server-port`,
  ) as HTMLInputElement;
  
  portInput?.addEventListener("change", () => {
    if (portInput) {
      const port = parseInt(portInput.value, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        addon.data.prefs!.window.alert(
          getString("pref-server-port-invalid" as any),
        );
        // Reset to previous valid value
        const originalPort = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.mcp.server.port", true) || 23120;
        portInput.value = originalPort.toString();
      }
    }
  });

  // Client config generation
  const clientSelect = doc?.querySelector("#client-type-select") as HTMLSelectElement;
  const serverNameInput = doc?.querySelector("#server-name-input") as HTMLInputElement;
  const generateButton = doc?.querySelector("#generate-config-button") as HTMLButtonElement;
  const copyConfigButton = doc?.querySelector("#copy-config-button") as HTMLButtonElement;
  const configOutput = doc?.querySelector("#config-output") as HTMLTextAreaElement;
  const configGuide = doc?.querySelector("#config-guide") as HTMLElement;

  let currentConfig = "";
  let currentGuide = "";

  generateButton?.addEventListener("click", () => {
    try {
      const clientType = clientSelect?.value || "claude-desktop";
      const serverName = serverNameInput?.value?.trim() || "zotero-mcp";
      const port = parseInt(portInput?.value || "23120", 10);

      // Generate configuration
      currentConfig = ClientConfigGenerator.generateConfig(clientType, port, serverName);
      currentGuide = ClientConfigGenerator.generateFullGuide(clientType, port, serverName);

      // Display configuration in textarea
      configOutput.value = currentConfig;

      // Display guide in separate area
      displayGuideInArea(currentGuide);

      // Enable copy button
      copyConfigButton.disabled = false;

      ztoolkit.log(`[PreferenceScript] Generated config for ${clientType}`);
    } catch (error) {
      addon.data.prefs!.window.alert(`配置生成失败: ${error}`);
      ztoolkit.log(`[PreferenceScript] Config generation failed: ${error}`, "error");
    }
  });

  copyConfigButton?.addEventListener("click", async () => {
    try {
      const success = await ClientConfigGenerator.copyToClipboard(currentConfig);
      if (success) {
        // Show temporary success message
        const originalText = copyConfigButton.textContent;
        copyConfigButton.textContent = "已复制!";
        copyConfigButton.style.backgroundColor = "#4CAF50";
        setTimeout(() => {
          copyConfigButton.textContent = originalText;
          copyConfigButton.style.backgroundColor = "";
        }, 2000);
      } else {
        // Auto-select text in textarea for manual copy
        configOutput.select();
        configOutput.focus();
        addon.data.prefs!.window.alert("自动复制失败，已选中文本，请使用 Ctrl+C 手动复制");
      }
    } catch (error) {
      // Auto-select text in textarea for manual copy
      configOutput.select();
      configOutput.focus();
      addon.data.prefs!.window.alert(`复制失败，已选中文本，请使用 Ctrl+C 手动复制\n错误: ${error}`);
      ztoolkit.log(`[PreferenceScript] Copy failed: ${error}`, "error");
    }
  });


  // Helper function to display guide in separate area
  function displayGuideInArea(guide: string) {
    if (!configGuide) return;
    
    try {
      // Use safe text content to avoid any HTML parsing issues
      configGuide.textContent = guide;
      configGuide.style.whiteSpace = "pre-wrap";
      configGuide.style.fontFamily = "monospace, 'Courier New', Courier";
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Error displaying guide: ${error}`, "error");
      configGuide.textContent = "配置指南显示出错，请尝试重新生成配置。";
    }
  }

  // Auto-generate config when client type changes
  clientSelect?.addEventListener("change", () => {
    if (currentConfig) {
      generateButton?.click();
    }
  });

  // Auto-generate config when server name changes
  serverNameInput?.addEventListener("input", () => {
    if (currentConfig) {
      generateButton?.click();
    }
  });

  // ============ Semantic Search Toggle ============
  bindSemanticEnabledToggle(doc);

  // ============ Embedding API Settings ============
  bindEmbeddingSettings(doc);

  // ============ API Usage Stats ============
  bindApiUsageStats(doc);

  // ============ Semantic Index Stats ============
  bindSemanticStatsSettings(doc);
}

const PREF_SEMANTIC_ENABLED = 'extensions.zotero.zotero-mcp-plugin.semantic.enabled';

/**
 * Bind semantic search enable/disable toggle
 */
function bindSemanticEnabledToggle(doc: Document) {
  const checkbox = doc?.querySelector(
    `#zotero-prefpane-${config.addonRef}-semantic-enabled`,
  ) as HTMLInputElement;
  const settingsContainer = doc?.querySelector('#semantic-settings-container') as HTMLElement;
  const statsGroupbox = doc?.querySelector('#semantic-stats-groupbox') as HTMLElement;

  if (!checkbox) return;

  function updateSemanticUI(enabled: boolean) {
    if (settingsContainer) {
      settingsContainer.style.display = enabled ? '' : 'none';
    }
    if (statsGroupbox) {
      statsGroupbox.style.display = enabled ? '' : 'none';
    }
  }

  // Initialize state
  const currentEnabled = Zotero.Prefs.get(PREF_SEMANTIC_ENABLED, true);
  if (currentEnabled === undefined) {
    // Default to false (disabled) if not set
    Zotero.Prefs.set(PREF_SEMANTIC_ENABLED, false, true);
  }
  const isEnabled = currentEnabled !== false && currentEnabled !== undefined;

  if (isEnabled) {
    checkbox.setAttribute('checked', 'true');
  } else {
    checkbox.removeAttribute('checked');
  }
  updateSemanticUI(isEnabled);

  // Listen for toggle
  checkbox.addEventListener("command", (event: Event) => {
    const el = event.target as Element;
    const checked = el.hasAttribute('checked');
    Zotero.Prefs.set(PREF_SEMANTIC_ENABLED, checked, true);
    updateSemanticUI(checked);
    ztoolkit.log(`[PreferenceScript] Semantic search ${checked ? 'enabled' : 'disabled'}`);
  });
}

// Embedding provider presets - only apiBase and hints, model/dimensions filled by user
const EMBEDDING_PROVIDER_PRESETS: Record<string, { apiBase: string; modelPlaceholder: string; needsApiKey: boolean }> = {
  openai: {
    apiBase: "https://api.openai.com/v1",
    modelPlaceholder: "text-embedding-3-small",
    needsApiKey: true
  },
  google: {
    apiBase: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelPlaceholder: "gemini-embedding-001",
    needsApiKey: true
  },
  alibaba: {
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelPlaceholder: "text-embedding-v3",
    needsApiKey: true
  },
  zhipu: {
    apiBase: "https://open.bigmodel.cn/api/paas/v4",
    modelPlaceholder: "embedding-3",
    needsApiKey: true
  },
  openrouter: {
    apiBase: "https://openrouter.ai/api/v1",
    modelPlaceholder: "openai/text-embedding-3-small",
    needsApiKey: true
  },
  siliconflow: {
    apiBase: "https://api.siliconflow.cn/v1",
    modelPlaceholder: "BAAI/bge-m3",
    needsApiKey: true
  },
  voyage: {
    apiBase: "https://api.voyageai.com/v1",
    modelPlaceholder: "voyage-3-lite",
    needsApiKey: true
  },
  ollama: {
    apiBase: "http://localhost:11434/v1",
    modelPlaceholder: "nomic-embed-text",
    needsApiKey: false
  }
};

/**
 * Bind embedding API settings handlers
 */
function bindEmbeddingSettings(doc: Document) {
  const providerSelect = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-provider`) as HTMLSelectElement;
  const apiBaseInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-api-base`) as HTMLInputElement;
  const apiKeyInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-api-key`) as HTMLInputElement;
  const modelInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-model`) as HTMLInputElement;
  const dimensionsInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-dimensions`) as HTMLInputElement;
  const dimensionsRow = dimensionsInput?.closest('hbox') || dimensionsInput?.parentElement;
  const testButton = doc?.querySelector("#test-embedding-button") as HTMLButtonElement;
  const testResult = doc?.querySelector("#embedding-test-result") as HTMLSpanElement;

  // Detect current provider from saved apiBase
  const detectProvider = (apiBase: string): string => {
    for (const [key, preset] of Object.entries(EMBEDDING_PROVIDER_PRESETS)) {
      try {
        if (apiBase && apiBase.includes(new URL(preset.apiBase).hostname)) {
          return key;
        }
      } catch {
        // Invalid URL, continue
      }
    }
    return "custom";
  };

  // Initialize provider select from saved apiBase
  if (providerSelect) {
    const savedApiBase = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.apiBase", true) as string;
    providerSelect.value = detectProvider(savedApiBase || "");
  }

  // Initialize input values from preferences
  const initValue = (input: HTMLInputElement, prefKey: string, defaultValue: string) => {
    if (input) {
      const value = Zotero.Prefs.get(prefKey, true);
      input.value = value ? String(value) : defaultValue;
    }
  };

  initValue(apiBaseInput, "extensions.zotero.zotero-mcp-plugin.embedding.apiBase", "https://api.openai.com/v1");
  initValue(apiKeyInput, "extensions.zotero.zotero-mcp-plugin.embedding.apiKey", "");
  initValue(modelInput, "extensions.zotero.zotero-mcp-plugin.embedding.model", "text-embedding-3-small");
  initValue(dimensionsInput, "extensions.zotero.zotero-mcp-plugin.embedding.dimensions", "512");

  // Check if model supports custom dimensions
  const supportsCustomDimensions = (model: string) => model.includes('text-embedding-3');

  // Update dimensions input visibility based on model
  const updateDimensionsVisibility = () => {
    const model = modelInput?.value || "";
    const supportsCustom = supportsCustomDimensions(model);

    if (dimensionsInput) {
      dimensionsInput.disabled = !supportsCustom;
      if (!supportsCustom) {
        dimensionsInput.placeholder = getString("pref-embedding-dimensions-auto" as any) || "Auto";
      } else {
        dimensionsInput.placeholder = "";
      }
    }

    // Show hint text about dimensions
    if (dimensionsRow && testResult) {
      if (!supportsCustom) {
        // For non-supporting models, show info about auto-detection
        const detectedDims = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.detectedDimensions", true);
        if (detectedDims) {
          testResult.textContent = `${getString("pref-embedding-detected-dims" as any) || "Detected dimensions"}: ${detectedDims}`;
          testResult.style.color = "#666";
        }
      }
    }
  };

  // Initial visibility update
  updateDimensionsVisibility();

  // Handle provider preset selection change
  if (providerSelect) {
    providerSelect.addEventListener("change", () => {
      const provider = providerSelect.value;
      if (provider !== "custom" && EMBEDDING_PROVIDER_PRESETS[provider]) {
        const preset = EMBEDDING_PROVIDER_PRESETS[provider];

        // Only fill in API Base URL
        if (apiBaseInput) {
          apiBaseInput.value = preset.apiBase;
          Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.embedding.apiBase", preset.apiBase, true);
        }

        // Update model placeholder hint (don't change the value)
        if (modelInput) {
          modelInput.placeholder = preset.modelPlaceholder;
        }

        // Update API key placeholder hint based on whether it's needed
        if (apiKeyInput) {
          apiKeyInput.placeholder = preset.needsApiKey ? "sk-..." : getString("pref-embedding-api-key-optional" as any) || "(Optional)";
        }

        // Update embedding service config
        updateEmbeddingServiceConfig();

        ztoolkit.log(`[PreferenceScript] Applied provider preset: ${provider}`);
      }
    });
  }

  // Save preference on change
  const bindSave = (input: HTMLInputElement, prefKey: string, isNumber = false) => {
    input?.addEventListener("change", () => {
      const value = isNumber ? parseInt(input.value, 10) : input.value;
      Zotero.Prefs.set(prefKey, value, true);
      ztoolkit.log(`[PreferenceScript] Saved embedding pref: ${prefKey} = ${value}`);

      // Update embedding service config
      updateEmbeddingServiceConfig();
    });
  };

  bindSave(apiBaseInput, "extensions.zotero.zotero-mcp-plugin.embedding.apiBase");
  bindSave(apiKeyInput, "extensions.zotero.zotero-mcp-plugin.embedding.apiKey");
  bindSave(dimensionsInput, "extensions.zotero.zotero-mcp-plugin.embedding.dimensions", true);

  // Model change handler - update dimensions visibility and clear detected dimensions
  modelInput?.addEventListener("change", async () => {
    const model = modelInput.value;
    Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.embedding.model", model, true);
    ztoolkit.log(`[PreferenceScript] Saved embedding pref: model = ${model}`);

    // Clear detected dimensions when model changes
    try {
      const { getEmbeddingService } = require("./semantic/embeddingService");
      const embeddingService = getEmbeddingService();
      embeddingService.clearDetectedDimensions();
    } catch (e) {
      // Ignore
    }

    // Check if there are existing indexed vectors - warn user about potential incompatibility
    try {
      const { getVectorStore } = require("./semantic/vectorStore");
      const vectorStore = getVectorStore();
      await vectorStore.initialize();
      const stats = await vectorStore.getStats();
      if (stats.totalVectors > 0) {
        // Show warning alert
        addon.data.prefs!.window.alert(
          getString("pref-embedding-model-change-warning" as any) ||
          "模型已更改，已有索引可能不兼容。请测试连接后重建索引。\n\nModel changed. Existing index may be incompatible. Please test connection and rebuild index."
        );
      }
    } catch (e) {
      ztoolkit.log(`[PreferenceScript] Failed to check existing index: ${e}`, 'warn');
    }

    // Update visibility
    updateDimensionsVisibility();

    // Update embedding service config
    updateEmbeddingServiceConfig();
  });

  // Test connection button
  testButton?.addEventListener("click", async () => {
    testResult.textContent = getString("pref-embedding-testing" as any) || "Testing...";
    testResult.style.color = "#666";
    testButton.disabled = true;

    try {
      // Get current values from inputs (not saved prefs) for testing
      const apiBase = apiBaseInput?.value?.trim() || "";
      const apiKey = apiKeyInput?.value || "";
      const model = modelInput?.value?.trim() || "";

      if (!apiBase || !model) {
        testResult.textContent = getString("pref-embedding-test-failed" as any) + ": Missing API Base or Model";
        testResult.style.color = "#d32f2f";
        testButton.disabled = false;
        return;
      }

      // Test the connection using Zotero.HTTP
      const url = `${apiBase}/embeddings`;
      const response = await Zotero.HTTP.request('POST', url, {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model: model,
          input: ["test"]
        }),
        timeout: 30000,
        responseType: 'json'
      });

      const data = response.response;
      if (data && data.data && data.data.length > 0) {
        const dims = data.data[0].embedding?.length || 0;

        // Check if stored vectors have different dimensions
        let storedDims: number | null = null;
        let hasStoredVectors = false;
        try {
          const { getVectorStore } = require("./semantic/vectorStore");
          const vectorStore = getVectorStore();
          await vectorStore.initialize();
          const stats = await vectorStore.getStats();
          storedDims = stats.storedDimensions || null;
          hasStoredVectors = stats.totalVectors > 0;
        } catch (e) {
          // Ignore errors checking stored dimensions
        }

        // Decide whether to update dimensions based on stored vectors
        if (hasStoredVectors && storedDims && storedDims !== dims) {
          // Dimension mismatch with existing index - warn but don't auto-update
          testResult.textContent = `${getString("pref-embedding-test-success" as any)} (${dims} dims) - ⚠️ ${getString("pref-embedding-dimension-mismatch" as any) || `Index has ${storedDims} dims, API returns ${dims} dims. Rebuild index to use new dimensions.`}`;
          testResult.style.color = "#ef6c00";

          // Save detected dimensions but don't update config dimensions
          Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.embedding.detectedDimensions", dims, true);
        } else {
          // No mismatch or no existing vectors - safe to update
          testResult.textContent = getString("pref-embedding-test-success" as any) + ` (${dims} dims)`;
          testResult.style.color = "#2e7d32";

          // Update dimensions
          if (dims > 0) {
            // Save detected dimensions
            Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.embedding.detectedDimensions", dims, true);

            // Only update config dimensions for models that support custom dimensions
            if (supportsCustomDimensions(model) && dimensionsInput) {
              dimensionsInput.value = String(dims);
              Zotero.Prefs.set("extensions.zotero.zotero-mcp-plugin.embedding.dimensions", dims, true);
            }

            // Update embedding service
            try {
              const { getEmbeddingService } = require("./semantic/embeddingService");
              const embeddingService = getEmbeddingService();
              embeddingService.updateConfig({ dimensions: dims });
            } catch (e) {
              // Ignore
            }
          }
        }
      } else {
        testResult.textContent = getString("pref-embedding-test-failed" as any) + ": Invalid response";
        testResult.style.color = "#d32f2f";
      }
    } catch (error: any) {
      const errorMsg = error.message || error.status || String(error);
      testResult.textContent = getString("pref-embedding-test-failed" as any) + `: ${errorMsg.substring(0, 50)}`;
      testResult.style.color = "#d32f2f";
      ztoolkit.log(`[PreferenceScript] Embedding test failed: ${error}`, "warn");
    } finally {
      testButton.disabled = false;
    }
  });
}

/**
 * Update embedding service configuration from preferences
 */
function updateEmbeddingServiceConfig() {
  try {
    // Import and update embedding service
    const { getEmbeddingService } = require("./semantic/embeddingService");
    const embeddingService = getEmbeddingService();

    const apiBase = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.apiBase", true) || "";
    const apiKey = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.apiKey", true) || "";
    const model = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.model", true) || "";
    const dimensions = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.dimensions", true);

    embeddingService.updateConfig({
      apiBase: apiBase as string,
      apiKey: apiKey as string,
      model: model as string,
      dimensions: dimensions ? parseInt(String(dimensions), 10) : undefined
    });

    ztoolkit.log(`[PreferenceScript] Updated embedding service config`);
  } catch (error) {
    ztoolkit.log(`[PreferenceScript] Failed to update embedding service: ${error}`, "warn");
  }
}

/**
 * Bind API usage stats display handlers
 */
function bindApiUsageStats(doc: Document) {
  // Rate limit inputs
  const rpmInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-rpm`) as HTMLInputElement;
  const tpmInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-tpm`) as HTMLInputElement;
  const costInput = doc?.querySelector(`#zotero-prefpane-${config.addonRef}-embedding-cost`) as HTMLInputElement;

  // Usage stats elements
  const totalTokensEl = doc?.querySelector("#api-usage-total-tokens") as HTMLElement;
  const totalRequestsEl = doc?.querySelector("#api-usage-total-requests") as HTMLElement;
  const totalTextsEl = doc?.querySelector("#api-usage-total-texts") as HTMLElement;
  const estimatedCostEl = doc?.querySelector("#api-usage-estimated-cost") as HTMLElement;
  const sessionTokensEl = doc?.querySelector("#api-usage-session-tokens") as HTMLElement;
  const sessionRequestsEl = doc?.querySelector("#api-usage-session-requests") as HTMLElement;
  const currentRpmEl = doc?.querySelector("#api-usage-current-rpm") as HTMLElement;
  const currentTpmEl = doc?.querySelector("#api-usage-current-tpm") as HTMLElement;
  const rateLimitHitsEl = doc?.querySelector("#api-usage-rate-limit-hits") as HTMLElement;

  // Buttons
  const refreshButton = doc?.querySelector("#refresh-api-usage-button") as HTMLButtonElement;
  const resetButton = doc?.querySelector("#reset-api-usage-button") as HTMLButtonElement;

  // Initialize rate limit inputs from preferences
  const initRateLimitValue = (input: HTMLInputElement, prefKey: string, defaultValue: string) => {
    if (input) {
      const value = Zotero.Prefs.get(prefKey, true);
      input.value = value !== undefined && value !== null ? String(value) : defaultValue;
    }
  };

  initRateLimitValue(rpmInput, "extensions.zotero.zotero-mcp-plugin.embedding.rpm", "60");
  initRateLimitValue(tpmInput, "extensions.zotero.zotero-mcp-plugin.embedding.tpm", "150000");
  initRateLimitValue(costInput, "extensions.zotero.zotero-mcp-plugin.embedding.costPer1M", "0.02");

  // Save rate limit on change
  const bindRateLimitSave = (input: HTMLInputElement, prefKey: string, isFloat = false) => {
    input?.addEventListener("change", () => {
      let value: number;
      if (isFloat) {
        value = parseFloat(input.value) || 0;
      } else {
        value = parseInt(input.value, 10) || 0;
      }
      Zotero.Prefs.set(prefKey, isFloat ? String(value) : value, true);
      ztoolkit.log(`[PreferenceScript] Saved rate limit pref: ${prefKey} = ${value}`);

      // Update embedding service rate limit config
      updateEmbeddingServiceRateLimits();
    });
  };

  bindRateLimitSave(rpmInput, "extensions.zotero.zotero-mcp-plugin.embedding.rpm");
  bindRateLimitSave(tpmInput, "extensions.zotero.zotero-mcp-plugin.embedding.tpm");
  bindRateLimitSave(costInput, "extensions.zotero.zotero-mcp-plugin.embedding.costPer1M", true);

  // Load usage stats on page load
  loadApiUsageStats();

  // Refresh button
  refreshButton?.addEventListener("click", () => {
    loadApiUsageStats();
  });

  // Reset button
  resetButton?.addEventListener("click", () => {
    const confirmMsg = getString("pref-api-usage-reset-confirm" as any) || "Are you sure you want to reset all API usage statistics?";
    if (addon.data.prefs!.window.confirm(confirmMsg)) {
      resetApiUsageStats();
    }
  });

  async function loadApiUsageStats() {
    try {
      const { getEmbeddingService } = require("./semantic/embeddingService");
      const embeddingService = getEmbeddingService();

      // Ensure service is initialized to load persisted stats
      await embeddingService.initialize();

      const stats = embeddingService.getUsageStats();

      // Format numbers with thousands separator
      const formatNum = (n: number) => n.toLocaleString();

      // Update UI elements
      if (totalTokensEl) totalTokensEl.textContent = formatNum(stats.totalTokens);
      if (totalRequestsEl) totalRequestsEl.textContent = formatNum(stats.totalRequests);
      if (totalTextsEl) totalTextsEl.textContent = formatNum(stats.totalTexts);
      if (estimatedCostEl) estimatedCostEl.textContent = `$${stats.estimatedCostUsd.toFixed(4)}`;
      if (sessionTokensEl) sessionTokensEl.textContent = formatNum(stats.sessionTokens);
      if (sessionRequestsEl) sessionRequestsEl.textContent = formatNum(stats.sessionRequests);
      if (currentRpmEl) currentRpmEl.textContent = `${stats.currentRpm}`;
      if (currentTpmEl) currentTpmEl.textContent = formatNum(stats.currentTpm);
      if (rateLimitHitsEl) rateLimitHitsEl.textContent = formatNum(stats.rateLimitHits);

      ztoolkit.log(`[PreferenceScript] Loaded API usage stats: ${stats.totalTokens} tokens, ${stats.totalRequests} requests`);
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to load API usage stats: ${error}`, "warn");
      // Show error state
      if (totalTokensEl) totalTokensEl.textContent = "-";
      if (totalRequestsEl) totalRequestsEl.textContent = "-";
    }
  }

  async function resetApiUsageStats() {
    try {
      const { getEmbeddingService } = require("./semantic/embeddingService");
      const embeddingService = getEmbeddingService();

      // Ensure service is initialized
      await embeddingService.initialize();

      embeddingService.resetUsageStats(true); // Reset cumulative stats

      // Reload display
      await loadApiUsageStats();

      ztoolkit.log("[PreferenceScript] Reset API usage stats");
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to reset API usage stats: ${error}`, "warn");
    }
  }
}

/**
 * Update embedding service rate limit configuration from preferences
 */
function updateEmbeddingServiceRateLimits() {
  try {
    const { getEmbeddingService } = require("./semantic/embeddingService");
    const embeddingService = getEmbeddingService();

    const rpm = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.rpm", true);
    const tpm = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.tpm", true);
    const costPer1M = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.costPer1M", true);

    embeddingService.setRateLimitConfig({
      rpm: rpm ? parseInt(String(rpm), 10) : 60,
      tpm: tpm ? parseInt(String(tpm), 10) : 150000,
      costPer1MTokens: costPer1M ? parseFloat(String(costPer1M)) : 0.02
    });

    ztoolkit.log(`[PreferenceScript] Updated embedding service rate limits`);
  } catch (error) {
    ztoolkit.log(`[PreferenceScript] Failed to update rate limits: ${error}`, "warn");
  }
}

/**
 * Bind semantic stats display handlers
 */
function bindSemanticStatsSettings(doc: Document) {
  const loadingEl = doc?.querySelector("#semantic-stats-loading") as HTMLElement;
  const contentEl = doc?.querySelector("#semantic-stats-content") as HTMLElement;
  const refreshButton = doc?.querySelector("#refresh-semantic-stats-button") as HTMLButtonElement;

  const totalItemsEl = doc?.querySelector("#semantic-stats-total-items") as HTMLElement;
  const totalVectorsEl = doc?.querySelector("#semantic-stats-total-vectors") as HTMLElement;
  const zhVectorsEl = doc?.querySelector("#semantic-stats-zh-vectors") as HTMLElement;
  const enVectorsEl = doc?.querySelector("#semantic-stats-en-vectors") as HTMLElement;
  const cachedItemsEl = doc?.querySelector("#semantic-stats-cached-items") as HTMLElement;
  const cacheSizeEl = doc?.querySelector("#semantic-stats-cache-size") as HTMLElement;
  const dbSizeEl = doc?.querySelector("#semantic-stats-db-size") as HTMLElement;
  const dimensionsEl = doc?.querySelector("#semantic-stats-dimensions") as HTMLElement;
  const int8StatusEl = doc?.querySelector("#semantic-stats-int8-status") as HTMLElement;
  const statusEl = doc?.querySelector("#semantic-stats-status") as HTMLElement;

  // Index control elements
  const buildButton = doc?.querySelector("#build-semantic-index-button") as HTMLButtonElement;
  const rebuildButton = doc?.querySelector("#rebuild-semantic-index-button") as HTMLButtonElement;
  const clearButton = doc?.querySelector("#clear-semantic-index-button") as HTMLButtonElement;
  const pauseButton = doc?.querySelector("#pause-semantic-index-button") as HTMLButtonElement;
  const resumeButton = doc?.querySelector("#resume-semantic-index-button") as HTMLButtonElement;
  const abortButton = doc?.querySelector("#abort-semantic-index-button") as HTMLButtonElement;
  const progressContainer = doc?.querySelector("#semantic-index-progress-container") as HTMLElement;
  const progressText = doc?.querySelector("#semantic-index-progress-text") as HTMLElement;
  const progressPercent = doc?.querySelector("#semantic-index-progress-percent") as HTMLElement;
  const progressBar = doc?.querySelector("#semantic-index-progress-bar") as HTMLElement;
  const currentItemEl = doc?.querySelector("#semantic-index-current-item") as HTMLElement;
  const etaEl = doc?.querySelector("#semantic-index-eta") as HTMLElement;
  const messageEl = doc?.querySelector("#semantic-index-message") as HTMLElement;

  let isIndexing = false;
  let progressUpdateInterval: ReturnType<typeof setInterval> | null = null;
  let lastErrorInfo: { message: string; type: string; retryable: boolean } | null = null;
  let messageTimeout: ReturnType<typeof setTimeout> | null = null;

  // Load stats on page load
  loadSemanticStats();

  // Register error callback for semantic service
  registerErrorCallback();

  // Refresh button
  refreshButton?.addEventListener("click", () => {
    loadSemanticStats();
  });

  // Build index button
  buildButton?.addEventListener("click", () => {
    startIndexing(false);
  });

  // Rebuild index button
  rebuildButton?.addEventListener("click", () => {
    const confirmMsg = getString("pref-semantic-index-confirm-rebuild" as any) || "This will rebuild the entire index. Are you sure?";
    if (addon.data.prefs!.window.confirm(confirmMsg)) {
      startIndexing(true);
    }
  });

  // Pause button
  pauseButton?.addEventListener("click", () => {
    try {
      ztoolkit.log("[PreferenceScript] Pause button clicked");

      // Stop progress updates FIRST to prevent any race conditions
      // (interval callback might be running async and could reset buttons)
      stopProgressUpdates();

      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();

      // Check current status before pausing
      const beforeProgress = semanticService.getIndexProgress();
      ztoolkit.log(`[PreferenceScript] Before pause: status=${beforeProgress.status}`);

      semanticService.pauseIndex();

      // Verify pause took effect
      const afterProgress = semanticService.getIndexProgress();
      ztoolkit.log(`[PreferenceScript] After pause: status=${afterProgress.status}`);

      if (afterProgress.status === 'paused') {
        updateControlButtons('paused');
        showMessage(getString("pref-semantic-index-paused" as any) || "Indexing paused", "warning");
      } else {
        ztoolkit.log(`[PreferenceScript] Pause did not take effect, status is still: ${afterProgress.status}`, "warn");
        // Restart progress updates if pause failed
        startProgressUpdates();
      }
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to pause indexing: ${error}`, "warn");
    }
  });

  // Resume button
  resumeButton?.addEventListener("click", async () => {
    try {
      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();

      // Check current status
      const progress = semanticService.getIndexProgress();

      // Clear error info since we're resuming
      lastErrorInfo = null;

      // Hide any error message displayed
      if (messageEl) messageEl.style.display = "none";

      // Reset status display color
      if (statusEl) statusEl.style.color = "";

      // Check if this is a resume after restart or error (no active build process)
      // We detect this by checking if isIndexing is false but status is paused/error
      if (!isIndexing && (progress.status === 'paused' || progress.status === 'error')) {
        // Resume after restart/error - need to start a new build process
        ztoolkit.log(`[PreferenceScript] Resuming index after ${progress.status} - starting new build process`);
        isIndexing = true;

        // Reset the paused/error state
        semanticService.resumeIndex();
        updateControlButtons('indexing');
        showMessage(getString("pref-semantic-index-started" as any) || "Indexing resumed...", "info");

        // Show progress UI
        if (progressContainer) progressContainer.style.display = "block";

        // Start progress updates
        startProgressUpdates();

        // Start a new build (not rebuild) to continue from where we left off
        await semanticService.buildIndex({
          rebuild: false,  // Don't rebuild, just continue with unindexed items
          onProgress: (p: any) => {
            updateProgress(p);
            if (p.status === 'completed' || p.status === 'aborted') {
              stopProgressUpdates();
              updateControlButtons('idle');
              isIndexing = false;
              loadSemanticStats();

              if (p.status === 'completed') {
                // Check if there are any failed items
                const failedItems = semanticService.getFailedItems();
                if (failedItems.length > 0) {
                  showMessage(
                    `${getString("pref-semantic-index-completed" as any) || "Indexing completed"} (${failedItems.length} ${getString("pref-semantic-index-failed-items" as any) || "items failed"})`,
                    "warning"
                  );
                } else {
                  showMessage(getString("pref-semantic-index-completed" as any) || "Indexing completed!", "success");
                }
              }
            }
            // Note: error state is handled by the error callback, not here
          }
        });
      } else {
        // Normal resume during active session
        semanticService.resumeIndex();
        updateControlButtons('indexing');
        showMessage(getString("pref-semantic-index-started" as any) || "Indexing resumed...", "info");
        // Restart progress updates (they were stopped when pausing)
        startProgressUpdates();
      }
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to resume indexing: ${error}`, "warn");
      isIndexing = false;
      updateControlButtons('idle');
    }
  });

  // Abort button
  abortButton?.addEventListener("click", () => {
    try {
      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();
      semanticService.abortIndex();
      updateControlButtons('idle');
      showMessage(getString("pref-semantic-index-aborted" as any) || "Indexing aborted", "warning");
      stopProgressUpdates();
      isIndexing = false;
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to abort indexing: ${error}`, "warn");
    }
  });

  // Clear index button
  clearButton?.addEventListener("click", async () => {
    const confirmMsg = getString("pref-semantic-index-confirm-clear" as any) || "This will clear all index data (content cache will be preserved). Are you sure?";
    if (!addon.data.prefs!.window.confirm(confirmMsg)) {
      return;
    }

    try {
      const { getVectorStore } = require("./semantic/vectorStore");
      const vectorStore = getVectorStore();
      await vectorStore.initialize();
      await vectorStore.clear();

      showMessage(getString("pref-semantic-index-cleared" as any) || "Index cleared", "success");
      ztoolkit.log("[PreferenceScript] Index cleared successfully");

      // Reload stats to show updated state
      loadSemanticStats();
    } catch (error) {
      showMessage(getString("pref-semantic-index-error" as any) + `: ${error}`, "error");
      ztoolkit.log(`[PreferenceScript] Failed to clear index: ${error}`, "error");
    }
  });

  async function startIndexing(rebuild: boolean) {
    if (isIndexing) return;
    isIndexing = true;

    try {
      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();

      // Initialize if needed
      await semanticService.initialize();

      // Show progress UI
      if (progressContainer) progressContainer.style.display = "block";
      updateControlButtons('indexing');
      showMessage(getString("pref-semantic-index-started" as any) || "Indexing started...", "info");

      // Start progress updates
      startProgressUpdates();

      // Build index with progress callback
      const result = await semanticService.buildIndex({
        rebuild,
        onProgress: (progress: any) => {
          updateProgress(progress);
        }
      });

      // Indexing completed
      isIndexing = false;
      stopProgressUpdates();
      updateControlButtons('idle');

      if (result.status === 'completed') {
        if (result.total === 0) {
          showMessage(getString("pref-semantic-index-no-items" as any) || "No items need indexing", "info");
        } else {
          // Check for failed items
          const failedItems = semanticService.getFailedItems();
          if (failedItems.length > 0) {
            showMessage(
              `${getString("pref-semantic-index-completed" as any) || "Indexing completed"} (${result.processed}/${result.total}, ${failedItems.length} ${getString("pref-semantic-index-failed-items" as any) || "items failed"})`,
              "warning"
            );
          } else {
            showMessage(getString("pref-semantic-index-completed" as any) + ` (${result.processed}/${result.total})`, "success");
          }
        }
      } else if (result.status === 'aborted') {
        showMessage(getString("pref-semantic-index-aborted" as any) || "Indexing aborted", "warning");
      } else if (result.status === 'error') {
        // Error is already shown by the error callback, but show additional info if available
        if (result.error && !lastErrorInfo) {
          showMessage(getString("pref-semantic-index-error" as any) + `: ${result.error}`, "error");
        }
      }

      // Reload stats
      loadSemanticStats();

    } catch (error) {
      isIndexing = false;
      stopProgressUpdates();
      updateControlButtons('idle');
      showMessage(getString("pref-semantic-index-error" as any) + `: ${error}`, "error");
      ztoolkit.log(`[PreferenceScript] Index building failed: ${error}`, "error");
    }
  }

  function updateProgress(progress: any) {
    if (progressText) {
      progressText.textContent = `${progress.processed}/${progress.total}`;
    }

    if (progressPercent && progress.total > 0) {
      const percent = Math.round((progress.processed / progress.total) * 100);
      progressPercent.textContent = `(${percent}%)`;
    }

    if (progressBar && progress.total > 0) {
      const percent = Math.round((progress.processed / progress.total) * 100);
      progressBar.style.width = `${percent}%`;
    }

    if (currentItemEl && progress.currentItem) {
      currentItemEl.textContent = progress.currentItem;
    }

    if (etaEl && progress.estimatedRemaining) {
      etaEl.textContent = formatTime(progress.estimatedRemaining);
    }
  }

  function formatTime(ms: number): string {
    if (ms < 1000) return "< 1s";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  function updateControlButtons(status: 'idle' | 'indexing' | 'paused') {
    if (buildButton) buildButton.style.display = status === 'idle' ? '' : 'none';
    if (rebuildButton) rebuildButton.style.display = status === 'idle' ? '' : 'none';
    if (clearButton) clearButton.style.display = status === 'idle' ? '' : 'none';
    if (pauseButton) pauseButton.style.display = status === 'indexing' ? '' : 'none';
    if (resumeButton) resumeButton.style.display = status === 'paused' ? '' : 'none';
    if (abortButton) abortButton.style.display = (status === 'indexing' || status === 'paused') ? '' : 'none';
  }

  function showMessage(text: string, type: 'info' | 'success' | 'warning' | 'error') {
    if (!messageEl) return;

    // Clear any pending timeout to prevent previous messages from hiding this one
    if (messageTimeout) {
      clearTimeout(messageTimeout);
      messageTimeout = null;
    }

    messageEl.textContent = text;
    messageEl.style.display = "block";

    // Set style based on type
    const colors: Record<string, { bg: string; text: string }> = {
      info: { bg: "#e3f2fd", text: "#1565c0" },
      success: { bg: "#e8f5e9", text: "#2e7d32" },
      warning: { bg: "#fff3e0", text: "#ef6c00" },
      error: { bg: "#ffebee", text: "#c62828" }
    };

    const color = colors[type] || colors.info;
    messageEl.style.backgroundColor = color.bg;
    messageEl.style.color = color.text;

    // Auto-hide after 5 seconds for non-error messages
    // Error messages persist until manually cleared or another message is shown
    if (type !== 'error') {
      messageTimeout = setTimeout(() => {
        if (messageEl) messageEl.style.display = "none";
        messageTimeout = null;
      }, 5000);
    }
  }

  function startProgressUpdates() {
    if (progressUpdateInterval) {
      ztoolkit.log(`[PreferenceScript] startProgressUpdates: interval already exists, skipping`);
      return;
    }

    ztoolkit.log(`[PreferenceScript] startProgressUpdates: starting progress update interval`);

    progressUpdateInterval = setInterval(() => {
      try {
        const { getSemanticSearchService } = require("./semantic");
        const semanticService = getSemanticSearchService();
        const progress = semanticService.getIndexProgress();

        // Update progress UI
        updateProgress(progress);

        // Update status text
        if (statusEl) {
          statusEl.textContent = getStatusText(progress.status);
        }

        // Update control buttons based on status
        if (progressUpdateInterval) {
          if (progress.status === 'paused' || progress.status === 'error') {
            updateControlButtons('paused');
          } else if (progress.status === 'indexing') {
            updateControlButtons('indexing');
          }
        }

        // Log progress periodically (every 5 seconds) for debugging
        if (progress.processed % 5 === 0 && progress.processed > 0) {
          ztoolkit.log(`[PreferenceScript] Progress update: ${progress.processed}/${progress.total} (${progress.status})`);
        }
      } catch (error) {
        ztoolkit.log(`[PreferenceScript] Progress update error: ${error}`, 'warn');
      }
    }, 500);  // Update every 500ms for smoother progress
  }

  function stopProgressUpdates() {
    if (progressUpdateInterval) {
      ztoolkit.log(`[PreferenceScript] stopProgressUpdates: stopping progress update interval`);
      clearInterval(progressUpdateInterval);
      progressUpdateInterval = null;
    }
  }

  async function loadSemanticStats() {
    if (!loadingEl || !contentEl) return;

    // Show loading, hide content
    loadingEl.style.display = "block";
    contentEl.style.display = "none";

    try {
      // Import semantic search service
      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();

      // Initialize if needed
      await semanticService.initialize();

      // Get stats
      const stats = await semanticService.getStats();

      // Format size nicely
      const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      };

      // Update UI
      if (totalItemsEl) totalItemsEl.textContent = String(stats.indexStats.totalItems);
      if (totalVectorsEl) totalVectorsEl.textContent = String(stats.indexStats.totalVectors);
      if (zhVectorsEl) zhVectorsEl.textContent = String(stats.indexStats.zhVectors);
      if (enVectorsEl) enVectorsEl.textContent = String(stats.indexStats.enVectors);
      if (cachedItemsEl) cachedItemsEl.textContent = String(stats.indexStats.cachedContentItems || 0);
      if (cacheSizeEl) cacheSizeEl.textContent = formatSize(stats.indexStats.cachedContentSizeBytes || 0);
      if (dbSizeEl) dbSizeEl.textContent = stats.indexStats.dbSizeBytes ? formatSize(stats.indexStats.dbSizeBytes) : '-';
      if (dimensionsEl) {
        if (stats.indexStats.storedDimensions) {
          // Get configured dimensions from prefs to show comparison
          const configuredDims = Zotero.Prefs.get("extensions.zotero.zotero-mcp-plugin.embedding.dimensions", true);
          const configuredDimsNum = configuredDims ? parseInt(String(configuredDims), 10) : null;
          if (configuredDimsNum && configuredDimsNum !== stats.indexStats.storedDimensions) {
            dimensionsEl.textContent = `${stats.indexStats.storedDimensions} (${getString("pref-semantic-stats-dimensions-mismatch" as any) || "mismatch"}: ${configuredDims})`;
            dimensionsEl.style.color = "#d32f2f";
          } else {
            dimensionsEl.textContent = String(stats.indexStats.storedDimensions);
            dimensionsEl.style.color = "#333";
          }
        } else {
          dimensionsEl.textContent = '-';
        }
      }
      if (int8StatusEl) {
        if (stats.indexStats.int8MigrationStatus) {
          const { migrated, total, percent } = stats.indexStats.int8MigrationStatus;
          int8StatusEl.textContent = `${migrated}/${total} (${percent}%)`;
          int8StatusEl.style.color = percent === 100 ? "#2e7d32" : "#ef6c00";
        } else {
          int8StatusEl.textContent = '-';
        }
      }
      if (statusEl) statusEl.textContent = getStatusText(stats.indexProgress.status);

      // Update progress display if indexing is in progress or has error
      if (stats.indexProgress.status === 'indexing' || stats.indexProgress.status === 'paused' || stats.indexProgress.status === 'error') {
        if (progressContainer) progressContainer.style.display = "block";
        updateProgress(stats.indexProgress);

        if (stats.indexProgress.status === 'error') {
          // Show error state - display error message and allow resume
          updateControlButtons('paused');  // Show resume button for retry
          if (statusEl) {
            // Include error message in status if available
            const errorStatus = getStatusText('error');
            if (stats.indexProgress.error) {
              statusEl.textContent = `${errorStatus}: ${stats.indexProgress.error}`;
            } else {
              statusEl.textContent = errorStatus;
            }
            statusEl.style.color = "#c62828";
          }
          // Also show error message in message area if available
          if (stats.indexProgress.error) {
            const retryHint = stats.indexProgress.errorRetryable !== false
              ? ` (${getString("pref-semantic-index-error-retry-hint" as any) || "Click Resume to retry"})`
              : '';
            showMessage(stats.indexProgress.error + retryHint, "error");
          }
        } else {
          updateControlButtons(stats.indexProgress.status as 'indexing' | 'paused');
          if (statusEl) statusEl.style.color = "";
        }

        isIndexing = stats.indexProgress.status === 'indexing';
        if (isIndexing && !progressUpdateInterval) {
          startProgressUpdates();
        }
      } else {
        if (progressContainer) progressContainer.style.display = "none";
        updateControlButtons('idle');
        if (statusEl) statusEl.style.color = "";
      }

      // Hide loading, show content
      loadingEl.style.display = "none";
      contentEl.style.display = "block";

      ztoolkit.log(`[PreferenceScript] Loaded semantic stats: ${stats.indexStats.totalItems} items, ${stats.indexStats.totalVectors} vectors`);

    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to load semantic stats: ${error}`, "warn");

      // Show error message
      loadingEl.textContent = getString("pref-semantic-stats-not-initialized" as any) || "Semantic search service not initialized";
      loadingEl.style.display = "block";
      contentEl.style.display = "none";
    }
  }

  function getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'idle': getString("pref-semantic-stats-status-idle" as any) || 'Idle',
      'indexing': getString("pref-semantic-stats-status-indexing" as any) || 'Indexing',
      'paused': getString("pref-semantic-stats-status-paused" as any) || 'Paused',
      'completed': getString("pref-semantic-stats-status-completed" as any) || 'Completed',
      'error': getString("pref-semantic-stats-status-error" as any) || 'Error',
      'aborted': 'Aborted'
    };
    return statusMap[status] || status;
  }

  /**
   * Register error callback to receive API errors during indexing
   */
  async function registerErrorCallback() {
    try {
      const { getSemanticSearchService } = require("./semantic");
      const semanticService = getSemanticSearchService();

      // Wait for initialization
      await semanticService.initialize();

      // Register error callback
      semanticService.setOnIndexError((error: any) => {
        ztoolkit.log(`[PreferenceScript] Received indexing error: ${error.type} - ${error.message}`);

        // Get localized error message based on error type, including original error details
        const getLocalizedErrorMessage = (errorType: string, originalMessage: string): string => {
          const errorTypeMap: Record<string, string> = {
            'network': getString("pref-semantic-index-error-network" as any) || 'Network connection failed, please check your network and click Resume',
            'rate_limit': getString("pref-semantic-index-error-rate-limit" as any) || 'API rate limit exceeded, please try again later',
            'auth': getString("pref-semantic-index-error-auth" as any) || 'API authentication failed, please check your API key',
            'invalid_request': getString("pref-semantic-index-error-invalid-request" as any) || 'Invalid API request, please check configuration',
            'server': getString("pref-semantic-index-error-server" as any) || 'API server error, please try again later',
            'config': getString("pref-semantic-index-error-config" as any) || 'Configuration error, please check API settings',
            'unknown': getString("pref-semantic-index-error-unknown" as any) || 'Unknown error'
          };
          const localizedMsg = errorTypeMap[errorType];
          // For known error types, append original message if it provides additional details
          // For unknown errors or when type is not found, always include original message
          if (localizedMsg) {
            // Include original message for all errors to provide more context
            return originalMessage && originalMessage !== errorType
              ? `${localizedMsg}: ${originalMessage}`
              : localizedMsg;
          }
          return originalMessage || 'Unknown error';
        };

        // Store error info for display and potential retry
        lastErrorInfo = {
          message: getLocalizedErrorMessage(error.type || 'unknown', error.message),
          type: error.type || 'unknown',
          retryable: error.retryable !== false
        };

        // Stop progress updates
        stopProgressUpdates();

        // Update UI to show error state
        updateControlButtons('paused');

        // Show error message with retry hint
        const errorMsg = lastErrorInfo.message;
        const retryHint = lastErrorInfo.retryable
          ? ` (${getString("pref-semantic-index-error-retry-hint" as any) || "Click Resume to retry"})`
          : '';
        showMessage(errorMsg + retryHint, "error");

        // Update status display
        if (statusEl) {
          statusEl.textContent = getStatusText('error');
          statusEl.style.color = "#c62828";
        }

        isIndexing = false;
      });

      ztoolkit.log("[PreferenceScript] Registered error callback for semantic service");
    } catch (error) {
      ztoolkit.log(`[PreferenceScript] Failed to register error callback: ${error}`, "warn");
    }
  }
}
