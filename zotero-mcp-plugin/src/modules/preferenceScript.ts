import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { ClientConfigGenerator } from "./clientConfigGenerator";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  addon.data.prefs = { window: _window };
  bindPrefEvents();
}

function bindPrefEvents() {
  const doc = addon.data.prefs!.window.document;
  
  // Port input validation
  const portInput = doc?.querySelector(
    `#zotero-prefpane-${config.addonRef}-mcp-server-port`,
  ) as HTMLInputElement;
  portInput?.addEventListener("change", () => {
    if (portInput) {
      const port = parseInt(portInput.value, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        portInput.value = Zotero.Prefs.get("mcp.server.port")!.toString();
        addon.data.prefs!.window.alert(
          getString("pref-server-port-invalid" as any),
        );
      }
    }
  });

  // Client config generation
  const clientSelect = doc?.querySelector("#client-type-select") as HTMLSelectElement;
  const serverNameInput = doc?.querySelector("#server-name-input") as HTMLInputElement;
  const generateButton = doc?.querySelector("#generate-config-button") as HTMLButtonElement;
  const copyConfigButton = doc?.querySelector("#copy-config-button") as HTMLButtonElement;
  const copyGuideButton = doc?.querySelector("#copy-guide-button") as HTMLButtonElement;
  const configOutput = doc?.querySelector("#config-output") as HTMLTextAreaElement;

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

      // Enable copy buttons
      copyConfigButton.disabled = false;
      copyGuideButton.disabled = false;

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

  copyGuideButton?.addEventListener("click", async () => {
    // First, always show the guide in textarea
    showGuideInTextarea();
    
    try {
      const success = await ClientConfigGenerator.copyToClipboard(currentGuide);
      if (success) {
        // Show temporary success message
        const originalText = copyGuideButton.textContent;
        copyGuideButton.textContent = "完整指南已复制!";
        copyGuideButton.style.backgroundColor = "#4CAF50";
        setTimeout(() => {
          copyGuideButton.textContent = originalText;
          copyGuideButton.style.backgroundColor = "";
        }, 2000);
      } else {
        addon.data.prefs!.window.alert("已在文本框中显示完整指南，请手动复制（已自动选中）");
      }
    } catch (error) {
      addon.data.prefs!.window.alert(`已在文本框中显示完整指南，请手动复制（已自动选中）\n错误: ${error}`);
      ztoolkit.log(`[PreferenceScript] Guide copy failed: ${error}`, "error");
    }
  });

  // Helper function to show guide in textarea
  function showGuideInTextarea() {
    const originalValue = configOutput.value;
    configOutput.value = currentGuide;
    configOutput.select();
    configOutput.focus();
    
    // Restore original value after 10 seconds
    setTimeout(() => {
      if (configOutput.value === currentGuide) {
        configOutput.value = originalValue;
      }
    }, 10000);
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
}
