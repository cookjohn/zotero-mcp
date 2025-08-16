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
        version: "0.3.0", // Refactored tools for clarity
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
        q: z.string().optional().describe("A general-purpose quick search keyword."),
        title: z.string().optional().describe("A keyword to search specifically within item titles."),
        key: z.string().optional().describe("Direct search by item key for detailed information"),
        tags: z.string().optional().describe("Filter by tags, comma-separated for multiple tags"),
        tagMode: z.enum(['any', 'all', 'none']).optional().describe("Tag matching mode: any (OR), all (AND), none (exclude)"),
        tagMatch: z.enum(['exact', 'contains', 'startsWith']).optional().describe("Tag matching method"),
    };
    server.tool("search", "Performs a search of the Zotero library with multiple criteria. It can search by keywords, title, item key, and tags. For each item found, it returns basic bibliographic data, including `key`, `title`, `itemType`, `date`, and `creators`.", searchSchema, async (params) => {
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
    console.error("Starting Zotero MCP server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
