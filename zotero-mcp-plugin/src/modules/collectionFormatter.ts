import { formatItem, formatItems } from "./itemFormatter";

declare let Zotero: any;

/**
 * Get the full hierarchical path of a collection
 * @param collection - The Zotero.Collection object
 * @returns Full path like "Parent > Child > Grandchild"
 */
export function getCollectionPath(collection: Zotero.Collection): string {
  const pathParts: string[] = [];
  let current: Zotero.Collection | null = collection;

  while (current) {
    pathParts.unshift(current.name);
    if (current.parentKey) {
      current = Zotero.Collections.getByLibraryAndKey(
        current.libraryID,
        current.parentKey
      );
    } else {
      current = null;
    }
  }

  return pathParts.join(" > ");
}

/**
 * Get the depth level of a collection in the hierarchy
 * @param collection - The Zotero.Collection object
 * @returns Depth level (0 for root, 1 for first-level child, etc.)
 */
export function getCollectionDepth(collection: Zotero.Collection): number {
  let depth = 0;
  let current: Zotero.Collection | null = collection;

  while (current && current.parentKey) {
    depth++;
    current = Zotero.Collections.getByLibraryAndKey(
      current.libraryID,
      current.parentKey
    );
  }

  return depth;
}

/**
 * Formats a single Zotero collection object into a detailed JSON format.
 * @param collection - The Zotero.Collection object.
 * @returns A formatted collection object.
 */
export function formatCollection(collection: Zotero.Collection) {
  if (!collection) {
    return null;
  }
  return {
    key: collection.key,
    version: collection.version,
    libraryID: collection.libraryID,
    name: collection.name,
    path: getCollectionPath(collection),
    depth: getCollectionDepth(collection),
    parentCollection: collection.parentKey,
    relations: collection.getRelations(),
  };
}

/**
 * Formats a single Zotero collection object into a brief JSON format.
 * @param collection - The Zotero.Collection object.
 * @returns A formatted brief collection object with full path.
 */
export function formatCollectionBrief(collection: Zotero.Collection) {
  if (!collection) {
    return null;
  }
  return {
    key: collection.key,
    name: collection.name,
    path: getCollectionPath(collection),
    depth: getCollectionDepth(collection),
    parentCollection: collection.parentKey,
  };
}

/**
 * Formats an array of Zotero collection objects.
 * @param collections - An array of Zotero.Collection objects.
 * @returns An array of formatted collection objects.
 */
export function formatCollectionList(collections: Zotero.Collection[]) {
  return collections.map(formatCollectionBrief);
}

/**
 * Formats collection details, including items and subcollections.
 * @param collection - The Zotero.Collection object.
 * @param options - Formatting options.
 * @returns Detailed collection information.
 */
export async function formatCollectionDetails(
  collection: Zotero.Collection,
  options: {
    includeItems?: boolean;
    includeSubcollections?: boolean;
    itemsLimit?: number;
  } = {},
) {
  const details = formatCollection(collection);
  if (!details) {
    return null;
  }

  const childItemIDs = collection.getChildItems(true);
  const childCollectionIDs = collection.getChildCollections(true);

  const response: any = {
    ...details,
    meta: {
      numItems: childItemIDs.length,
      numCollections: childCollectionIDs.length,
    },
  };

  if (options.includeItems) {
    const limit = options.itemsLimit || childItemIDs.length;
    const items = Zotero.Items.get(childItemIDs.slice(0, limit));
    response.items = await formatItems(items);
  }

  if (options.includeSubcollections) {
    const collections = Zotero.Collections.get(childCollectionIDs);
    response.subcollections = formatCollectionList(collections);
  }

  return response;
}
