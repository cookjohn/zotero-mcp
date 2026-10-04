import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import { HttpServer, httpServer } from "./modules/httpServer";
import { serverPreferences } from "./modules/serverPreferences";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { getToolRegistry, ExternalToolDefinition, RegisteredToolInfo } from "./modules/toolRegistry";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    httpServer?: HttpServer | null;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns?: Array<ColumnOptions>;
      rows?: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {
      HttpServer, // Expose the class for static methods
      testServer: () => {
        Zotero.debug("===MCP=== Manually testing server...");
        HttpServer.testServer();
      },
      startServer: () => {
        Zotero.debug("===MCP=== Manually starting server...");
        addon.data.httpServer?.start(serverPreferences.getPort());
      },
      stopServer: () => {
        Zotero.debug("===MCP=== Manually stopping server...");
        addon.data.httpServer?.stop();
      },
      // ---- External Tool Registration API ----
      // Other Zotero plugins can register custom MCP tools via:
      //   Zotero.ZoteroMCP.api.registerTool({ ... })
      registerTool: (def: ExternalToolDefinition): boolean => {
        return getToolRegistry().registerTool(def);
      },
      unregisterTool: (name: string): boolean => {
        return getToolRegistry().unregisterTool(name);
      },
      unregisterAllTools: (pluginID: string): number => {
        return getToolRegistry().unregisterAllTools(pluginID);
      },
      getRegisteredTools: (): RegisteredToolInfo[] => {
        return getToolRegistry().getRegisteredTools();
      },
      isToolRegistered: (name: string): boolean => {
        return getToolRegistry().hasTool(name);
      },
      onToolListChanged: (listener: () => void): (() => void) => {
        return getToolRegistry().onToolListChanged(listener);
      },
    };
  }
}

export default Addon;
