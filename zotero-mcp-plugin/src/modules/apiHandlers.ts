/**
 * API Endpoint Handlers for Zotero MCP Plugin
 */

import { formatItem, formatItems } from "./itemFormatter";
import {
  formatCollectionList,
  formatCollectionDetails,
} from "./collectionFormatter";
import { handleSearchRequest } from "./searchEngine";
import { PDFService } from "./pdfService";
import { AnnotationService } from "./annotationService";
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

    const limit = parseInt(query.get("limit") || "100", 10);
    const offset = parseInt(query.get("offset") || "0", 10);
    const fields = query.get("fields")?.split(",");

    const itemIDs = collection.getChildItems(true);
    const total = itemIDs.length;
    const paginatedIDs = itemIDs.slice(offset, offset + limit);
    const items = Zotero.Items.get(paginatedIDs);

    return {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": total.toString(),
      },
      body: JSON.stringify(formatItems(items, fields)),
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
 * Handles GET /items/:itemKey/pdf-content endpoint.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters, may contain 'page' and 'format'.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetPDFContent(
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

  const page = query.get("page");
  const format = query.get("format") || "json"; // Default to json

  const pdfService = new PDFService();

  try {
    // Per user feedback, page-specific extraction is removed. Always fetch full text.
    // The 'page' parameter is now ignored.
    const data = await pdfService.getPDFText(itemKey);

    let body;
    let contentType = "application/json; charset=utf-8";

    if (format === "text") {
      body = Array.isArray(data) ? data.join("\n\n") : String(data);
      contentType = "text/plain; charset=utf-8";
    } else {
      // Default to JSON
      const response = {
        itemKey,
        ...(page ? { page: parseInt(page, 10) } : {}),
        content: data,
      };
      body = JSON.stringify(response, null, 2);
    }

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": contentType },
      body,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);

    // Customize error message for not found errors
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
 * Handles GET /annotations/search endpoint.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleSearchAnnotations(
  query: URLSearchParams,
): Promise<HttpResponse> {
  ztoolkit.log("[MCP ApiHandlers] handleSearchAnnotations called");

  try {
    const annotationService = new AnnotationService();

    // Convert URLSearchParams to search parameters
    const searchParams: any = {};
    for (const [key, value] of query.entries()) {
      if (key === "type" || key === "tags") {
        // Support comma-separated values
        searchParams[key] = value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      } else if (key === "hasComment") {
        searchParams[key] = value === "true";
      } else {
        searchParams[key] = value;
      }
    }

    ztoolkit.log(
      `[MCP ApiHandlers] Annotation search params: ${JSON.stringify(searchParams)}`,
    );

    const result = await annotationService.searchAnnotations(searchParams);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(result),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleSearchAnnotations: ${error.message}`,
      "error",
    );
    Zotero.logError(error);

    const status = (error as any).status || 500;
    return {
      status,
      statusText: status === 400 ? "Bad Request" : "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

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
    const annotationService = new AnnotationService();
    const allNotes = await annotationService.getAllNotes(itemKey);

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
    const annotationService = new AnnotationService();
    const annotations = await annotationService.getPDFAnnotations(itemKey);

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


/**
 * 根据ID获取注释的完整内容
 * @param params - URL parameters, where params[1] is the annotation ID
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetAnnotationById(
  params: Record<string, string>,
): Promise<HttpResponse> {
  ztoolkit.log("[MCP ApiHandlers] handleGetAnnotationById called");
  
  const annotationId = params[1];
  if (!annotationId) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Annotation ID is required" }),
    };
  }

  try {
    const service = new AnnotationService();
    const annotation = await service.getAnnotationById(annotationId);

    if (!annotation) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Annotation not found" }),
      };
    }

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(annotation, null, 2),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ztoolkit.log(`[MCP ApiHandlers] Error in handleGetAnnotationById: ${errorMsg}`, "error");

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: errorMsg }),
    };
  }
}

/**
 * 批量获取注释的完整内容
 * @param body - Request body containing annotation IDs
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetAnnotationsBatch(
  body: string,
): Promise<HttpResponse> {
  ztoolkit.log("[MCP ApiHandlers] handleGetAnnotationsBatch called");

  try {
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (parseError) {
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const { ids } = requestData;
    if (!Array.isArray(ids) || ids.length === 0) {
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "ids must be a non-empty array" }),
      };
    }

    const service = new AnnotationService();
    const annotations = await service.getAnnotationsByIds(ids);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        results: annotations,
        requestedCount: ids.length,
        foundCount: annotations.length,
        timestamp: new Date().toISOString(),
      }, null, 2),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ztoolkit.log(`[MCP ApiHandlers] Error in handleGetAnnotationsBatch: ${errorMsg}`, "error");

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: errorMsg }),
    };
  }
}

/**
 * Handles GET /items/:itemKey/fulltext endpoint.
 * @param params - URL parameters, where params[1] is the itemKey.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetItemFulltext(
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

  ztoolkit.log(`[MCP ApiHandlers] Getting fulltext for item ${itemKey}`);

  try {
    const fulltextService = new FulltextService();
    const fulltext = await fulltextService.getItemFulltext(itemKey);

    // Check if user wants only specific content types
    const includeAttachments = query.get("attachments") !== "false";
    const includeNotes = query.get("notes") !== "false";
    const includeWebpage = query.get("webpage") !== "false";
    const includeAbstract = query.get("abstract") !== "false";

    // Filter content based on query parameters
    const filteredFulltext = {
      ...fulltext,
      abstract: includeAbstract ? fulltext.abstract : null,
      fulltext: {
        attachments: includeAttachments ? fulltext.fulltext.attachments : [],
        notes: includeNotes ? fulltext.fulltext.notes : [],
        webpage: includeWebpage ? fulltext.fulltext.webpage : null,
        total_length: 0
      }
    };

    // Recalculate total length
    filteredFulltext.fulltext.total_length = 
      (filteredFulltext.abstract?.length || 0) +
      filteredFulltext.fulltext.attachments.reduce((sum: number, att: any) => sum + att.length, 0) +
      filteredFulltext.fulltext.notes.reduce((sum: number, note: any) => sum + note.length, 0) +
      (filteredFulltext.fulltext.webpage?.length || 0);

    return {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(filteredFulltext, null, 2),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleGetItemFulltext: ${error.message}`,
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
 * Handles GET /attachments/:attachmentKey/content endpoint.
 * @param params - URL parameters, where params[1] is the attachmentKey.
 * @param query - URL query parameters.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleGetAttachmentContent(
  params: Record<string, string>,
  query: URLSearchParams,
): Promise<HttpResponse> {
  const attachmentKey = params[1];
  if (!attachmentKey) {
    return {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing attachmentKey parameter" }),
    };
  }

  ztoolkit.log(`[MCP ApiHandlers] Getting content for attachment ${attachmentKey}`);

  try {
    const attachment = Zotero.Items.getByLibraryAndKey(
      Zotero.Libraries.userLibraryID,
      attachmentKey,
    );

    if (!attachment || !attachment.isAttachment()) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `Attachment with key ${attachmentKey} not found` }),
      };
    }

    const fulltextService = new FulltextService();
    const content = await fulltextService.getAttachmentContent(attachment);

    if (!content) {
      return {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "No extractable content found in attachment" }),
      };
    }

    // Check format preference
    const format = query.get("format") || "json";
    
    if (format === "text") {
      return {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: content.content,
      };
    } else {
      return {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(content, null, 2),
      };
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleGetAttachmentContent: ${error.message}`,
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
