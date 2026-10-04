/**
 * External Tool Registration — Example for Other Zotero Plugins
 *
 * This file demonstrates how a third-party Zotero plugin can register
 * custom MCP tools through the Zotero MCP Plugin's public API.
 *
 * It is NOT part of the zotero-mcp-plugin itself. Other plugin developers
 * should copy the relevant patterns into their own plugin's bootstrap code.
 *
 * Public API surface:  Zotero.ZoteroMCP.api
 */

// ============================================================================
// 1. Register a tool when your plugin starts
// ============================================================================

const PLUGIN_ID = 'my-awesome-plugin@example.com';

function registerMyTools() {
  const mcp = (Zotero as any).ZoteroMCP;
  if (!mcp || !mcp.api || !mcp.api.registerTool) {
    // Zotero MCP Plugin is not installed or is an older version
    Zotero.debug('[MyPlugin] Zotero MCP Plugin not available, skipping tool registration');
    return;
  }

  // --- Example 1: A simple read-only tool ---
  mcp.api.registerTool({
    name: 'my_plugin_count_items',
    description: 'Count items in the Zotero library, optionally filtered by type.',
    inputSchema: {
      type: 'object',
      properties: {
        itemType: {
          type: 'string',
          description: 'Filter by item type (e.g. "journalArticle", "book")'
        }
      }
    },
    handler: async (args: any) => {
      const libID = Zotero.Libraries.userLibraryID;
      const items = await Zotero.Items.getAll(libID);
      const filtered = args?.itemType
        ? items.filter((i: any) => i.itemType === args.itemType)
        : items;
      return { total: filtered.length, itemType: args?.itemType || 'all' };
    },
    pluginID: PLUGIN_ID,
  });

  // --- Example 2: A tool with required parameters ---
  mcp.api.registerTool({
    name: 'my_plugin_get_tags',
    description: 'List all tags used in the library, with usage counts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tags to return (default: 50)'
        }
      }
    },
    handler: async (args: any) => {
      const limit = args?.limit || 50;
      const tags = await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID);
      const result = tags
        .slice(0, limit)
        .map((t: any) => ({ name: t.name, count: t.count || 0 }));
      return { tags: result, total: tags.length };
    },
    pluginID: PLUGIN_ID,
  });

  Zotero.debug('[MyPlugin] MCP tools registered successfully');
}

// ============================================================================
// 2. Unregister all your tools when your plugin shuts down
// ============================================================================

function unregisterMyTools() {
  const mcp = (Zotero as any).ZoteroMCP;
  if (!mcp || !mcp.api || !mcp.api.unregisterAllTools) return;

  const removed = mcp.api.unregisterAllTools(PLUGIN_ID);
  Zotero.debug(`[MyPlugin] Unregistered ${removed} MCP tools`);
}

// ============================================================================
// 3. (Optional) Listen for tool list changes
// ============================================================================

function watchToolListChanges() {
  const mcp = (Zotero as any).ZoteroMCP;
  if (!mcp || !mcp.api || !mcp.api.onToolListChanged) return;

  // Returns an unsubscribe function — call it on shutdown
  const unsubscribe = mcp.api.onToolListChanged(() => {
    const tools = mcp.api.getRegisteredTools();
    Zotero.debug(`[MyPlugin] Tool list changed. ${tools.length} external tools registered.`);
  });

  return unsubscribe;
}

// ============================================================================
// 4. (Optional) Check if the MCP plugin is available before registering
// ============================================================================

function isMCPPluginAvailable(): boolean {
  const mcp = (Zotero as any).ZoteroMCP;
  return !!(mcp && mcp.api && typeof mcp.api.registerTool === 'function');
}

// ============================================================================
// 5. (Optional) Inspect currently registered tools
// ============================================================================

function listRegisteredTools() {
  const mcp = (Zotero as any).ZoteroMCP;
  if (!mcp || !mcp.api || !mcp.api.getRegisteredTools) return [];

  return mcp.api.getRegisteredTools().map((t: any) => ({
    name: t.name,
    description: t.description,
    pluginID: t.pluginID,
    enabled: t.enabled,
    registeredAt: t.registeredAt,
  }));
}
