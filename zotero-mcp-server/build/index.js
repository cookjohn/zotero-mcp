import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const ZOTERO_API_BASE = "http://127.0.0.1:23120";
async function makeZoteroRequest(endpoint, params = {}, pathParams = {}) {
    let finalEndpoint = endpoint;
    Object.entries(pathParams).forEach(([key, value]) => {
        finalEndpoint = finalEndpoint.replace(`:${key}`, encodeURIComponent(value));
    });
    const url = new URL(`${ZOTERO_API_BASE}${finalEndpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
        }
    });
    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Zotero API request failed: ${response.status} ${response.statusText}`);
        }
        // 检查响应是否为JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }
        else {
            // 如果不是JSON，则返回文本
            return await response.text();
        }
    }
    catch (error) {
        console.error("Error making Zotero request:", error);
        throw error;
    }
}
async function main() {
    const server = new McpServer({
        name: "zotero",
        version: "1.1.0",
    });
    // 1. Ping Tool
    server.tool("ping", "Checks if the Zotero MCP server is running.", {}, async () => {
        try {
            const result = await makeZoteroRequest("/ping");
            return {
                structuredContent: {
                    "application/json": result,
                },
                content: [
                    {
                        type: "text",
                        text: `Ping successful. Timestamp: ${result.timestamp}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Ping failed: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
    });
    // 2. Search Tool
    const searchSchema = {
        // Basic search parameters
        q: z.string().optional().describe("A general-purpose quick search keyword."),
        title: z.string().optional().describe("A keyword to search specifically within item titles."),
        key: z.string().optional().describe("Direct search by item key for detailed information"),
        tags: z.string().optional().describe("Filter by tags, comma-separated for multiple tags"),
        tagMode: z.enum(['any', 'all', 'none']).optional().describe("Tag matching mode: any (OR), all (AND), none (exclude)"),
        tagMatch: z.enum(['exact', 'contains', 'startsWith']).optional().describe("Tag matching method"),
        // Advanced search parameters
        titleOperator: z.enum(['contains', 'exact', 'startsWith', 'endsWith', 'regex']).optional().describe("Title search operator"),
        yearRange: z.string().optional().describe("Year range filter, format: '2020-2023'"),
        dateRange: z.string().optional().describe("Date range filter, format: '2023-01-01,2023-12-31'"),
        relevanceScoring: z.enum(['true', 'false']).optional().describe("Enable relevance scoring"),
        boostFields: z.string().optional().describe("Boost field weights, format: 'title:2.0,abstract:1.5'"),
        sort: z.enum(['relevance', 'date', 'title', 'year']).optional().describe("Sort order"),
        direction: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
    };
    server.tool("search", "Search the Zotero library with basic and advanced criteria. Basic: keywords, title, item key, tags. Advanced: title operators (exact, contains, regex), date/year ranges, relevance scoring with field boosting, custom sorting. Returns core bibliographic data. Use this for finding literature items.", searchSchema, async (params) => {
        try {
            const result = await makeZoteroRequest("/search", params);
            return {
                structuredContent: {
                    "application/json": result,
                },
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
    });
    // 3. Get Item by Key Tool
    const getItemByKeySchema = {
        key: z.string().describe("The unique key of the item to retrieve."),
    };
    server.tool("get_item_by_key", "Gets the full, detailed information for a single item by its unique key. This includes all bibliographic data (e.g., `title`, `creators`, `publicationTitle`, `date`), `abstract`, `URL`, `tags`, `notes`, and related `attachments`.", getItemByKeySchema, async (params) => {
        try {
            const result = await makeZoteroRequest("/search", { key: params.key });
            return {
                structuredContent: {
                    "application/json": result,
                },
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve item with key ${params.key}: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
    });
    // 4. Find Item by Identifier Tool
    const findItemByIdentifierSchema = {
        doi: z.string().optional().describe("The DOI of the item to find."),
        isbn: z.string().optional().describe("The ISBN of the book to find."),
    };
    server.tool("find_item_by_identifier", "Finds a single item by a unique identifier (DOI/ISBN). It returns the first matching item's basic bibliographic data, including `key`, `title`, `itemType`, `date`, and `creators`. The returned `key` can be used with 'get_item_by_key' for full details.", findItemByIdentifierSchema, async (params) => {
        if (!params.doi && !params.isbn) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Error: You must provide either a 'doi' or 'isbn' parameter.",
                    },
                ],
            };
        }
        try {
            const searchQuery = params.doi || params.isbn;
            const searchResponse = await makeZoteroRequest("/search", { q: searchQuery });
            if (!searchResponse.results || searchResponse.results.length === 0) {
                return {
                    content: [{ type: "text", text: "No item found for the given identifier." }],
                };
            }
            // Return the basic information of the first match.
            const firstItem = searchResponse.results[0];
            return {
                structuredContent: {
                    "application/json": firstItem,
                },
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(firstItem, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Identifier search failed: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
    });
    // 5. Get Collections Tool
    server.tool("get_collections", "Gets a hierarchical list of all collections.", {}, async () => {
        try {
            const result = await makeZoteroRequest("/collections");
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get collections: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 6. Search Collections Tool
    const searchCollectionsSchema = {
        q: z.string().describe("The keyword to search for in collection names."),
    };
    server.tool("search_collections", "Searches for collections by name.", searchCollectionsSchema, async (params) => {
        try {
            const result = await makeZoteroRequest("/collections/search", { q: params.q });
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Collection search failed: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 7. Get Collection Details Tool
    const getCollectionDetailsSchema = {
        collectionKey: z.string().describe("The unique key of the collection."),
    };
    server.tool("get_collection_details", "Gets detailed information for a single collection.", getCollectionDetailsSchema, async (params) => {
        try {
            const result = await makeZoteroRequest(`/collections/${params.collectionKey}`);
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get collection details: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 8. Get Collection Items Tool
    const getCollectionItemsSchema = {
        collectionKey: z.string().describe("The unique key of the collection."),
    };
    server.tool("get_collection_items", "Gets all items within a specific collection.", getCollectionItemsSchema, async (params) => {
        try {
            const result = await makeZoteroRequest(`/collections/${params.collectionKey}/items`);
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get collection items: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 9. Get PDF Content Tool
    const getPdfContentSchema = {
        itemKey: z.string().describe("The unique identifier for the literature item."),
        page: z.number().optional().describe("The specific page number of the PDF from which to extract text (starting from 1)."),
        format: z.enum(['text', 'json']).optional().default('text').describe("The format of the returned content, defaults to 'text'."),
    };
    server.tool("get_pdf_content", "Extract text content from PDF attachments of a Zotero item", getPdfContentSchema, async (params) => {
        try {
            const { itemKey, ...queryParams } = params;
            const result = await makeZoteroRequest("/items/:itemKey/pdf-content", queryParams, { itemKey });
            const isJson = typeof result === 'object';
            return {
                structuredContent: isJson ? { "application/json": result } : undefined,
                content: [{ type: "text", text: isJson ? JSON.stringify(result, null, 2) : String(result) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get PDF content: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 10. Search Annotations Tool
    const searchAnnotationsSchema = {
        q: z.string().optional().describe("Search keyword (searches in content, comments, tags)"),
        type: z.string().optional().describe("Annotation type filter (note, highlight, annotation, ink, text, image)"),
        tags: z.string().optional().describe("Tag filter (comma-separated)"),
        color: z.string().optional().describe("Color filter (applicable to highlights)"),
        hasComment: z.boolean().optional().describe("Whether has comment (true/false)"),
        dateRange: z.string().optional().describe("Date range (2023-01-01,2023-12-31)"),
        itemKey: z.string().optional().describe("Limit to specific item"),
        sort: z.enum(['dateAdded', 'dateModified', 'position']).optional().describe("Sort method"),
        direction: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
        limit: z.string().optional().describe("Result limit - preview mode: max 100 (default 20), detailed mode: max 200 (default 50)"),
        offset: z.string().optional().describe("Pagination offset for retrieving more results"),
        detailed: z.boolean().optional().describe("Return full content (true) or preview with truncated content (false, default). Preview mode is recommended for initial overview."),
    };
    server.tool("search_annotations", "Search all notes, PDF annotations and highlights in the Zotero library. Returns metadata first (pagination, total count, search time) followed by results. Use preview mode (default) for overview, detailed mode for full content. Supports filtering, sorting and pagination.", searchAnnotationsSchema, async (params) => {
        try {
            const result = await makeZoteroRequest("/annotations/search", params);
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Annotation search failed: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 11. Get Item Notes Tool
    const getItemNotesSchema = {
        itemKey: z.string().describe("The unique identifier of the item"),
        limit: z.string().optional().describe("Number of notes to return (max 100, default 20)"),
        offset: z.string().optional().describe("Pagination offset"),
    };
    server.tool("get_item_notes", "Get notes content for a specific item with pagination support. Returns metadata first (total count, pagination info) followed by notes data.", getItemNotesSchema, async (params) => {
        try {
            const { itemKey, ...queryParams } = params;
            const result = await makeZoteroRequest("/items/:itemKey/notes", queryParams, { itemKey });
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get item notes: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 12. Get Item Annotations Tool
    const getItemAnnotationsSchema = {
        itemKey: z.string().describe("The unique identifier of the item"),
        type: z.string().optional().describe("Annotation type filter (highlight, annotation, ink, text, image)"),
        color: z.string().optional().describe("Color filter (applicable to highlights)"),
        limit: z.string().optional().describe("Number of annotations to return (max 100, default 20)"),
        offset: z.string().optional().describe("Pagination offset"),
    };
    server.tool("get_item_annotations", "Get PDF annotations and highlights for a specific item with pagination support. Returns metadata first (total count, pagination) followed by annotations. Results are sorted by page position.", getItemAnnotationsSchema, async (params) => {
        try {
            const { itemKey, ...queryParams } = params;
            const result = await makeZoteroRequest("/items/:itemKey/annotations", queryParams, { itemKey });
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get item annotations: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 13. Get Annotation by ID Tool
    const getAnnotationByIdSchema = {
        annotationId: z.string().describe("The unique ID of the annotation to retrieve"),
    };
    server.tool("get_annotation_by_id", "Get the complete content of a specific annotation by its ID. Returns full content without truncation.", getAnnotationByIdSchema, async (params) => {
        try {
            const result = await makeZoteroRequest("/annotations/:annotationId", {}, { annotationId: params.annotationId });
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to get annotation: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    // 14. Get Annotations Batch Tool
    const getAnnotationsBatchSchema = {
        ids: z.array(z.string()).describe("Array of annotation IDs to retrieve"),
    };
    server.tool("get_annotations_batch", "Get complete content of multiple annotations by their IDs in a single request. Returns full content for all requested annotations.", getAnnotationsBatchSchema, async (params) => {
        try {
            const requestBody = JSON.stringify({ ids: params.ids });
            // For batch requests, we need to make a POST request
            // Note: This requires implementing a custom fetch for POST requests
            const url = `${ZOTERO_API_BASE}/annotations/batch`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBody,
            });
            if (!response.ok) {
                throw new Error(`Batch request failed: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();
            return {
                structuredContent: { "application/json": result },
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Batch annotation request failed: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    });
    console.error("Starting Zotero MCP server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
