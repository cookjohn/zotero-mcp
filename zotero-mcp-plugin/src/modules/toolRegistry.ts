/**
 * External Tool Registry
 *
 * Allows other Zotero plugins to register custom MCP tools that are exposed
 * through this plugin's MCP server. Other plugins interact via the public API
 * surface `Zotero.ZoteroMCP.api.registerTool(...)`.
 *
 * The registry is a process-wide singleton that survives MCP server restarts
 * (e.g. when the user changes the port). Tools registered before the server
 * starts will appear in `tools/list` as soon as the first request arrives.
 */

declare let ztoolkit: ZToolkit;

/**
 * Definition of an externally-registered MCP tool.
 */
export interface ExternalToolDefinition {
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

/**
 * A tool stored in the registry (definition + metadata).
 */
interface RegisteredTool extends ExternalToolDefinition {
  registeredAt: Date;
}

/**
 * Readonly view of a registered tool (handler excluded) for safe inspection.
 */
export interface RegisteredToolInfo {
  name: string;
  description: string;
  inputSchema: object;
  pluginID?: string;
  enabled: boolean;
  registeredAt: string;
}

type ChangeListener = () => void;

/** Valid tool name pattern: lowercase letters, digits, underscores, starting with a letter. */
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Built-in tool names that external plugins must not override.
 * Kept in sync with the `handleToolsList` switch in streamableMCPServer.ts.
 */
const BUILTIN_TOOL_NAMES = new Set<string>([
  'get_libraries',
  'search_library',
  'search_libraries',
  'search_annotations',
  'get_item_details',
  'get_annotations',
  'get_content',
  'get_collections',
  'search_collections',
  'get_collection_details',
  'get_collection_items',
  'get_subcollections',
  'create_collection',
  'update_collection',
  'delete_collection',
  'add_items_to_collection',
  'remove_items_from_collection',
  'search_fulltext',
  'get_item_abstract',
  'semantic_search',
  'find_similar',
  'semantic_status',
  'fulltext_database',
  'write_note',
  'write_tag',
  'write_metadata',
  'write_item',
  'export_bibliography',
  'get_citation',
  'list_citation_styles',
  'sync_bib',
  'cite',
]);

class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private listeners: Set<ChangeListener> = new Set();

  /**
   * Register a new external MCP tool.
   * @returns `true` on success.
   * @throws if the definition is invalid or the name collides.
   */
  registerTool(def: ExternalToolDefinition): boolean {
    this.validateDefinition(def);

    if (BUILTIN_TOOL_NAMES.has(def.name)) {
      throw new Error(`Tool name "${def.name}" is reserved by a built-in tool. Please choose a different name.`);
    }

    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered. Unregister it first or use a different name.`);
    }

    this.tools.set(def.name, {
      ...def,
      enabled: def.enabled !== false,
      registeredAt: new Date(),
    });

    ztoolkit.log(`[ToolRegistry] Registered external tool: ${def.name}` + (def.pluginID ? ` (plugin: ${def.pluginID})` : ''));
    this.notifyListeners();
    return true;
  }

  /**
   * Unregister an external tool by name.
   * @returns `true` if the tool was found and removed, `false` otherwise.
   */
  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      ztoolkit.log(`[ToolRegistry] Unregistered external tool: ${name}`);
      this.notifyListeners();
    }
    return removed;
  }

  /**
   * Unregister all tools registered by a specific plugin.
   * Useful when the registering plugin is disabled/uninstalled.
   * @returns number of tools removed.
   */
  unregisterAllTools(pluginID: string): number {
    let count = 0;
    for (const [name, tool] of this.tools) {
      if (tool.pluginID === pluginID) {
        this.tools.delete(name);
        count++;
      }
    }
    if (count > 0) {
      ztoolkit.log(`[ToolRegistry] Unregistered ${count} tools from plugin: ${pluginID}`);
      this.notifyListeners();
    }
    return count;
  }

  /**
   * Get a registered tool by name (including handler).
   * Returns `undefined` if not found.
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check whether a tool (external) is registered under the given name.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Return all *enabled* external tools as MCP tool definitions
   * (the shape expected by `tools/list`).
   */
  getToolDefinitions(): Array<{ name: string; description: string; inputSchema: object }> {
    const defs: Array<{ name: string; description: string; inputSchema: object }> = [];
    for (const tool of this.tools.values()) {
      if (tool.enabled !== false) {
        defs.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return defs;
  }

  /**
   * Return a safe, readonly info array for inspection (handler excluded).
   */
  getRegisteredTools(): RegisteredToolInfo[] {
    const infos: RegisteredToolInfo[] = [];
    for (const tool of this.tools.values()) {
      infos.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        pluginID: tool.pluginID,
        enabled: tool.enabled !== false,
        registeredAt: tool.registeredAt.toISOString(),
      });
    }
    return infos;
  }

  /**
   * Subscribe to tool list changes.
   * @returns an unsubscribe function.
   */
  onToolListChanged(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Remove all registered tools (used on shutdown).
   */
  clear(): void {
    if (this.tools.size > 0) {
      ztoolkit.log(`[ToolRegistry] Clearing ${this.tools.size} external tools`);
    }
    this.tools.clear();
    this.listeners.clear();
  }

  // ---- internal helpers -------------------------------------------------

  private validateDefinition(def: ExternalToolDefinition): void {
    if (!def || typeof def !== 'object') {
      throw new Error('Tool definition must be an object.');
    }
    if (typeof def.name !== 'string' || !TOOL_NAME_PATTERN.test(def.name)) {
      throw new Error(`Invalid tool name "${def.name}". Name must match /^[a-z][a-z0-9_]*$/.`);
    }
    if (typeof def.description !== 'string' || def.description.trim().length === 0) {
      throw new Error(`Tool "${def.name}": description must be a non-empty string.`);
    }
    if (!def.inputSchema || typeof def.inputSchema !== 'object') {
      throw new Error(`Tool "${def.name}": inputSchema must be a JSON Schema object.`);
    }
    if (typeof def.handler !== 'function') {
      throw new Error(`Tool "${def.name}": handler must be a function.`);
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        ztoolkit.log(`[ToolRegistry] Change listener error: ${e}`, 'warn');
      }
    }
  }
}

// Singleton instance
let registryInstance: ToolRegistry | null = null;

/**
 * Get the singleton tool registry instance.
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

/**
 * Reset the singleton (used on shutdown / testing).
 */
export function resetToolRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
    registryInstance = null;
  }
}
