import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { ItemReader } from "./itemReader";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  addon.data.prefs = { window: _window };
  bindPrefEvents();
}

function bindPrefEvents() {
  const portInput = addon.data.prefs!.window.document?.querySelector(
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
}
