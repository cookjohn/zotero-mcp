import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ZOTERO_API_BASE = "http://127.0.0.1:23120";

async function makeZoteroRequest(endpoint: string, params: Record<string, any> = {}) {
  const url = new URL(`${ZOTERO_API_BASE}${endpoint}`);
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
    return await response.json();
  } catch (error) {
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
  server.tool(
    "ping",
    "Checks if the Zotero MCP server is running.",
    {},
    async () => {
      try {
        const result = await makeZoteroRequest("/ping");
        return {
          structuredContent: {
            "application/json": result,
          },
          content: [
            {
              type: "text" as const,
              text: `Ping successful. Timestamp: ${result.timestamp}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ping failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 2. Search Tool
  const searchSchema = {
    q: z.string().optional().describe("A general-purpose quick search keyword."),
    title: z.string().optional().describe("A keyword to search specifically within item titles."),
  };

  server.tool(
    "search",
    "Performs a general search of the Zotero library. For each item found, it returns a set of basic bibliographic data, including `key`, `title`, `itemType`, `date`, and `creators`.",
    searchSchema,
    async (params: any) => {
      try {
        const result = await makeZoteroRequest("/search", params);
        return {
          structuredContent: {
            "application/json": result,
          },
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 3. Get Item by Key Tool
  const getItemByKeySchema = {
    key: z.string().describe("The unique key of the item to retrieve."),
  };

  server.tool(
    "get_item_by_key",
    "Gets the full, detailed information for a single item by its unique key. This includes all bibliographic data (e.g., `title`, `creators`, `publicationTitle`, `date`), `abstract`, `URL`, `tags`, `notes`, and related `attachments`.",
    getItemByKeySchema,
    async (params: { key: string }) => {
      try {
        const result = await makeZoteroRequest("/search", { key: params.key });
        return {
          structuredContent: {
            "application/json": result,
          },
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to retrieve item with key ${params.key}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 4. Find Item by Identifier Tool
  const findItemByIdentifierSchema = {
    doi: z.string().optional().describe("The DOI of the item to find."),
    isbn: z.string().optional().describe("The ISBN of the book to find."),
  };

  server.tool(
    "find_item_by_identifier",
    "Finds a single item by a unique identifier (DOI/ISBN). It returns the first matching item's basic bibliographic data, including `key`, `title`, `itemType`, `date`, and `creators`. The returned `key` can be used with 'get_item_by_key' for full details.",
    findItemByIdentifierSchema,
    async (params: any) => {
      if (!params.doi && !params.isbn) {
        return {
          content: [
            {
              type: "text" as const,
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
            content: [{ type: "text" as const, text: "No item found for the given identifier." }],
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
              type: "text" as const,
              text: JSON.stringify(firstItem, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Identifier search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  console.error("Starting Zotero MCP server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});