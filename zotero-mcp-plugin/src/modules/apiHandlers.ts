/**
 * API Endpoint Handlers for Zotero MCP Plugin
 */

import { formatItem, formatItems } from './itemFormatter';
import { handleSearchRequest } from './searchEngine';

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
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      message: 'pong',
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
  query: URLSearchParams
): Promise<HttpResponse> {
  const itemKey = params[1];
  if (!itemKey) {
    return {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Missing itemKey parameter' }),
    };
  }

  try {
    const item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);

    if (!item) {
      return {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: `Item with key ${itemKey} not found` }),
      };
    }

    const fieldsParam = query.get('fields');
    const fields = fieldsParam ? fieldsParam.split(',') : undefined;
    const formattedItem = formatItem(item, fields);

    return {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(formattedItem),
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    };
  }
}

/**
 * Handles the /search endpoint to search for items.
 * @param query - URL query parameters for the search.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleSearch(query: URLSearchParams): Promise<HttpResponse> {
  ztoolkit.log('[MCP ApiHandlers] handleSearch called');
  
  try {
    // Convert URLSearchParams to a plain object for handleSearchRequest
    const searchParams: Record<string, string> = {};
    for (const [key, value] of query.entries()) {
      searchParams[key] = value;
    }

    ztoolkit.log(`[MCP ApiHandlers] Converted search params: ${JSON.stringify(searchParams)}`);

    const searchResult = await handleSearchRequest(searchParams);

    ztoolkit.log(`[MCP ApiHandlers] Search engine returned ${searchResult.results?.length || 0} results`);

    // The search result from searchEngine already contains formatted items.
    const response = {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(searchResult),
    };
    
    ztoolkit.log(`[MCP ApiHandlers] Returning response with body length: ${response.body.length}`);
    
    return response;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(`[MCP ApiHandlers] Error in handleSearch: ${error.message}`, "error");
    ztoolkit.log(`[MCP ApiHandlers] Error stack: ${error.stack}`, "error");
    Zotero.logError(error);
    
    // Check if it's a custom error with a status code
    const status = (error as any).status || 500;
    
    const errorResponse = {
      status,
      statusText: status === 400 ? 'Bad Request' : 'Internal Server Error',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: error.message }),
    };
    
    ztoolkit.log(`[MCP ApiHandlers] Returning error response: ${errorResponse.status} ${errorResponse.statusText}`, "error");
    
    return errorResponse;
  }
}