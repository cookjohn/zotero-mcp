/**
 * TypeScript declarations for the Zotero MCP Plugin's external API.
 *
 * Other Zotero plugins can include this file to get type-safe access to
 * the tool registration API exposed at `Zotero.ZoteroMCP.api`.
 *
 * Usage (in your plugin's tsconfig.json or via triple-slash reference):
 *   /// <reference path="zotero-mcp-api.d.ts" />
 *
 * Then access the API:
 *   const api = Zotero.ZoteroMCP.api;
 *   api.registerTool({ ... });
 */

/** Definition of an externally-registered MCP tool. */
export interface MCPToolDefinition {
  /** Unique tool name. Must match /^[a-z][a-z0-9_]*$/ and not collide with built-in tools. */
  name: string;
  /** Human-readable description shown to AI clients. */
  description: string;
  /** JSON Schema object describing the tool's input parameters. */
  inputSchema: object;
  /**
   * Handler invoked when an AI client calls this tool.
   * Receives the parsed `arguments` object and may return any
   * JSON-serialisable value (or a Promise of one).
   */
  handler: (args: any) => Promise<any> | any;
  /** Optional: plugin ID of the registrar (for bulk cleanup / diagnostics). */
  pluginID?: string;
  /** Optional: whether the tool is visible in `tools/list`. Defaults to true. */
  enabled?: boolean;
}

/** Readonly view of a registered tool (handler excluded) for safe inspection. */
export interface MCPRegisteredToolInfo {
  name: string;
  description: string;
  inputSchema: object;
  pluginID?: string;
  enabled: boolean;
  registeredAt: string;
}

/** Public API surface exposed by the Zotero MCP Plugin. */
export interface ZoteroMCPAPI {
  /** Register a custom MCP tool. Throws on invalid input or name collision. */
  registerTool(def: MCPToolDefinition): boolean;

  /** Unregister a tool by name. Returns true if the tool was found and removed. */
  unregisterTool(name: string): boolean;

  /** Unregister all tools registered by a specific plugin. Returns count removed. */
  unregisterAllTools(pluginID: string): number;

  /** List registered tools (readonly, handler excluded). */
  getRegisteredTools(): MCPRegisteredToolInfo[];

  /** Check if a tool name is already registered. */
  isToolRegistered(name: string): boolean;

  /** Subscribe to tool list changes. Returns an unsubscribe function. */
  onToolListChanged(listener: () => void): () => void;
}

/** The addon instance exposed at `Zotero.ZoteroMCP`. */
export interface ZoteroMCPAddon {
  api: ZoteroMCPAPI & {
    [key: string]: any;
  };
  [key: string]: any;
}

// Augment the global Zotero type to include the MCP plugin instance.
declare global {
  interface Window {
    Zotero: _ZoteroTypes.Zotero & {
      ZoteroMCP?: ZoteroMCPAddon;
    };
  }
}
