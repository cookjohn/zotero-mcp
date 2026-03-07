/**
 * Semantic Index Status Column
 *
 * Adds a custom column to Zotero's main item list showing whether each item
 * has been indexed for semantic search.
 */

import { config } from "../../package.json";

// Cache for indexed items to avoid repeated database queries
let indexedItemsCache: Set<string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache TTL
let isRefreshing: boolean = false; // 防止并发刷新

// Registered column data key (false means registration failed)
let registeredDataKey: string | false | null = null;

/**
 * Register the semantic index status column
 */
export async function registerSemanticIndexColumn(): Promise<void> {
  try {
    // Check if ItemTreeManager is available (Zotero 7+)
    if (!Zotero.ItemTreeManager?.registerColumn) {
      ztoolkit.log("[SemanticColumn] ItemTreeManager.registerColumn not available, skipping column registration");
      return;
    }

    // Register the column
    registeredDataKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: 'mcpSemanticStatus',
      label: 'Semantic',
      pluginID: config.addonID,
      enabledTreeIDs: ['main'],
      flex: 0,
      width: '60',
      fixedWidth: true,
      showInColumnPicker: true,
      columnPickerSubMenu: true,
      zoteroPersist: ['width', 'hidden', 'sortDirection'],

      // Data provider - returns the status text for each item
      dataProvider: (item: Zotero.Item, dataKey: string) => {
        return getItemIndexStatus(item.key);
      },

      // Custom cell renderer for styling
      renderCell: (index: number, data: string, column: any, isFirstColumn: boolean, doc: Document) => {
        const cell = doc.createElement('span');
        cell.className = `cell ${column.className || ''}`;
        cell.textContent = data;
        cell.style.textAlign = 'center';
        cell.style.display = 'block';

        // Color coding
        if (data === '\u2713') {
          cell.style.color = '#4CAF50';
          cell.style.fontWeight = 'bold';
        } else {
          cell.style.color = '#999999';
        }

        return cell;
      }
    });

    ztoolkit.log(`[SemanticColumn] Column registered with dataKey: ${registeredDataKey}`);
  } catch (error) {
    ztoolkit.log(`[SemanticColumn] Failed to register column: ${error}`, 'error');
  }
}

/**
 * Unregister the semantic index status column
 * This is synchronous to work properly in onShutdown
 */
export function unregisterSemanticIndexColumn(): void {
  try {
    // Only unregister if we have a valid dataKey (not null and not false)
    if (typeof registeredDataKey === 'string' && Zotero.ItemTreeManager?.unregisterColumn) {
      const result = Zotero.ItemTreeManager.unregisterColumn(registeredDataKey);
      ztoolkit.log(`[SemanticColumn] Column unregistered: ${registeredDataKey}, result: ${result}`);
      registeredDataKey = null;
    }
  } catch (error) {
    ztoolkit.log(`[SemanticColumn] Failed to unregister column: ${error}`, 'error');
  }
}

/**
 * Get the index status for a specific item
 * Uses cached data to avoid repeated database queries
 */
function getItemIndexStatus(itemKey: string): string {
  // Check if cache is valid
  const now = Date.now();
  if (!indexedItemsCache || (now - cacheTimestamp) > CACHE_TTL_MS) {
    // Cache is invalid, trigger async refresh
    refreshCacheAsync();
    // Return unknown status while loading
    return '-';
  }

  // Return status from cache
  return indexedItemsCache.has(itemKey) ? '\u2713' : '-';
}

/**
 * Refresh the indexed items cache asynchronously
 * Uses isRefreshing flag to prevent concurrent refreshes (race condition when
 * Zotero calls dataProvider for each item in the tree simultaneously)
 */
async function refreshCacheAsync(): Promise<void> {
  if (isRefreshing) return; // 防止并发刷新风暴
  isRefreshing = true;
  try {
    const { getVectorStore } = require("./semantic/vectorStore");
    const vectorStore = getVectorStore();
    await vectorStore.initialize();
    indexedItemsCache = await vectorStore.getIndexedItems();
    cacheTimestamp = Date.now();
    ztoolkit.log(`[SemanticColumn] Cache refreshed: ${indexedItemsCache?.size || 0} indexed items`);
  } catch (error) {
    ztoolkit.log(`[SemanticColumn] Failed to refresh cache: ${error}`, 'warn');
  } finally {
    isRefreshing = false;
  }
}

/**
 * Manually refresh the column cache and trigger UI update
 * Call this after indexing operations complete
 */
export async function refreshSemanticColumn(): Promise<void> {
  try {
    await refreshCacheAsync();

    // Trigger ItemTree refresh if possible
    // Note: This requires Zotero internals, may not be available in all versions
    const mainWindow = Zotero.getMainWindow();
    if (mainWindow) {
      const itemsView = (mainWindow as any).ZoteroPane?.itemsView;
      if (itemsView?.tree) {
        // Invalidate the tree to trigger re-render
        itemsView.tree.invalidate();
        ztoolkit.log("[SemanticColumn] ItemTree invalidated for refresh");
      }
    }
  } catch (error) {
    ztoolkit.log(`[SemanticColumn] Failed to refresh column: ${error}`, 'warn');
  }
}

/**
 * Clear the cache (useful when index is cleared)
 */
export function clearSemanticColumnCache(): void {
  indexedItemsCache = null;
  cacheTimestamp = 0;
}
