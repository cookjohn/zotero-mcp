import { formatItem, formatItems } from "./itemFormatter";

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
    parentCollection: collection.parentKey,
    relations: collection.getRelations(),
  };
}

/**
 * Formats a single Zotero collection object into a brief JSON format.
 * @param collection - The Zotero.Collection object.
 * @returns A formatted brief collection object.
 */
export function formatCollectionBrief(collection: Zotero.Collection) {
  if (!collection) {
    return null;
  }
  return {
    key: collection.key,
    name: collection.name,
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
export function formatCollectionDetails(
  collection: Zotero.Collection,
  options: {
    includeItems?: boolean;
    includeSubcollections?: boolean;
    itemsLimit?: number;
  } = {}
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
    response.items = formatItems(items);
  }

  if (options.includeSubcollections) {
    const collections = Zotero.Collections.get(childCollectionIDs);
    response.subcollections = formatCollectionList(collections);
  }

  return response;
}