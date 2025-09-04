/**
 * API Endpoint Handlers for Zotero MCP Plugin
 */


import { formatItem, formatItems } from "./itemFormatter";
import {
  formatCollectionList,
  formatCollectionDetails,
} from "./collectionFormatter";
import { handleSearchRequest } from "./searchEngine";
import { FulltextService } from "./fulltextService";

declare let ztoolkit: ZToolkit;

// Define a simple interface for HTTP responses, aligning with what httpServer expects.
interface HttpResponse {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Handles the /ping endpoint for health checks.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handlePing(): Promise<HttpResponse> {
  return {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      message: "pong",
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Handles the /items/:itemKey endpoint to retrieve a single item.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters, may contain 'fields'.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetItem(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  const itemKey = params[1];
  if (!itemKey) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing itemKey parameter" }),
    };
  }

  try {
    const item = Zotero.Items.getByLibraryAndKey(
      Zotero.Libraries.userLibraryID,
      itemKey,
    );

    if (!item) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `Item with key ${itemKey} not found` }),
      };
    }

    const fieldsParam = query.get("fields");
    const fields = fieldsParam ? fieldsParam.split(",") : undefined;
    const formattedItem = await formatItem(item, fields);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(formattedItem),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles the /search endpoint to search for items.
 * @param query - URL query parameters for the search.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleSearch(
  query: URLSearchParams,
): Promise<HttpResponse> {
  ztoolkit.log("[MCP ApiHandlers] handleSearch called");

  try {
    // Convert URLSearchParams to a plain object for handleSearchRequest
    // Convert URLSearchParams to a plain object, handling tags specifically
    const searchParams: Record<string, any> = {};
    for (const [key, value] of query.entries()) {
      if (key === "tags") {
        // Split comma-separated tags into an array
        searchParams[key] = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else {
        searchParams[key] = value;
      }
    }

    // Backward compatibility: if 'tag' is present but 'tags' is not, use 'tag'
    if (searchParams.tag && !searchParams.tags) {
      searchParams.tags = [searchParams.tag];
    }

    // Set default values for new tag parameters if not provided
    if (searchParams.tags) {
      searchParams.tagMode = searchParams.tagMode || "any";
      searchParams.tagMatch = searchParams.tagMatch || "exact";
    }

    ztoolkit.log(
      `[MCP ApiHandlers] Converted search params: ${JSON.stringify(searchParams)}`,
    );

    const searchResult = await handleSearchRequest(searchParams);

    ztoolkit.log(
      `[MCP ApiHandlers] Search engine returned ${searchResult.results?.length || 0} results`,
    );

    // The search result from searchEngine already contains formatted items.
    const response = {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(searchResult),
    };

    ztoolkit.log(
      `[MCP ApiHandlers] Returning response with body length: ${response.body.length}`,
    );

    return response;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleSearch: ${error.message}`,
      "error",
    );
    ztoolkit.log(`[MCP ApiHandlers] Error stack: ${error.stack}`, "error");
    Zotero.logError(error);

    // Check if it's a custom error with a status code
    const status = (error as any).status || 500;

    const errorResponse = {
      status,
      statusText: status === 400 ? "Bad Request" : "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: error.message }),
    };

    ztoolkit.log(
      `[MCP ApiHandlers] Returning error response: ${errorResponse.status} ${errorResponse.statusText}`,
      "error",
    );

    return errorResponse;
  }
}

/**
 * Handles GET /collections endpoint.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetCollections(
  query: URLSearchParams,
): Promise<HttpResponse> {
  try {
    const libraryID =
      parseInt(query.get("libraryID") || "", 10) ||
      Zotero.Libraries.userLibraryID;
    const limit = parseInt(query.get("limit") || "100", 10);
    const offset = parseInt(query.get("offset") || "0", 10);
    const sort = query.get("sort") || "name";
    const direction = query.get("direction") || "asc";
    const includeSubcollections = query.get("includeSubcollections") === "true";
    const parentCollection = query.get("parentCollection");

    let collectionIDs;
    if (parentCollection) {
      const parent = Zotero.Collections.getByLibraryAndKey(
        libraryID,
        parentCollection,
      );
      if (!parent) {
        return {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            error: `Parent collection ${parentCollection} not found`,
          }),
        };
      }
      collectionIDs = parent.getChildCollections(true);
    } else {
      collectionIDs = Zotero.Collections.getByLibrary(libraryID).map(
        (c) => c.id,
      );
    }

    const collections = Zotero.Collections.get(
      collectionIDs,
    ) as Zotero.Collection[];

    // Sorting
    collections.sort((a: any, b: any) => {
      const aVal = a[sort] || "";
      const bVal = b[sort] || "";
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

    const total = collections.length;
    const paginated = collections.slice(offset, offset + limit);

    return {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": total.toString(),
      },
      body: JSON.stringify(formatCollectionList(paginated)),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles GET /collections/search endpoint.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleSearchCollections(
  query: URLSearchParams,
): Promise<HttpResponse> {
  try {
    const q = query.get("q");
    if (!q) {
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Missing query parameter 'q'" }),
      };
    }
    const libraryID =
      parseInt(query.get("libraryID") || "", 10) ||
      Zotero.Libraries.userLibraryID;
    const limit = parseInt(query.get("limit") || "100", 10);
    const offset = parseInt(query.get("offset") || "0", 10);

    const allCollections = Zotero.Collections.getByLibrary(libraryID) || [];
    const lowerCaseQuery = q.toLowerCase();

    const matchedCollections = allCollections.filter(
      (collection: Zotero.Collection) =>
        collection.name.toLowerCase().includes(lowerCaseQuery),
    );

    const collections = matchedCollections;
    const total = collections.length;
    const paginated = collections.slice(offset, offset + limit);

    return {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": total.toString(),
      },
      body: JSON.stringify(formatCollectionList(paginated)),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles GET /collections/:collectionKey endpoint.
 * @param params - URL parameters.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetCollectionDetails(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  try {
    const collectionKey = params[1];
    if (!collectionKey) {
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Missing collectionKey parameter" }),
      };
    }
    const libraryID =
      parseInt(query.get("libraryID") || "", 10) ||
      Zotero.Libraries.userLibraryID;

    const collection = Zotero.Collections.getByLibraryAndKey(
      libraryID,
      collectionKey,
    );

    if (!collection) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          error: `Collection with key ${collectionKey} not found`,
        }),
      };
    }

    const options = {
      includeItems: query.get("includeItems") === "true",
      includeSubcollections: query.get("includeSubcollections") === "true",
      itemsLimit: parseInt(query.get("itemsLimit") || "50", 10),
    };

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(formatCollectionDetails(collection, options)),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles GET /collections/:collectionKey/items endpoint.
 * @param params - URL parameters.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetCollectionItems(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  try {
    const collectionKey = params[1];
    ztoolkit.log(`[ApiHandlers] Getting collection items for key: ${collectionKey}`);
    
    if (!collectionKey) {
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Missing collectionKey parameter" }),
      };
    }
    const libraryID =
      parseInt(query.get("libraryID") || "", 10) ||
      Zotero.Libraries.userLibraryID;

    ztoolkit.log(`[ApiHandlers] Using libraryID: ${libraryID}`);

    const collection = Zotero.Collections.getByLibraryAndKey(
      libraryID,
      collectionKey,
    );

    if (!collection) {
      ztoolkit.log(`[ApiHandlers] Collection not found: ${collectionKey} in library ${libraryID}`, "error");
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          error: `Collection with key ${collectionKey} not found`,
        }),
      };
    }

    ztoolkit.log(`[ApiHandlers] Found collection: ${collection.name}`);

    const limit = parseInt(query.get("limit") || "100", 10);
    const offset = parseInt(query.get("offset") || "0", 10);
    const fields = query.get("fields")?.split(",");

    ztoolkit.log(`[ApiHandlers] Pagination: limit=${limit}, offset=${offset}`);
    ztoolkit.log(`[ApiHandlers] Fields requested: ${fields?.join(", ") || "default"}`);

    const itemIDs = collection.getChildItems(true);
    const total = itemIDs.length;
    ztoolkit.log(`[ApiHandlers] Collection contains ${total} items, IDs: [${itemIDs.slice(0, 5).join(", ")}${itemIDs.length > 5 ? "..." : ""}]`);
    
    const paginatedIDs = itemIDs.slice(offset, offset + limit);
    ztoolkit.log(`[ApiHandlers] Paginated IDs: [${paginatedIDs.join(", ")}]`);
    
    const items = Zotero.Items.get(paginatedIDs);
    ztoolkit.log(`[ApiHandlers] Retrieved ${items.length} item objects from Zotero`);

    ztoolkit.log(`[ApiHandlers] Starting formatItems...`);
    const formattedItems = await formatItems(items, fields);
    ztoolkit.log(`[ApiHandlers] Formatted ${formattedItems.length} items`);

    return {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": total.toString(),
      },
      body: JSON.stringify(formattedItems),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(`[ApiHandlers] Error in handleGetCollectionItems: ${error.message}`, "error");
    ztoolkit.log(`[ApiHandlers] Error stack: ${error.stack}`, "error");
    Zotero.logError(error);
    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

// REMOVED: handleGetPDFContent - replaced by unified get_content tool


// REMOVED: handleSearchAnnotations - replaced by SmartAnnotationExtractor in MCP tools

/**
 * Handles GET /items/:itemKey/notes endpoint.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetItemNotes(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  const itemKey = params[1];
  if (!itemKey) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing itemKey parameter" }),
    };
  }

  ztoolkit.log(`[MCP ApiHandlers] Getting notes for item ${itemKey}`);

  try {
    // Note: This function should be replaced by unified content tools
    // For now, return empty result to maintain compatibility
    const allNotes: any[] = [];

    // 添加分页支持
    const limit = Math.min(parseInt(query.get("limit") || "20", 10), 100);
    const offset = parseInt(query.get("offset") || "0", 10);
    const totalCount = allNotes.length;
    const paginatedNotes = allNotes.slice(offset, offset + limit);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        // 元数据在前
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        totalCount,
        version: "2.0",
        endpoint: "items/notes",
        itemKey,
        // 数据在后
        notes: paginatedNotes,
      }),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleGetItemNotes: ${error.message}`,
      "error",
    );
    Zotero.logError(error);

    if (error.message.includes("not found")) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles GET /items/:itemKey/annotations endpoint.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetItemAnnotations(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  const itemKey = params[1];
  if (!itemKey) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing itemKey parameter" }),
    };
  }

  ztoolkit.log(`[MCP ApiHandlers] Getting annotations for item ${itemKey}`);

  try {
    // Note: This function should be replaced by SmartAnnotationExtractor
    // For now, return empty result to maintain compatibility
    const annotations: any[] = [];

    // Apply optional filtering
    let filteredAnnotations = annotations;

    const typeFilter = query.get("type");
    if (typeFilter) {
      const types = typeFilter.split(",").map((t) => t.trim());
      filteredAnnotations = annotations.filter((ann) =>
        types.includes(ann.type),
      );
    }

    const colorFilter = query.get("color");
    if (colorFilter) {
      filteredAnnotations = filteredAnnotations.filter(
        (ann) => ann.color === colorFilter,
      );
    }

    // 添加分页支持
    const limit = Math.min(parseInt(query.get("limit") || "20", 10), 100);
    const offset = parseInt(query.get("offset") || "0", 10);
    const totalCount = filteredAnnotations.length;
    const paginatedAnnotations = filteredAnnotations.slice(offset, offset + limit);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        // 元数据在前
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        totalCount,
        version: "2.0",
        endpoint: "items/annotations",
        itemKey,
        // 数据在后
        annotations: paginatedAnnotations,
      }),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleGetItemAnnotations: ${error.message}`,
      "error",
    );
    Zotero.logError(error);

    if (error.message.includes("not found")) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}


// REMOVED: handleGetAnnotationById - replaced by SmartAnnotationExtractor in MCP tools

// REMOVED: handleGetAnnotationsBatch - replaced by SmartAnnotationExtractor in MCP tools

// REMOVED: handleGetItemFulltext - replaced by unified get_content tool

// REMOVED: handleGetAttachmentContent - replaced by unified get_content tool

/**
 * Handles GET /search/fulltext endpoint.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleSearchFulltext(
  query: URLSearchParams,
): Promise<HttpResponse> {
  const q = query.get("q");
  if (!q || q.trim().length === 0) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing query parameter 'q'" }),
    };
  }

  ztoolkit.log(`[MCP ApiHandlers] Searching fulltext for: "${q}"`);

  try {
    const fulltextService = new FulltextService();
    
    // Parse search options
    const options = {
      itemKeys: query.get("itemKeys")?.split(",") || null,
      contextLength: parseInt(query.get("contextLength") || "200", 10),
      maxResults: Math.min(parseInt(query.get("maxResults") || "50", 10), 200),
      caseSensitive: query.get("caseSensitive") === "true"
    };

    const searchResult = await fulltextService.searchFulltext(q, options);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(searchResult, null, 2),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleSearchFulltext: ${error.message}`,
      "error",
    );
    Zotero.logError(error);

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}

/**
 * Handles GET /items/:itemKey/abstract endpoint.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetItemAbstract(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  const itemKey = params[1];
  if (!itemKey) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing itemKey parameter" }),
    };
  }

  ztoolkit.log(`[MCP ApiHandlers] Getting abstract for item ${itemKey}`);

  try {
    const item = Zotero.Items.getByLibraryAndKey(
      Zotero.Libraries.userLibraryID,
      itemKey,
    );

    if (!item) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `Item with key ${itemKey} not found` }),
      };
    }

    const fulltextService = new FulltextService();
    const abstract = fulltextService.getItemAbstract(item);

    if (!abstract) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "No abstract found for this item" }),
      };
    }

    const format = query.get("format") || "json";
    
    if (format === "text") {
      return {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: abstract,
      };
    } else {
      return {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          itemKey,
          title: item.getDisplayTitle(),
          abstract,
          length: abstract.length,
          extractedAt: new Date().toISOString()
        }, null, 2),
      };
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleGetItemAbstract: ${error.message}`,
      "error",
    );
    Zotero.logError(error);

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
}
