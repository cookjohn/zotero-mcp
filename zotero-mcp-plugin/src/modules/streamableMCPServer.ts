import {
  handleGetLibraries,
  handleSearchLibraries,
  handleSearch,
  handleGetItem,
  handleGetCollections,
  handleSearchCollections,
  handleGetCollectionDetails,
  handleGetCollectionItems,
  handleGetSubcollections,
  handleSearchFulltext,
  handleGetItemAbstract,
  handleCreateCollection,
  handleUpdateCollection,
  handleDeleteCollection,
  handleAddItemsToCollection,
  handleRemoveItemsFromCollection,
} from "./apiHandlers";
import { UnifiedContentExtractor } from "./unifiedContentExtractor";
import { SmartAnnotationExtractor } from "./smartAnnotationExtractor";
import { MCPSettingsService } from "./mcpSettingsService";
import { getSemanticSearchService, SemanticSearchService } from "./semantic";
import {
  applyToolPolicy,
  DESTRUCTIVE_TOOL_NAMES,
  getAllToolNames,
  getToolPolicySummary,
  SEMANTIC_TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from "./mcpToolPolicy";

const WRITE_PREF_KEY = "extensions.zotero.zotero-mcp-plugin.write.enabled";
const WRITE_DISABLED_MESSAGE =
  'Write operations are currently disabled. Please go to Zotero Tools > Add-ons > Zotero MCP Plugin > Preferences, and enable "Write Operations" to use this feature.';
const DEFAULT_EXPORT_MAX_ITEMS = 50;
const DEFAULT_EXPORT_MAX_OUTPUT_CHARS = 200000;
const EXPORT_PREVIEW_CHARS = 4000;

export interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  sessionId?: string;
}

export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

/**
 * Streamable HTTP-based MCP Server integrated into Zotero Plugin
 *
 * This provides a complete MCP (Model Context Protocol) server implementation
 * that runs directly within the Zotero plugin. AI clients can connect using
 * streamable HTTP requests for real-time bidirectional communication.
 *
 * Architecture: AI Client (streamable HTTP) ↔ Zotero Plugin (integrated MCP server)
 */
export class StreamableMCPServer {
  private isInitialized: boolean = false;
  private serverInfo = {
    name: "zotero-integrated-mcp",
    version: "1.5.0-codex.1",
  };
  private clientSessions: Map<
    string,
    { initTime: Date; lastActivity: Date; clientInfo?: any }
  > = new Map();

  constructor() {
    // No initialization needed - using direct function calls
  }

  /**
   * Handle incoming MCP requests and return HTTP response
   */
  async handleMCPRequest(requestBody: string): Promise<{
    status: number;
    statusText: string;
    headers: any;
    body: string;
  }> {
    let parsedRequest: unknown;

    try {
      parsedRequest = JSON.parse(requestBody);
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Parse error: ${error}`);

      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      };

      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(errorResponse),
      };
    }

    try {
      if (Array.isArray(parsedRequest)) {
        const batchError = this.createError(
          null,
          -32600,
          "Invalid Request: batch requests are not supported",
        );
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(batchError),
        };
      }

      if (!parsedRequest || typeof parsedRequest !== "object") {
        const invalidRequest = this.createError(
          null,
          -32600,
          "Invalid Request",
        );
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(invalidRequest),
        };
      }

      const request = parsedRequest as MCPRequest;
      if (typeof request.method !== "string" || !request.method.trim()) {
        const invalidRequest = this.createError(
          null,
          -32600,
          "Invalid Request: method is required",
        );
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(invalidRequest),
        };
      }

      ztoolkit.log(`[StreamableMCP] Received: ${request.method}`);

      const response = await this.processRequest(request);

      if (response === null) {
        return {
          status: 202,
          statusText: "Accepted",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: "",
        };
      }

      const status = this.getHttpStatusForResponse(response);
      return {
        status,
        statusText: status === 400 ? "Bad Request" : "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(response),
      };
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error handling request: ${error}`);

      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Internal error",
        },
      };

      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(errorResponse),
      };
    }
  }

  /**
   * Process individual MCP requests
   */
  private async processRequest(
    request: MCPRequest,
  ): Promise<MCPResponse | null> {
    const isNotification = this.isNotificationRequest(request);

    if (isNotification) {
      switch (request.method) {
        case "initialized":
        case "notifications/initialized":
          this.isInitialized = true;
          ztoolkit.log("[StreamableMCP] Client initialized (notification)");
          return null;
        default:
          if (request.method.startsWith("notifications/")) {
            ztoolkit.log(
              `[StreamableMCP] Ignoring unsupported notification: ${request.method}`,
            );
            return null;
          }
          return this.createError(
            null,
            -32600,
            `Invalid Request: id is required for method ${request.method}`,
          );
      }
    }

    try {
      switch (request.method) {
        case "initialize":
          return this.handleInitialize(request);

        case "initialized":
        case "notifications/initialized":
          this.isInitialized = true;
          ztoolkit.log("[StreamableMCP] Client initialized");
          return this.createResponse(request.id ?? null, { success: true });

        case "tools/list":
          return this.handleToolsList(request);

        case "tools/call":
          return await this.handleToolCall(request);

        case "resources/list":
          return this.handleResourcesList(request);

        case "prompts/list":
          return this.handlePromptsList(request);

        case "ping":
          return this.handlePing(request);

        default:
          return this.createError(
            request.id ?? null,
            -32601,
            `Method not found: ${request.method}`,
          );
      }
    } catch (error) {
      ztoolkit.log(
        `[StreamableMCP] Error processing ${request.method}: ${error}`,
      );
      return this.createError(request.id ?? null, -32603, "Internal error");
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    // Extract client info from initialize request
    const clientInfo = request.params?.clientInfo || {};
    const sessionId = this.generateSessionId();

    // Store session info
    this.clientSessions.set(sessionId, {
      initTime: new Date(),
      lastActivity: new Date(),
      clientInfo,
    });

    ztoolkit.log(
      `[StreamableMCP] Client initialized with session: ${sessionId}, client: ${clientInfo.name || "unknown"}`,
    );

    // Create standard MCP initialize response (no custom fields)
    return this.createResponse(request.id ?? null, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: true,
        },
        logging: {},
        prompts: {},
        resources: {},
      },
      serverInfo: this.serverInfo,
    });
  }

  private generateSessionId(): string {
    return (
      "mcp-session-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).substr(2, 9)
    );
  }

  private handleResourcesList(request: MCPRequest): MCPResponse {
    // Return empty resources list - we don't currently support resources
    return this.createResponse(request.id ?? null, { resources: [] });
  }

  private handlePromptsList(request: MCPRequest): MCPResponse {
    // Return empty prompts list - we don't currently support prompts
    return this.createResponse(request.id ?? null, { prompts: [] });
  }

  private handlePing(request: MCPRequest): MCPResponse {
    // Standard MCP ping response - just return empty result
    return this.createResponse(request.id ?? null, {});
  }

  private getHttpStatusForResponse(response: MCPResponse): number {
    if (!response.error) {
      return 200;
    }

    // Align transport status for structural request errors.
    if (response.error.code === -32600 || response.error.code === -32700) {
      return 400;
    }

    return 200;
  }

  private handleToolsList(request: MCPRequest): MCPResponse {
    const tools = [
      {
        name: "zotero_status",
        description:
          "Inspect the local Zotero MCP server, endpoint, active preferences, tool policy, and integration guidance. Use this first when connecting a new agent client such as Codex or Kimi Code.",
        inputSchema: {
          type: "object",
          properties: {
            includeToolPolicy: {
              type: "boolean",
              default: true,
              description: "Include read/write/destructive tool policy summary",
            },
            includeSemanticStats: {
              type: "boolean",
              default: false,
              description:
                "Also include semantic index status. This may touch the local vector database.",
            },
          },
        },
      },
      {
        name: "get_libraries",
        description:
          "List all Zotero libraries available in the current client. Returns minimal library metadata for each library as a paginated array.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum results to return" },
            offset: { type: "number", description: "Pagination offset" },
          },
        },
      },
      {
        name: "search_library",
        description:
          'Search the Zotero library with advanced parameters, boolean operators, relevance scoring, and pagination. Results are from user\'s personal library. Use itemKey with get_content for full text. To find standalone PDFs without metadata, use itemType="attachment" with includeAttachments="true".',
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            q: { type: "string", description: "General search query" },
            title: { type: "string", description: "Title search" },
            titleOperator: {
              type: "string",
              enum: ["contains", "exact", "startsWith", "endsWith", "regex"],
              description: "Title search operator",
            },
            yearRange: {
              type: "string",
              description: 'Year range (e.g., "2020-2023")',
            },
            fulltext: {
              type: "string",
              description: "Full-text search in attachments and notes",
            },
            fulltextMode: {
              type: "string",
              enum: ["attachment", "note", "both"],
              description:
                "Full-text search mode: attachment (PDFs only), note (notes only), both (default)",
            },
            fulltextOperator: {
              type: "string",
              enum: ["contains", "exact", "regex"],
              description: "Full-text search operator (default: contains)",
            },
            itemType: {
              type: "string",
              description:
                'Filter by item type (e.g., "attachment" to list standalone files like PDFs imported without metadata, "journalArticle", "book", etc.)',
            },
            includeAttachments: {
              type: "string",
              enum: ["true", "false"],
              description:
                'Include standalone attachment items (e.g., PDFs without parent item) in results. Must be "true" when itemType is "attachment". Default: false.',
            },
            mode: {
              type: "string",
              enum: ["minimal", "preview", "standard", "complete"],
              description:
                "Processing mode: minimal (30 results), preview (100), standard (adaptive), complete (500+). Uses user default if not specified.",
            },
            relevanceScoring: {
              type: "boolean",
              description: "Enable relevance scoring",
            },
            sort: {
              type: "string",
              enum: ["relevance", "date", "title", "year"],
              description: "Sort order",
            },
            limit: {
              type: "number",
              description: "Maximum results to return (overrides mode default)",
            },
            offset: { type: "number", description: "Pagination offset" },
          },
        },
      },
      {
        name: "search_libraries",
        description: "Search libraries by name",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string", description: "Library name search query" },
            limit: { type: "number", description: "Maximum results to return" },
            offset: { type: "number", description: "Pagination offset" },
          },
          required: ["q"],
        },
      },
      {
        name: "search_annotations",
        description:
          "Search and filter annotations (highlights, notes, comments) by query, colors, or tags. Returns user's personal research notes with relevance scoring. Preserve exact wording when quoting.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            q: {
              type: "string",
              description: "Search query (optional if colors or tags provided)",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Limit search to specific items",
            },
            types: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "note",
                  "highlight",
                  "annotation",
                  "ink",
                  "text",
                  "image",
                ],
              },
              description: "Types of annotations to search",
            },
            colors: {
              type: "array",
              items: { type: "string" },
              description:
                "Filter by colors. Use hex codes (#ffd400) or names (yellow, red, green, blue, purple, orange). Common mappings: yellow=question, red=error/important, green=agree, blue=info, purple=definition",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Filter by tags attached to annotations",
            },
            mode: {
              type: "string",
              enum: ["standard", "preview", "complete", "minimal"],
              description:
                "Content processing mode (uses user setting default if not specified)",
            },
            maxTokens: {
              type: "number",
              description:
                "Token budget (uses user setting default if not specified)",
            },
            minRelevance: {
              type: "number",
              minimum: 0,
              maximum: 1,
              default: 0.1,
              description:
                "Minimum relevance threshold (only applies when q is provided)",
            },
            limit: {
              type: "number",
              default: 15,
              description: "Maximum results",
            },
            offset: {
              type: "number",
              default: 0,
              description: "Pagination offset",
            },
          },
          description: "Requires at least one of: q (query), colors, or tags",
        },
      },
      {
        name: "get_item_details",
        description:
          "Get detailed bibliographic metadata for a specific item (title, authors, dates, identifiers, attachments, notes, tags). Use get_content for full text. Suitable for generating citations and references.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: { type: "string", description: "Unique item key" },
            mode: {
              type: "string",
              enum: ["minimal", "preview", "standard", "complete"],
              description:
                "Processing mode: minimal (basic info), preview (key fields), standard (comprehensive), complete (all fields). Uses user default if not specified.",
            },
          },
          required: ["itemKey"],
        },
      },
      {
        name: "get_annotations",
        description:
          "Get annotations and notes for specific items with color/tag filtering. REQUIRED: provide one of itemKey, annotationId, or annotationIds (use search_library first to find the itemKey; use search_annotations to search by colors/tags across the library). Returns user's personal highlights and comments from PDFs. Preserve exact wording when quoting.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: {
              type: "string",
              description: "Get all annotations for this item",
            },
            annotationId: {
              type: "string",
              description: "Get specific annotation by ID",
            },
            annotationIds: {
              type: "array",
              items: { type: "string" },
              description: "Get multiple annotations by IDs",
            },
            types: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "note",
                  "highlight",
                  "annotation",
                  "ink",
                  "text",
                  "image",
                ],
              },
              default: ["note", "highlight", "annotation"],
              description: "Types of annotations to include",
            },
            colors: {
              type: "array",
              items: { type: "string" },
              description:
                'Filter by colors. Use hex codes (#ffd400) or names (yellow, red, green, blue, purple, orange). Example: ["yellow", "red"] to get question and error annotations',
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Filter by tags attached to annotations",
            },
            mode: {
              type: "string",
              enum: ["standard", "preview", "complete", "minimal"],
              description:
                "Content processing mode (uses user setting default if not specified)",
            },
            maxTokens: {
              type: "number",
              description:
                "Token budget (uses user setting default if not specified)",
            },
            limit: {
              type: "number",
              default: 20,
              description: "Maximum results",
            },
            offset: {
              type: "number",
              default: 0,
              description: "Pagination offset",
            },
          },
          description:
            "Requires either itemKey, annotationId, or annotationIds parameter",
        },
      },
      {
        name: "get_content",
        description:
          "Get full-text content from PDFs, attachments, notes, and abstracts. May contain OCR artifacts. When user asks for complete text, provide it without summarization.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: {
              type: "string",
              description: "Item key to get all content from this item",
            },
            attachmentKey: {
              type: "string",
              description:
                "Attachment key to get content from specific attachment",
            },
            mode: {
              type: "string",
              enum: ["minimal", "preview", "standard", "complete"],
              description:
                "Content processing mode: minimal (500 chars, fastest), preview (1.5K chars, quick scan), standard (3K chars, balanced), complete (unlimited, complete content). Uses user default if not specified.",
            },
            include: {
              type: "object",
              properties: {
                pdf: {
                  type: "boolean",
                  default: true,
                  description: "Include PDF attachments content",
                },
                attachments: {
                  type: "boolean",
                  default: true,
                  description: "Include other attachments content",
                },
                notes: {
                  type: "boolean",
                  default: true,
                  description: "Include notes content",
                },
                abstract: {
                  type: "boolean",
                  default: true,
                  description: "Include abstract",
                },
                webpage: {
                  type: "boolean",
                  default: false,
                  description:
                    "Include webpage snapshots (auto-enabled in standard/complete modes)",
                },
              },
              description: "Content types to include (only applies to itemKey)",
            },
            contentControl: {
              type: "object",
              properties: {
                preserveOriginal: {
                  type: "boolean",
                  default: true,
                  description:
                    "Always preserve original text structure when processing",
                },
                allowExtended: {
                  type: "boolean",
                  default: false,
                  description:
                    "Allow retrieving more content than mode default when important",
                },
                expandIfImportant: {
                  type: "boolean",
                  default: false,
                  description:
                    "Expand content length for high-importance content",
                },
                maxContentLength: {
                  type: "number",
                  description:
                    "Override maximum content length for this request",
                },
                prioritizeCompleteness: {
                  type: "boolean",
                  default: false,
                  description:
                    "Prioritize complete sentences/paragraphs over strict length limits",
                },
                standardExpansion: {
                  type: "object",
                  properties: {
                    enabled: {
                      type: "boolean",
                      default: false,
                      description: "Enable standard content expansion",
                    },
                    trigger: {
                      type: "string",
                      enum: ["high_importance", "user_query", "context_needed"],
                      default: "high_importance",
                      description: "Trigger condition for standard expansion",
                    },
                    maxExpansionRatio: {
                      type: "number",
                      default: 2.0,
                      minimum: 1.0,
                      maximum: 10.0,
                      description:
                        "Maximum expansion ratio (1.0 = no expansion, 2.0 = double)",
                    },
                  },
                  description: "Smart expansion configuration",
                },
              },
              description:
                "Advanced content control parameters to override mode defaults",
            },
            format: {
              type: "string",
              enum: ["json", "text"],
              default: "json",
              description:
                "Output format: json (structured with metadata) or text (plain text)",
            },
          },
          description: "Requires either itemKey or attachmentKey parameter",
        },
      },
      {
        name: "get_collections",
        description:
          "Get collections in the library. By default returns a flat, paginated list of top-level collections. Use recursive=true to retrieve the complete nested collection tree (all levels) in one call. Use parentCollection to scope to a specific parent's direct children.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            mode: {
              type: "string",
              enum: ["minimal", "preview", "standard", "complete"],
              description:
                "Processing mode: minimal (20 collections), preview (50), standard (100), complete (500+). Uses user default if not specified. Ignored when recursive=true.",
            },
            limit: {
              type: "number",
              description:
                "Maximum results to return (overrides mode default). Ignored when recursive=true.",
            },
            offset: {
              type: "number",
              description: "Pagination offset. Ignored when recursive=true.",
            },
            recursive: {
              type: "boolean",
              description:
                "When true, recursively return the full nested collection tree. Each collection includes a subcollections array of its children. Pagination is ignored.",
            },
            parentCollection: {
              type: "string",
              description:
                "Key of a parent collection. When provided, returns direct children of that collection instead of top-level collections.",
            },
          },
        },
      },
      {
        name: "search_collections",
        description: "Search collections by name",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            q: { type: "string", description: "Collection name search query" },
            limit: { type: "number", description: "Maximum results to return" },
          },
        },
      },
      {
        name: "get_collection_details",
        description: "Get detailed information about a specific collection",
        inputSchema: {
          type: "object",
          properties: {
            collectionKey: { type: "string", description: "Collection key" },
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
          },
          required: ["collectionKey"],
        },
      },
      {
        name: "get_collection_items",
        description: "Get items in a specific collection",
        inputSchema: {
          type: "object",
          properties: {
            collectionKey: { type: "string", description: "Collection key" },
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            limit: { type: "number", description: "Maximum results to return" },
            offset: { type: "number", description: "Pagination offset" },
          },
          required: ["collectionKey"],
        },
      },
      {
        name: "get_subcollections",
        description:
          "Get subcollections (child collections) of a specific collection. Use recursive=true to retrieve the full nested hierarchy of all descendant collections.",
        inputSchema: {
          type: "object",
          properties: {
            collectionKey: {
              type: "string",
              description: "Parent collection key",
            },
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            limit: {
              type: "number",
              description:
                "Maximum results to return (default: 100). Ignored when recursive=true.",
            },
            offset: {
              type: "number",
              description:
                "Pagination offset (default: 0). Ignored when recursive=true.",
            },
            recursive: {
              type: "boolean",
              description:
                "When true, recursively return all descendant subcollections as a nested tree (default: false).",
            },
          },
          required: ["collectionKey"],
        },
      },
      {
        name: "create_collection",
        description:
          "Create a new collection in the library. Optionally nest it under a parent collection.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            name: { type: "string", description: "Name of the new collection" },
            parentCollection: {
              type: "string",
              description:
                "Key of the parent collection. If omitted, creates a top-level collection.",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "update_collection",
        description:
          "Rename or move an existing collection. Provide name to rename, parentCollection to move (empty string moves to top level).",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            collectionKey: {
              type: "string",
              description: "Key of the collection to update",
            },
            name: {
              type: "string",
              description: "New name for the collection",
            },
            parentCollection: {
              type: "string",
              description:
                'Key of the new parent collection. Use empty string "" to move to top level.',
            },
          },
          required: ["collectionKey"],
        },
      },
      {
        name: "delete_collection",
        description:
          "Delete a collection. WARNING: This is a destructive operation. By default, items in the collection are NOT deleted (only removed from the collection). Set deleteItems=true to also send items to trash.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            collectionKey: {
              type: "string",
              description: "Key of the collection to delete",
            },
            deleteItems: {
              type: "boolean",
              description:
                "If true, also send items in the collection to trash. Default: false (items remain in library).",
            },
          },
          required: ["collectionKey"],
        },
      },
      {
        name: "add_items_to_collection",
        description:
          "Add one or more items to a collection by their item keys.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            collectionKey: {
              type: "string",
              description: "Key of the target collection",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Array of item keys to add to the collection",
            },
          },
          required: ["collectionKey", "itemKeys"],
        },
      },
      {
        name: "remove_items_from_collection",
        description:
          "Remove one or more items from a collection. Items are NOT deleted from the library, only removed from this collection.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            collectionKey: {
              type: "string",
              description: "Key of the collection",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Array of item keys to remove from the collection",
            },
          },
          required: ["collectionKey", "itemKeys"],
        },
      },
      {
        name: "search_fulltext",
        description:
          "Search within full-text content of all documents. Returns matching passages with context. Use get_content with itemKey for complete text of a result.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            q: { type: "string", description: "Search query" },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Limit search to specific items (optional)",
            },
            mode: {
              type: "string",
              enum: ["minimal", "preview", "standard", "complete"],
              description:
                "Processing mode: minimal (100 context), preview (200), standard (adaptive), complete (400+). Uses user default if not specified.",
            },
            contextLength: {
              type: "number",
              description:
                "Context length around matches (overrides mode default)",
            },
            maxResults: {
              type: "number",
              description: "Maximum results to return (overrides mode default)",
            },
            caseSensitive: {
              type: "boolean",
              description: "Case sensitive search (default: false)",
            },
          },
          required: ["q"],
        },
      },
      {
        name: "get_item_abstract",
        description:
          "Get the abstract/summary of a specific item. Typically the author's own summary from the original publication.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: { type: "string", description: "Item key" },
            format: {
              type: "string",
              enum: ["json", "text"],
              description: "Response format (default: json)",
            },
          },
          required: ["itemKey"],
        },
      },
      {
        name: "list_export_formats",
        description:
          "List available Zotero export translators and CSL citation styles. Use this before export_items or format_citation when the user requests a specific citation/export style.",
        inputSchema: {
          type: "object",
          properties: {
            includeTranslators: {
              type: "boolean",
              default: true,
              description:
                "Include export translators such as BibTeX, RIS, and CSL JSON",
            },
            includeStyles: {
              type: "boolean",
              default: true,
              description:
                "Include visible CSL styles such as APA, Chicago, Vancouver, etc.",
            },
            query: {
              type: "string",
              description: "Optional case-insensitive label/title filter",
            },
            limit: {
              type: "number",
              default: 100,
              description: "Maximum rows per category",
            },
          },
        },
      },
      {
        name: "export_items",
        description:
          "Export Zotero items using a Zotero export translator, e.g. BibTeX, BibLaTeX, RIS, or CSL JSON. This is read-only and does not modify the library.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Item keys to export",
            },
            format: {
              type: "string",
              enum: [
                "bibtex",
                "biblatex",
                "ris",
                "csljson",
                "zoteroRDF",
                "translator",
              ],
              default: "bibtex",
              description:
                "Common export format. Use translator with translatorID or translatorLabel for other translators.",
            },
            translatorID: {
              type: "string",
              description: "Explicit Zotero export translator ID",
            },
            translatorLabel: {
              type: "string",
              description: "Translator label or partial label to match",
            },
            includeNotes: {
              type: "boolean",
              default: false,
              description:
                "Pass exportNotes=true to translators that support note export",
            },
            useJournalAbbreviation: {
              type: "boolean",
              default: false,
              description:
                "Pass useJournalAbbreviation=true to translators that support it",
            },
            maxItems: {
              type: "number",
              default: DEFAULT_EXPORT_MAX_ITEMS,
              description:
                "Safety limit for number of items exported in one response",
            },
            maxOutputChars: {
              type: "number",
              default: DEFAULT_EXPORT_MAX_OUTPUT_CHARS,
              description:
                "Safety limit for returned export text. Oversized exports return metadata and a short preview instead of the full output.",
            },
          },
          required: ["itemKeys"],
        },
      },
      {
        name: "format_citation",
        description:
          "Format Zotero items as a CSL bibliography or in-text citation using a Zotero style. Supports text and HTML output.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description:
                "Item keys to cite. Use citationItems instead when locators/prefixes/suffixes are needed.",
            },
            citationItems: {
              type: "array",
              description:
                "Structured citation items for in-text citations. Each item supports itemKey, locator, label, prefix, suffix, and suppressAuthor.",
              items: {
                type: "object",
                properties: {
                  itemKey: { type: "string", description: "Zotero item key" },
                  locator: {
                    type: "string",
                    description: "Page/section locator, e.g. 23-24",
                  },
                  label: {
                    type: "string",
                    description:
                      "CSL locator label, e.g. page, chapter, section",
                  },
                  prefix: {
                    type: "string",
                    description: "Text before this citation item",
                  },
                  suffix: {
                    type: "string",
                    description: "Text after this citation item",
                  },
                  suppressAuthor: {
                    type: "boolean",
                    description: "Suppress author in author-in-text citations",
                  },
                },
                required: ["itemKey"],
              },
            },
            style: {
              type: "string",
              default: "http://www.zotero.org/styles/apa",
              description:
                "CSL style ID, e.g. http://www.zotero.org/styles/apa",
            },
            locale: {
              type: "string",
              description: "Optional CSL locale, e.g. en-US or zh-CN",
            },
            mode: {
              type: "string",
              enum: ["bibliography", "citation"],
              default: "bibliography",
              description:
                "bibliography for reference list entries; citation for in-text citation cluster",
            },
            output: {
              type: "string",
              enum: ["text", "html", "both"],
              default: "text",
              description: "Return plain text, HTML, or both",
            },
          },
          description: "Requires itemKeys or citationItems",
        },
      },
      {
        name: "better_bibtex_status",
        description:
          "Detect Better BibTeX availability and optionally return citekeys for selected items. This is read-only and does not require Better BibTeX to be installed.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional item keys to resolve citation keys for when Better BibTeX exposes a KeyManager API",
            },
          },
        },
      },
      // Semantic Search Tools
      {
        name: "semantic_search",
        description:
          "AI-powered semantic search using embeddings. Finds conceptually related content even without exact keyword matches. Combine with keyword search (search_library, search_fulltext) for comprehensive results.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                'Natural language search query (e.g., "machine learning in healthcare")',
            },
            topK: {
              type: "number",
              description: "Number of results to return (default: 10)",
            },
            minScore: {
              type: "number",
              description: "Minimum similarity score 0-1 (default: 0.3)",
            },
            language: {
              type: "string",
              enum: ["zh", "en", "all"],
              description: "Filter by language (default: all)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "find_similar",
        description:
          "Find items semantically similar to a given item using AI embeddings. Useful for expanding research from a known relevant paper and discovering thematic clusters.",
        inputSchema: {
          type: "object",
          properties: {
            itemKey: {
              type: "string",
              description: "The item key to find similar items for",
            },
            topK: {
              type: "number",
              description: "Number of similar items to return (default: 5)",
            },
            minScore: {
              type: "number",
              description: "Minimum similarity score 0-1 (default: 0.5)",
            },
          },
          required: ["itemKey"],
        },
      },
      {
        name: "semantic_status",
        description:
          "Get the status of the semantic search service including index statistics.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      // Full-text Database Tool (read-only operations)
      {
        name: "fulltext_database",
        description:
          "Access the cached full-text content database (read-only). Faster than re-extracting from Zotero. Actions: list (cached items), search (find text), get (retrieve content), stats (database info).",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "search", "get", "stats"],
              description:
                "Action: list (show cached items), search (search within content), get (get full content), stats (database statistics)",
            },
            query: {
              type: "string",
              description: "Search query (required for search action)",
            },
            itemKeys: {
              type: "array",
              items: { type: "string" },
              description: "Item keys for get action",
            },
            limit: {
              type: "number",
              description:
                "Maximum results to return (default: 20 for list/search)",
            },
            caseSensitive: {
              type: "boolean",
              description: "Case sensitive search (default: false)",
            },
          },
          required: ["action"],
        },
      },
      // Write Tools
      {
        name: "write_note",
        description:
          "Create or modify Zotero notes. Supports child notes (attached to items), standalone notes, updating, or appending. Markdown is auto-converted to HTML. Confirm with user before writing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            action: {
              type: "string",
              enum: ["create", "update", "append"],
              description:
                "create: new note, update: replace content, append: add to end",
            },
            parentKey: {
              type: "string",
              description:
                "Item key to attach note to (create action only, omit for standalone note)",
            },
            noteKey: {
              type: "string",
              description:
                "Existing note key (required for update/append actions)",
            },
            content: {
              type: "string",
              description:
                "Note content in HTML or Markdown format. Markdown is auto-converted to HTML for Zotero storage.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags to add to the note",
            },
          },
          required: ["action", "content"],
        },
      },
      {
        name: "write_tag",
        description:
          "Add, remove, or replace tags on Zotero items. Works on any item type. Response includes before/after tag lists for verification. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            action: {
              type: "string",
              enum: ["add", "remove", "set"],
              description:
                "add: add tags (keep existing), remove: remove specific tags, set: replace all tags with provided list",
            },
            itemKey: {
              type: "string",
              description: "Item key to modify tags on",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags to add/remove/set",
            },
          },
          required: ["action", "itemKey", "tags"],
        },
      },
      {
        name: "write_metadata",
        description:
          "Update metadata fields on Zotero items (title, abstract, date, URL, DOI, creators, etc.). Only works on regular items, not notes or attachments. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: {
              type: "string",
              description: "Item key to update metadata on",
            },
            fields: {
              type: "object",
              description:
                "Fields to update. Common fields: title, abstractNote, date, url, DOI, language, shortTitle, volume, issue, pages, publisher, place, ISBN, ISSN, extra, rights, series, seriesNumber, edition, numPages, journalAbbreviation, publicationTitle, bookTitle",
              additionalProperties: { type: "string" },
            },
            creators: {
              type: "array",
              description:
                "Set the creators list (replaces all existing creators). Each creator has creatorType (author/editor/translator/etc.), and either firstName+lastName or name (for organizations).",
              items: {
                type: "object",
                properties: {
                  creatorType: {
                    type: "string",
                    description:
                      "Creator type: author, editor, translator, contributor, bookAuthor, seriesEditor, reviewedAuthor, etc.",
                  },
                  firstName: {
                    type: "string",
                    description: "First name (for individuals)",
                  },
                  lastName: {
                    type: "string",
                    description: "Last name (for individuals)",
                  },
                  name: {
                    type: "string",
                    description:
                      "Full name (for organizations, use instead of firstName/lastName)",
                  },
                },
                required: ["creatorType"],
              },
            },
          },
          required: ["itemKey"],
        },
      },
      {
        name: "write_item",
        description:
          "Create a new Zotero item, re-parent existing attachments, or import a local file as an attachment. Common workflows: (1) read PDF → extract metadata → create item → attach PDF via attachmentKeys; (2) convert PDF to Markdown → import the .md file as attachment via import action. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            action: {
              type: "string",
              enum: ["create", "reparent", "import"],
              description:
                "create: create a new item with metadata. reparent: move an attachment under a different parent item. import: import a local file (e.g., Markdown, PDF) as an attachment to an existing item.",
            },
            itemType: {
              type: "string",
              description:
                "Item type for create action (e.g., journalArticle, book, conferencePaper, thesis, report, webpage, preprint, bookSection, etc.)",
            },
            fields: {
              type: "object",
              description:
                "Metadata fields for create action. Common: title, abstractNote, date, url, DOI, language, volume, issue, pages, publisher, place, publicationTitle, bookTitle, etc.",
              additionalProperties: { type: "string" },
            },
            creators: {
              type: "array",
              description:
                "Creators for create action. Each: {creatorType, firstName, lastName} or {creatorType, name} for organizations.",
              items: {
                type: "object",
                properties: {
                  creatorType: {
                    type: "string",
                    description:
                      "author, editor, translator, contributor, etc.",
                  },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  name: { type: "string", description: "For organizations" },
                },
                required: ["creatorType"],
              },
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags to add to the new item",
            },
            attachmentKeys: {
              type: "array",
              items: { type: "string" },
              description:
                "For create: existing standalone attachment keys to re-parent under the new item. For reparent: attachment keys to move.",
            },
            parentKey: {
              type: "string",
              description:
                "For reparent action: the target parent item key to move attachments to",
            },
            filePath: {
              type: "string",
              description:
                "For import action: absolute path to the file to import as an attachment",
            },
            parentItemKey: {
              type: "string",
              description:
                "For import action: Zotero item key of the parent to attach the file to",
            },
            title: {
              type: "string",
              description:
                "For import action: display title for the attachment (defaults to the file name)",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "import_by_identifier",
        description:
          "Import new Zotero items from identifiers such as DOI, ISBN, PMID, or arXiv. This may access translator/provider network services and writes new items to the library. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            identifier: {
              type: "string",
              description:
                "Single identifier string. Can contain DOI, ISBN, PMID, arXiv, or similar identifiers Zotero can extract.",
            },
            identifiers: {
              type: "array",
              items: { type: "string" },
              description: "Multiple identifier strings",
            },
            collectionKey: {
              type: "string",
              description: "Optional collection key to add imported items to",
            },
            collectionKeys: {
              type: "array",
              items: { type: "string" },
              description: "Optional collection keys to add imported items to",
            },
            saveAttachments: {
              type: "boolean",
              default: true,
              description:
                "Let Zotero translators save available attachments when supported",
            },
            dryRun: {
              type: "boolean",
              default: false,
              description:
                "Parse identifiers and show what would be imported without writing to Zotero",
            },
          },
          description: "Requires identifier or identifiers",
        },
      },
      {
        name: "attach_url",
        description:
          "Import or link a URL as a Zotero attachment. Use import mode to download/store the resource and link mode to create a linked URL attachment without downloading. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            url: {
              type: "string",
              description: "HTTP or HTTPS URL to import or link",
            },
            mode: {
              type: "string",
              enum: ["import", "link"],
              default: "import",
              description:
                "import downloads/stores the URL; link creates a linked URL attachment without downloading",
            },
            parentItemKey: {
              type: "string",
              description: "Optional parent regular item key",
            },
            collectionKey: {
              type: "string",
              description: "Optional collection key for standalone attachments",
            },
            title: { type: "string", description: "Optional attachment title" },
            fileBaseName: {
              type: "string",
              description:
                "Optional base filename for downloaded imported attachments",
            },
            contentType: {
              type: "string",
              description: "Optional MIME type override, e.g. application/pdf",
            },
            referrer: {
              type: "string",
              description: "Optional HTTP referrer for downloads",
            },
            renameIfAllowedType: {
              type: "boolean",
              default: true,
              description:
                "Let Zotero derive attachment filename from parent item metadata for allowed file types",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "download_open_access_pdf",
        description:
          "Find and optionally attach an available open-access PDF or EPUB to an existing Zotero item using Zotero built-in file resolvers. Dry-run by default; confirm with user before saving an attachment.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            itemKey: {
              type: "string",
              description:
                "Parent regular item key to inspect or attach a downloaded file to",
            },
            methods: {
              type: "array",
              items: {
                type: "string",
                enum: ["oa", "doi", "url", "custom"],
              },
              description:
                "Zotero file resolver methods to try in order. Defaults to oa, doi, url, custom.",
            },
            dryRun: {
              type: "boolean",
              default: true,
              description:
                "Preview resolvers and candidate file URLs without downloading or modifying Zotero",
            },
            resolveCandidates: {
              type: "boolean",
              default: true,
              description:
                "When dryRun is true, evaluate Zotero resolver functions to list candidate URLs. This may make read-only network requests.",
            },
            allowExistingFile: {
              type: "boolean",
              default: false,
              description:
                "Allow adding another PDF/EPUB even when the item already has one. Defaults false to avoid duplicates.",
            },
          },
          required: ["itemKey"],
        },
      },
      {
        name: "attach_file",
        description:
          "Import a local file as a Zotero attachment under an existing regular item. This writes a copied attachment into Zotero storage. Confirm with user before executing.",
        inputSchema: {
          type: "object",
          properties: {
            libraryID: {
              type: "number",
              description:
                "Optional target Zotero library ID. Defaults to the user library when omitted.",
            },
            filePath: {
              type: "string",
              description: "Absolute local file path to import",
            },
            parentItemKey: {
              type: "string",
              description: "Parent regular item key",
            },
            title: {
              type: "string",
              description:
                "Optional attachment title. Defaults to the file name.",
            },
            contentType: {
              type: "string",
              description: "Optional MIME type override",
            },
          },
          required: ["filePath", "parentItemKey"],
        },
      },
    ];

    // Filter out semantic tools if semantic search is disabled
    const semanticEnabled = Zotero.Prefs.get(
      "extensions.zotero.zotero-mcp-plugin.semantic.enabled",
      true,
    );
    const filteredTools =
      semanticEnabled === false
        ? tools.filter((t: any) => !SEMANTIC_TOOL_NAMES.has(t.name))
        : tools;

    // Filter out write tools if write operations are disabled (default: disabled)
    const writeEnabled = this.isWriteEnabled();
    const finalTools =
      writeEnabled === true
        ? filteredTools
        : filteredTools.filter((t: any) => !WRITE_TOOL_NAMES.has(t.name));

    return this.createResponse(request.id ?? null, {
      tools: finalTools.map((tool: any) => applyToolPolicy(tool)),
    });
  }

  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;

    try {
      let result;
      this.enforceWriteConfirmation(name, args || {});

      switch (name) {
        case "zotero_status":
          result = await this.callZoteroStatus(args);
          break;

        case "get_libraries":
          result = await this.callGetLibraries(args);
          break;

        case "search_libraries":
          if (!args?.q) {
            throw new Error("q is required");
          }
          result = await this.callSearchLibraries(args);
          break;

        case "search_library":
          result = await this.callSearchLibrary(args);
          break;

        case "search_annotations":
          // q is optional when colors or tags filters are provided
          if (!args?.q && !args?.colors && !args?.tags) {
            throw new Error(
              "Either q (query), colors, or tags filter is required",
            );
          }
          result = await this.callSearchAnnotations(args);
          break;

        case "get_item_details":
          if (!args?.itemKey) {
            throw new Error("itemKey is required");
          }
          result = await this.callGetItemDetails(args);
          break;

        case "get_annotations":
          if (!args?.itemKey && !args?.annotationId && !args?.annotationIds) {
            throw new Error(
              "Either itemKey, annotationId, or annotationIds is required",
            );
          }
          result = await this.callGetAnnotations(args);
          break;

        case "get_content":
          if (!args?.itemKey && !args?.attachmentKey) {
            throw new Error("Either itemKey or attachmentKey is required");
          }
          result = await this.callGetContent(args);
          break;

        case "get_collections":
          result = await this.callGetCollections(args);
          break;

        case "search_collections":
          result = await this.callSearchCollections(args);
          break;

        case "get_collection_details":
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          result = await this.callGetCollectionDetails(args);
          break;

        case "get_collection_items":
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          result = await this.callGetCollectionItems(args);
          break;

        case "get_subcollections":
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          result = await this.callGetSubcollections(args);
          break;

        case "create_collection": {
          this.assertWriteEnabled();
          if (!args?.name) {
            throw new Error("name is required");
          }
          result = await this.callCreateCollection(args);
          break;
        }

        case "update_collection": {
          this.assertWriteEnabled();
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          result = await this.callUpdateCollection(args);
          break;
        }

        case "delete_collection": {
          this.assertWriteEnabled();
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          result = await this.callDeleteCollection(args);
          break;
        }

        case "add_items_to_collection": {
          this.assertWriteEnabled();
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          const addKeys = this.coerceStringArray(args?.itemKeys);
          if (!addKeys || addKeys.length === 0) {
            throw new Error(
              `itemKeys array is required, e.g. ["ABCD1234"]. Received: ${JSON.stringify(args?.itemKeys)}`,
            );
          }
          result = await this.callAddItemsToCollection({
            ...args,
            itemKeys: addKeys,
          });
          break;
        }

        case "remove_items_from_collection": {
          this.assertWriteEnabled();
          if (!args?.collectionKey) {
            throw new Error("collectionKey is required");
          }
          const removeKeys = this.coerceStringArray(args?.itemKeys);
          if (!removeKeys || removeKeys.length === 0) {
            throw new Error(
              `itemKeys array is required, e.g. ["ABCD1234"]. Received: ${JSON.stringify(args?.itemKeys)}`,
            );
          }
          result = await this.callRemoveItemsFromCollection({
            ...args,
            itemKeys: removeKeys,
          });
          break;
        }

        case "search_fulltext":
          if (!args?.q) {
            throw new Error("q (query) is required");
          }
          result = await this.callSearchFulltext(args);
          break;

        case "get_item_abstract":
          if (!args?.itemKey) {
            throw new Error("itemKey is required");
          }
          result = await this.callGetItemAbstract(args);
          break;

        case "list_export_formats":
          result = await this.callListExportFormats(args);
          break;

        case "export_items": {
          const itemKeys = this.coerceStringArray(args?.itemKeys);
          if (!itemKeys || itemKeys.length === 0) {
            throw new Error(
              `itemKeys array is required, e.g. ["ABCD1234"]. Received: ${JSON.stringify(args?.itemKeys)}`,
            );
          }
          result = await this.callExportItems({ ...args, itemKeys });
          break;
        }

        case "format_citation": {
          const itemKeys =
            this.coerceStringArray(args?.itemKeys) ||
            this.coerceStringArray(
              (args?.citationItems || [])
                .map((item: any) => item?.itemKey)
                .filter(Boolean),
            );
          if (!itemKeys || itemKeys.length === 0) {
            throw new Error(
              `itemKeys or citationItems array is required. Received itemKeys=${JSON.stringify(args?.itemKeys)}, citationItems=${JSON.stringify(args?.citationItems)}`,
            );
          }
          result = await this.callFormatCitation({ ...args, itemKeys });
          break;
        }

        case "better_bibtex_status": {
          const itemKeys = args?.itemKeys
            ? this.coerceStringArray(args.itemKeys)
            : undefined;
          result = await this.callBetterBibTeXStatus({ ...args, itemKeys });
          break;
        }

        // Semantic Search Tools
        case "semantic_search":
        case "find_similar":
        case "semantic_status": {
          const semEnabled = Zotero.Prefs.get(
            "extensions.zotero.zotero-mcp-plugin.semantic.enabled",
            true,
          );
          if (semEnabled === false) {
            throw new Error(
              "Semantic search is disabled. Enable it in Zotero MCP Plugin preferences.",
            );
          }
          if (name === "semantic_search") {
            if (!args?.query) throw new Error("query is required");
            result = await this.callSemanticSearch(args);
          } else if (name === "find_similar") {
            if (!args?.itemKey) throw new Error("itemKey is required");
            result = await this.callFindSimilar(args);
          } else {
            result = await this.callSemanticStatus();
          }
          break;
        }

        case "fulltext_database":
          if (!args?.action) {
            throw new Error("action is required");
          }
          result = await this.callFulltextDatabase(args);
          break;

        // Write Tools
        case "write_note": {
          this.assertWriteEnabled();
          if (!args?.action || !args?.content) {
            throw new Error("action and content are required");
          }
          result = await this.callWriteNote(args);
          break;
        }

        case "write_tag": {
          this.assertWriteEnabled();
          if (!args?.action || !args?.itemKey || !args?.tags) {
            throw new Error("action, itemKey, and tags are required");
          }
          result = await this.callWriteTag(args);
          break;
        }

        case "write_metadata": {
          this.assertWriteEnabled();
          if (!args?.itemKey) {
            throw new Error("itemKey is required");
          }
          if (!args?.fields && !args?.creators) {
            throw new Error("At least one of fields or creators is required");
          }
          result = await this.callWriteMetadata(args);
          break;
        }

        case "write_item": {
          this.assertWriteEnabled();
          if (!args?.action) {
            throw new Error("action is required");
          }
          result = await this.callWriteItem(args);
          break;
        }

        case "import_by_identifier": {
          if (args?.dryRun !== true) {
            this.assertWriteEnabled();
          }
          if (!args?.identifier && !args?.identifiers) {
            throw new Error("identifier or identifiers is required");
          }
          result = await this.callImportByIdentifier(args);
          break;
        }

        case "attach_url": {
          this.assertWriteEnabled();
          if (!args?.url) {
            throw new Error("url is required");
          }
          result = await this.callAttachUrl(args);
          break;
        }

        case "download_open_access_pdf": {
          if (args?.dryRun === false) {
            this.assertWriteEnabled();
          }
          if (!args?.itemKey) {
            throw new Error("itemKey is required");
          }
          result = await this.callDownloadOpenAccessPdf(args);
          break;
        }

        case "attach_file": {
          this.assertWriteEnabled();
          if (!args?.filePath || !args?.parentItemKey) {
            throw new Error("filePath and parentItemKey are required");
          }
          result = await this.callAttachFile(args);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Wrap result in MCP content format with proper text type.
      // Keep large results compact: the HTTP layer writes the body in a
      // single synchronous call, so avoid inflating multi-MB payloads.
      const compactJson = JSON.stringify(result);
      return this.createResponse(request.id ?? null, {
        content: [
          {
            type: "text",
            text:
              compactJson.length > 100000
                ? compactJson
                : JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Tool call error for ${name}: ${error}`);
      return this.createError(
        request.id ?? null,
        -32603,
        `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async callZoteroStatus(args: any = {}): Promise<any> {
    const port =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.mcp.server.port",
        true,
      ) || 23120;
    const serverEnabled =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.mcp.server.enabled",
        true,
      ) !== false;
    const allowRemote =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.mcp.server.allowRemote",
        true,
      ) === true;
    const semanticEnabled =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.semantic.enabled",
        true,
      ) !== false;
    const writeEnabled = this.isWriteEnabled();
    const contentMode =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.content.mode",
        true,
      ) || "standard";
    const includeToolPolicy = args?.includeToolPolicy !== false;
    const includeSemanticStats = args?.includeSemanticStats === true;

    let activeToolNames = getAllToolNames();
    if (!semanticEnabled) {
      activeToolNames = activeToolNames.filter(
        (name) => !SEMANTIC_TOOL_NAMES.has(name),
      );
    }
    if (!writeEnabled) {
      activeToolNames = activeToolNames.filter(
        (name) => !WRITE_TOOL_NAMES.has(name),
      );
    }

    const status: any = {
      server: {
        name: this.serverInfo.name,
        version: this.serverInfo.version,
        protocolVersion: "2024-11-05",
        initialized: this.isInitialized,
        enabled: serverEnabled,
        endpoint: `http://127.0.0.1:${port}/mcp`,
        statusEndpoint: `http://127.0.0.1:${port}/mcp/status`,
      },
      zotero: {
        version: (Zotero as any).version || null,
        userLibraryID: Zotero.Libraries.userLibraryID,
      },
      preferences: {
        port,
        allowRemote,
        semanticEnabled,
        writeEnabled,
        contentMode,
      },
      tools: {
        activeCount: activeToolNames.length,
        activeNames: activeToolNames,
      },
      agentGuidance: {
        defaultConnection: `[mcp_servers.zotero-mcp]\nurl = "http://127.0.0.1:${port}/mcp"`,
        recommendedFlow: [
          "Call zotero_status first to inspect enabled capabilities.",
          "Use read-only search and content tools before proposing write operations.",
          "Ask for explicit user confirmation before write or destructive tools.",
          "Pass confirm=true only after user approval; destructive tools also require confirmationText matching the target key.",
          "Use semantic_status separately when semantic index health is relevant.",
        ],
      },
      metadata: {
        extractedAt: new Date().toISOString(),
      },
    };

    if (includeToolPolicy) {
      status.toolPolicy = getToolPolicySummary(activeToolNames);
    }

    if (includeSemanticStats && semanticEnabled) {
      status.semantic = await this.callSemanticStatus();
    }

    return status;
  }

  private enforceWriteConfirmation(toolName: string, args: any): void {
    if (!WRITE_TOOL_NAMES.has(toolName)) {
      return;
    }

    // Dry-run tools inspect candidates and do not mutate Zotero.
    if (toolName === "import_by_identifier" && args?.dryRun === true) {
      return;
    }
    if (toolName === "download_open_access_pdf" && args?.dryRun !== false) {
      return;
    }

    if (args?.confirm !== true) {
      throw new Error(
        `Write tool ${toolName} requires confirm=true after explicit user approval. This protects existing Zotero library items from accidental changes.`,
      );
    }

    if (DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
      const targetKey = this.getDestructiveTargetKey(toolName, args);
      if (!targetKey || args?.confirmationText !== targetKey) {
        throw new Error(
          `Destructive tool ${toolName} requires confirmationText to match the target key (${targetKey || "unknown"}).`,
        );
      }
    }
  }

  private getDestructiveTargetKey(toolName: string, args: any): string | null {
    switch (toolName) {
      case "delete_collection":
        return args?.collectionKey || null;
      default:
        return null;
    }
  }

  private isWriteEnabled(): boolean {
    return Zotero.Prefs.get(WRITE_PREF_KEY, true) === true;
  }

  private assertWriteEnabled(): void {
    if (!this.isWriteEnabled()) {
      throw new Error(WRITE_DISABLED_MESSAGE);
    }
  }

  private async callGetLibraries(args: any): Promise<any> {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    }

    const response = await handleGetLibraries(queryParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callSearchLibraries(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const response = await handleSearchLibraries(searchParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callSearchLibrary(args: any): Promise<any> {
    // Apply mode-based defaults before creating search params
    const effectiveMode = args.mode || MCPSettingsService.get("content.mode");
    const modeConfig = this.getSearchModeConfiguration(effectiveMode);

    // Apply mode defaults if not explicitly provided
    const processedArgs = {
      ...args,
      limit: args.limit || modeConfig.limit,
    };

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(processedArgs)) {
      if (value !== undefined && value !== null) {
        if (key !== "mode") {
          // Don't pass mode to API
          searchParams.append(key, String(value));
        }
      }
    }

    const SEARCH_TIMEOUT_MS = 25000; // 25 秒超时，低于 keepAlive 的 30 秒
    const searchPromise = handleSearch(searchParams);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "Search timed out after 25 seconds. Try narrowing your query or reducing the limit.",
            ),
          ),
        SEARCH_TIMEOUT_MS,
      );
    });
    const response = await Promise.race([searchPromise, timeoutPromise]);
    let result = response.body ? JSON.parse(response.body) : response;

    // Add mode information to metadata
    if (result && typeof result === "object") {
      result.metadata = {
        ...result.metadata,
        mode: effectiveMode,
        appliedModeConfig: modeConfig,
      };

      // Remove any unwanted content array if it's empty
      if (Array.isArray(result.content) && result.content.length === 0) {
        delete result.content;
      }
    }

    return result;
  }

  private async callSearchAnnotations(args: any): Promise<any> {
    const extractor = new SmartAnnotationExtractor();
    const { q, ...options } = args;
    const result = await extractor.searchAnnotations(q, options);
    return result;
  }

  private async callGetItemDetails(args: any): Promise<any> {
    const { itemKey, mode, libraryID } = args;

    // Import the specific handler for item details
    const { handleGetItem } = await import("./apiHandlers");

    // Get effective mode
    const effectiveMode = mode || MCPSettingsService.get("content.mode");

    // Create query params with mode-based field selection
    const queryParams = new URLSearchParams();
    if (libraryID !== undefined && libraryID !== null) {
      queryParams.append("libraryID", String(libraryID));
    }
    if (effectiveMode !== "complete") {
      // Apply field filtering based on mode (this could be enhanced in apiHandlers)
      const modeConfig = this.getItemDetailsModeConfiguration(effectiveMode);
      if (modeConfig.fields) {
        queryParams.append("fields", modeConfig.fields.join(","));
      }
    }

    // Call the dedicated item details handler
    const response = await handleGetItem({ 1: itemKey }, queryParams);
    let result = response.body ? JSON.parse(response.body) : response;

    // Add mode information to metadata
    if (result && typeof result === "object") {
      result.metadata = {
        ...result.metadata,
        mode: effectiveMode,
        appliedModeConfig: this.getItemDetailsModeConfiguration(effectiveMode),
      };
    }

    return result;
  }

  private async callGetAnnotations(args: any): Promise<any> {
    const extractor = new SmartAnnotationExtractor();
    const result = await extractor.getAnnotations(args);
    return result;
  }

  private async callGetContent(args: any): Promise<any> {
    const {
      itemKey,
      attachmentKey,
      include,
      format,
      mode,
      contentControl,
      libraryID,
    } = args;
    const extractor = new UnifiedContentExtractor();

    try {
      let result;

      if (itemKey) {
        // Get content from item with unified mode control and content control parameters
        result = await extractor.getItemContent(
          itemKey,
          include || {},
          mode,
          contentControl,
          libraryID,
        );
      } else if (attachmentKey) {
        // Get content from specific attachment with unified mode control and content control parameters
        result = await extractor.getAttachmentContent(
          attachmentKey,
          mode,
          contentControl,
          libraryID,
        );
      } else {
        throw new Error("Either itemKey or attachmentKey must be provided");
      }

      // Apply format conversion if requested
      if (format === "text" && itemKey) {
        return extractor.convertToText(result);
      } else if (format === "text" && attachmentKey) {
        return result.content || "";
      }

      return result;
    } catch (error) {
      ztoolkit.log(
        `[StreamableMCP] Error in callGetContent: ${error}`,
        "error",
      );
      throw error;
    }
  }

  private async callGetCollections(args: any): Promise<any> {
    // Apply mode-based defaults before creating search params
    const effectiveMode = args.mode || MCPSettingsService.get("content.mode");
    const modeConfig = this.getCollectionModeConfiguration(effectiveMode);

    // Apply mode defaults if not explicitly provided
    const processedArgs = {
      ...args,
      limit: args.limit || modeConfig.limit,
    };

    const collectionParams = new URLSearchParams();
    for (const [key, value] of Object.entries(processedArgs)) {
      if (value !== undefined && value !== null) {
        if (key !== "mode") {
          // Don't pass mode to API
          collectionParams.append(key, String(value));
        }
      }
    }

    const response = await handleGetCollections(collectionParams);
    let result = response.body ? JSON.parse(response.body) : response;

    // Add mode information to metadata
    if (result && typeof result === "object") {
      result.metadata = {
        ...result.metadata,
        mode: effectiveMode,
        appliedModeConfig: modeConfig,
      };
    }

    return result;
  }

  private async callSearchCollections(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const response = await handleSearchCollections(searchParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callGetCollectionDetails(args: any): Promise<any> {
    const { collectionKey, ...otherArgs } = args;
    const detailParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        detailParams.append(key, String(value));
      }
    }
    const response = await handleGetCollectionDetails(
      { 1: collectionKey },
      detailParams,
    );
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callGetCollectionItems(args: any): Promise<any> {
    const { collectionKey, ...otherArgs } = args;
    const itemParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        itemParams.append(key, String(value));
      }
    }
    const response = await handleGetCollectionItems(
      { 1: collectionKey },
      itemParams,
    );
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callGetSubcollections(args: any): Promise<any> {
    const { collectionKey, ...otherArgs } = args;
    const subcollectionParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        subcollectionParams.append(key, String(value));
      }
    }
    const response = await handleGetSubcollections(
      { 1: collectionKey },
      subcollectionParams,
    );
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callCreateCollection(args: any): Promise<any> {
    const response = await handleCreateCollection({
      libraryID: args.libraryID,
      name: args.name,
      parentCollection: args.parentCollection,
    });
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callUpdateCollection(args: any): Promise<any> {
    const { collectionKey, ...body } = args;
    const response = await handleUpdateCollection({ 1: collectionKey }, body);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callDeleteCollection(args: any): Promise<any> {
    const { collectionKey, ...body } = args;
    const response = await handleDeleteCollection({ 1: collectionKey }, body);
    return response.body ? JSON.parse(response.body) : response;
  }

  /**
   * Accept arrays that some MCP clients serialize as strings, e.g.
   * '["KEY1","KEY2"]' or 'KEY1,KEY2' (#71).
   */
  private coerceStringArray(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String);
        } catch {
          // fall through to comma-split
        }
      }
      if (trimmed.length > 0) {
        return trimmed
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    return undefined;
  }

  private async callAddItemsToCollection(args: any): Promise<any> {
    const { collectionKey, itemKeys, libraryID } = args;
    const response = await handleAddItemsToCollection(
      { 1: collectionKey },
      { itemKeys, libraryID },
    );
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callRemoveItemsFromCollection(args: any): Promise<any> {
    const { collectionKey, itemKeys, libraryID } = args;
    const response = await handleRemoveItemsFromCollection(
      { 1: collectionKey },
      { itemKeys, libraryID },
    );
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callSearchFulltext(args: any): Promise<any> {
    // Apply mode-based defaults before creating search params
    const effectiveMode = args.mode || MCPSettingsService.get("content.mode");
    const modeConfig = this.getFulltextModeConfiguration(effectiveMode);

    // Apply mode defaults if not explicitly provided
    const processedArgs = {
      ...args,
      contextLength: args.contextLength || modeConfig.contextLength,
      maxResults: args.maxResults || modeConfig.maxResults,
    };

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(processedArgs)) {
      if (value !== undefined && value !== null) {
        if (key === "itemKeys" && Array.isArray(value)) {
          searchParams.append(key, value.join(","));
        } else if (key !== "mode") {
          // Don't pass mode to API
          searchParams.append(key, String(value));
        }
      }
    }

    const response = await handleSearchFulltext(searchParams);
    let result = response.body ? JSON.parse(response.body) : response;

    // Add mode information to metadata
    if (result && typeof result === "object") {
      result.metadata = {
        ...result.metadata,
        mode: effectiveMode,
        appliedModeConfig: modeConfig,
      };
    }

    return result;
  }

  private async callGetItemAbstract(args: any): Promise<any> {
    const { itemKey, ...otherArgs } = args;
    const abstractParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        abstractParams.append(key, String(value));
      }
    }
    const response = await handleGetItemAbstract(
      { 1: itemKey },
      abstractParams,
    );
    const contentType = response.headers?.["Content-Type"] || "";
    if (contentType.startsWith("text/plain")) {
      // format=text returns a plain-text body that must not be JSON.parsed
      return response.body;
    }
    const result = response.body ? JSON.parse(response.body) : response;
    return result;
  }

  private async callListExportFormats(args: any): Promise<any> {
    const includeTranslators = args?.includeTranslators !== false;
    const includeStyles = args?.includeStyles !== false;
    const query = String(args?.query || "").toLowerCase();
    const limit = Math.max(1, Number(args?.limit || 100));

    const matches = (value: string) =>
      !query || value.toLowerCase().includes(query);
    const response: any = {
      data: {},
      metadata: {
        extractedAt: new Date().toISOString(),
        query: query || null,
      },
    };

    if (includeTranslators) {
      const translation = new Zotero.Translate.Export();
      const translators = await translation.getTranslators();
      response.data.translators = translators
        .filter((translator: any) =>
          matches(`${translator.label || ""} ${translator.translatorID || ""}`),
        )
        .slice(0, limit)
        .map((translator: any) => ({
          translatorID: translator.translatorID,
          label: translator.label,
          target: translator.target || null,
          priority: translator.priority || null,
        }));
    }

    if (includeStyles) {
      if (Zotero.Styles?.init) {
        await Zotero.Styles.init();
      }
      const styles = Zotero.Styles?.getVisible
        ? Zotero.Styles.getVisible()
        : [];
      response.data.styles = styles
        .filter((style: any) =>
          matches(`${style.title || ""} ${style.styleID || ""}`),
        )
        .slice(0, limit)
        .map((style: any) => ({
          styleID: style.styleID,
          title: style.title,
          updated: style.updated || null,
        }));
    }

    response.metadata.counts = {
      translators: response.data.translators?.length || 0,
      styles: response.data.styles?.length || 0,
    };

    return response;
  }

  private async callExportItems(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const maxItems = this.getBoundedNumber(
      args.maxItems,
      DEFAULT_EXPORT_MAX_ITEMS,
      1,
      500,
    );
    const maxOutputChars = this.getBoundedNumber(
      args.maxOutputChars,
      DEFAULT_EXPORT_MAX_OUTPUT_CHARS,
      1000,
      2000000,
    );
    if (args.itemKeys.length > maxItems) {
      throw new Error(
        `export_items received ${args.itemKeys.length} itemKeys, exceeding maxItems=${maxItems}. Increase maxItems only after the user approves a larger export.`,
      );
    }
    const items = await this.getItemsByKeys(libraryID, args.itemKeys);
    const translator = await this.resolveExportTranslator(args);
    const output = await this.exportItemsToString(items, translator, {
      exportNotes: args.includeNotes === true,
      useJournalAbbreviation: args.useJournalAbbreviation === true,
    });
    const outputTooLarge = output.length > maxOutputChars;

    return {
      success: !outputTooLarge,
      data: {
        itemKeys: items.map((item: any) => item.key),
        translator: {
          translatorID: translator.translatorID,
          label: translator.label,
        },
        ...(outputTooLarge
          ? {
              outputPreview: output.slice(0, EXPORT_PREVIEW_CHARS),
              outputOmitted: true,
            }
          : { output }),
        outputLength: output.length,
        maxItems,
        maxOutputChars,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        itemCount: items.length,
        format: args.format || "bibtex",
        message: outputTooLarge
          ? `Export output exceeded maxOutputChars=${maxOutputChars}; full output omitted to keep the MCP response bounded.`
          : "Export completed.",
      },
    };
  }

  private async callFormatCitation(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const items = await this.getItemsByKeys(libraryID, args.itemKeys, true);
    const styleID = this.normalizeStyleID(
      args.style || "http://www.zotero.org/styles/apa",
    );
    const output = args.output || "text";
    const mode = args.mode || "bibliography";

    if (Zotero.Styles?.init) {
      await Zotero.Styles.init();
    }
    const style = Zotero.Styles?.get ? Zotero.Styles.get(styleID) : null;
    if (!style) {
      throw new Error(
        `CSL style not found: ${styleID}. Use list_export_formats to inspect available styles.`,
      );
    }

    const citationItems =
      Array.isArray(args.citationItems) && args.citationItems.length
        ? args.citationItems
        : items.map((item: any) => ({ itemKey: item.key }));
    const itemByKey = new Map(items.map((item: any) => [item.key, item]));
    const content = this.renderCitationContent(style, items, citationItems, {
      mode,
      output,
      locale: args.locale || "",
    });

    return {
      success: true,
      data: {
        itemKeys: items.map((item: any) => item.key),
        citationItems: citationItems.map((citationItem: any) => ({
          ...citationItem,
          itemID: itemByKey.get(citationItem.itemKey)?.id || null,
        })),
        style: {
          styleID,
          title: style.title || null,
        },
        mode,
        output,
        ...(output === "html" ? { html: content.html } : {}),
        ...(output === "text" ? { text: content.text } : {}),
        ...(output === "both"
          ? { text: content.text, html: content.html }
          : {}),
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        itemCount: items.length,
        locale: args.locale || null,
      },
    };
  }

  private async callBetterBibTeXStatus(args: any): Promise<any> {
    const betterBibTeX = (Zotero as any).BetterBibTeX;
    const endpoint = "http://127.0.0.1:23119/better-bibtex/json-rpc";

    if (!betterBibTeX) {
      return {
        installed: false,
        ready: false,
        endpoint,
        data: {
          citekeysByItemKey: {},
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message: "Better BibTeX is not available in this Zotero runtime.",
        },
      };
    }

    let ready = true;
    try {
      if (betterBibTeX.ready && typeof betterBibTeX.ready.then === "function") {
        await betterBibTeX.ready;
      }
    } catch (error) {
      ready = false;
      ztoolkit.log(
        `[StreamableMCP] Better BibTeX ready check failed: ${error}`,
        "warn",
      );
    }

    const citekeysByItemKey: Record<string, string | null> = {};
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const itemKeys = args.itemKeys || [];
    for (const item of itemKeys.length
      ? await this.getItemsByKeys(libraryID, itemKeys, true)
      : []) {
      citekeysByItemKey[item.key] = await this.tryGetBetterBibTeXCitekey(
        betterBibTeX,
        item,
      );
    }

    return {
      installed: true,
      ready,
      endpoint,
      version: betterBibTeX.version || betterBibTeX.plugin?.version || null,
      data: {
        citekeysByItemKey,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        requestedItemCount: itemKeys.length,
      },
    };
  }

  private async callImportByIdentifier(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const rawInputs = [
      ...(args.identifier ? [String(args.identifier)] : []),
      ...(Array.isArray(args.identifiers) ? args.identifiers.map(String) : []),
    ];
    const parsedIdentifiers = rawInputs.flatMap((input) =>
      Zotero.Utilities.extractIdentifiers(input),
    );

    if (!parsedIdentifiers.length) {
      throw new Error(
        "No Zotero-supported identifiers were found in identifier/identifiers.",
      );
    }

    const collections = await this.resolveCollectionIDs(libraryID, [
      ...(args.collectionKey ? [String(args.collectionKey)] : []),
      ...(Array.isArray(args.collectionKeys)
        ? args.collectionKeys.map(String)
        : []),
    ]);

    if (args.dryRun === true) {
      return {
        success: true,
        dryRun: true,
        data: {
          identifiers: parsedIdentifiers,
          libraryID,
          collections,
          saveAttachments: args.saveAttachments !== false,
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message: "Dry run only. No Zotero items were created.",
        },
      };
    }

    const importedItems: any[] = [];
    const failures: any[] = [];

    for (const identifier of parsedIdentifiers) {
      const translate = new Zotero.Translate.Search();
      translate.setIdentifier(identifier);
      const translators = await translate.getTranslators();
      if (!translators.length) {
        failures.push({
          identifier,
          error: "No Zotero translator found for identifier",
        });
        continue;
      }
      translate.setTranslator(translators);

      try {
        const newItems = await translate.translate({
          libraryID,
          collections: collections.length ? collections : false,
          saveAttachments: args.saveAttachments !== false,
        });
        importedItems.push(...newItems);
      } catch (error) {
        failures.push({ identifier, error: String(error) });
      }
    }

    return {
      success: importedItems.length > 0,
      data: {
        importedItems: importedItems.map((item: any) =>
          this.describeZoteroItem(item),
        ),
        failures,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        requested: parsedIdentifiers.length,
        imported: importedItems.length,
        failed: failures.length,
      },
    };
  }

  private async callAttachUrl(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const mode = args.mode || "import";
    const url = this.normalizeHttpUrl(args.url, "url");
    let parentItemID: number | undefined;
    let collections: number[] | undefined;

    if (args.parentItemKey) {
      const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
        libraryID,
        args.parentItemKey,
      );
      if (!parentItem) {
        throw new Error(
          `Parent item not found in library ${libraryID}: ${args.parentItemKey}`,
        );
      }
      if (!parentItem.isRegularItem()) {
        throw new Error(
          `Parent ${args.parentItemKey} is not a regular item (type: ${parentItem.itemType})`,
        );
      }
      parentItemID = parentItem.id;
    }

    if (args.collectionKey) {
      if (parentItemID) {
        throw new Error(
          "collectionKey cannot be combined with parentItemKey for Zotero attachments",
        );
      }
      collections = await this.resolveCollectionIDs(libraryID, [
        String(args.collectionKey),
      ]);
    }

    const options: any = {
      libraryID,
      url,
      parentItemID,
      collections,
      title: args.title,
      contentType: args.contentType,
    };

    let attachment;
    if (mode === "link") {
      attachment = await Zotero.Attachments.linkFromURL(options);
    } else if (mode === "import") {
      attachment = await Zotero.Attachments.importFromURL({
        ...options,
        fileBaseName: args.fileBaseName,
        referrer: args.referrer,
        renameIfAllowedType: args.renameIfAllowedType !== false,
      });
    } else {
      throw new Error(`Unknown attach_url mode: ${mode}. Use import or link.`);
    }

    return {
      success: true,
      data: {
        attachment: this.describeZoteroItem(attachment),
        mode,
        parentItemKey: args.parentItemKey || null,
        collectionKey: args.collectionKey || null,
        url,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        message: `URL ${mode === "link" ? "linked" : "imported"} as attachment ${attachment.key}`,
      },
    };
  }

  private async callDownloadOpenAccessPdf(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const [item] = await this.getItemsByKeys(
      libraryID,
      [String(args.itemKey)],
      true,
    );
    const methods = this.normalizeFileResolverMethods(args.methods);
    const existingFileAttachments = this.getExistingFileAttachments(item);
    const canFindFile =
      typeof (Zotero.Attachments as any).canFindFileForItem === "function"
        ? (Zotero.Attachments as any).canFindFileForItem(item)
        : null;

    if (args.dryRun !== false) {
      const resolveCandidates = args.resolveCandidates !== false;
      const candidates = resolveCandidates
        ? await this.resolveFileResolverCandidates(item, methods)
        : [];

      return {
        success: true,
        dryRun: true,
        data: {
          item: this.describeZoteroItem(item),
          lookupFields: this.getItemFileLookupFields(item),
          methods,
          canFindFile,
          existingFileAttachments,
          resolverSummary: this.getFileResolverSummary(item, methods),
          candidates,
          resolveCandidates,
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message:
            "Dry run only. No PDF/EPUB was downloaded or attached to Zotero.",
        },
      };
    }

    if (existingFileAttachments.length && args.allowExistingFile !== true) {
      return {
        success: false,
        data: {
          item: this.describeZoteroItem(item),
          methods,
          existingFileAttachments,
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message:
            "Existing PDF/EPUB attachment found. Pass allowExistingFile=true only if the user wants an additional copy.",
        },
      };
    }

    const attachment = await (Zotero.Attachments as any).addAvailableFile(
      item,
      {
        methods,
      },
    );

    return {
      success: !!attachment,
      data: {
        item: this.describeZoteroItem(item),
        attachment: attachment ? this.describeZoteroItem(attachment) : null,
        methods,
        existingFileAttachmentsBefore: existingFileAttachments,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        message: attachment
          ? `Available file downloaded as attachment ${attachment.key} under item ${item.key}`
          : "No available PDF/EPUB file was found by Zotero resolvers.",
      },
    };
  }

  private async callAttachFile(args: any): Promise<any> {
    const libraryID = args.libraryID || Zotero.Libraries.userLibraryID;
    const filePath = String(args.filePath);

    if (!(await IOUtils.exists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
      libraryID,
      args.parentItemKey,
    );
    if (!parentItem) {
      throw new Error(
        `Parent item not found in library ${libraryID}: ${args.parentItemKey}`,
      );
    }
    if (!parentItem.isRegularItem()) {
      throw new Error(
        `Parent ${args.parentItemKey} is not a regular item (type: ${parentItem.itemType})`,
      );
    }

    const attachment = await Zotero.Attachments.importFromFile({
      file: filePath,
      parentItemID: parentItem.id,
      title:
        args.title || filePath.split(/[\\/]/).pop() || "Imported Attachment",
      contentType: args.contentType,
    });

    return {
      success: true,
      data: {
        attachment: this.describeZoteroItem(attachment),
        parentItemKey: args.parentItemKey,
        filePath,
      },
      metadata: {
        extractedAt: new Date().toISOString(),
        message: `File imported as attachment ${attachment.key} under parent ${args.parentItemKey}`,
      },
    };
  }

  private normalizeHttpUrl(value: any, fieldName: string): string {
    let parsed: URL;
    try {
      parsed = new URL(String(value));
    } catch (_error) {
      throw new Error(`${fieldName} must be a valid HTTP or HTTPS URL`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`${fieldName} must use http: or https:`);
    }

    return parsed.toString();
  }

  private getBoundedNumber(
    value: any,
    defaultValue: number,
    min: number,
    max: number,
  ): number {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Expected a finite number, got ${value}`);
    }
    return Math.min(max, Math.max(min, Math.floor(numberValue)));
  }

  private async getItemsByKeys(
    libraryID: number,
    itemKeys: string[],
    regularOnly = false,
  ): Promise<any[]> {
    const items = [];
    for (const itemKey of itemKeys) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        libraryID,
        itemKey,
      );
      if (!item) {
        throw new Error(`Item not found in library ${libraryID}: ${itemKey}`);
      }
      if (regularOnly && !item.isRegularItem()) {
        throw new Error(
          `Item ${itemKey} is not a regular bibliographic item (type: ${item.itemType})`,
        );
      }
      items.push(item);
    }
    return items;
  }

  private async resolveCollectionIDs(
    libraryID: number,
    collectionKeys: string[],
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const collectionKey of collectionKeys.filter(Boolean)) {
      const collection = await Zotero.Collections.getByLibraryAndKeyAsync(
        libraryID,
        collectionKey,
      );
      if (!collection) {
        throw new Error(
          `Collection not found in library ${libraryID}: ${collectionKey}`,
        );
      }
      ids.push(collection.id);
    }
    return ids;
  }

  private normalizeFileResolverMethods(methods: any): string[] {
    const allowed = new Set(["oa", "doi", "url", "custom"]);
    const defaults = ["oa", "doi", "url", "custom"];
    if (!Array.isArray(methods) || methods.length === 0) {
      return defaults;
    }

    const normalized = methods
      .map((method) => String(method).trim())
      .filter((method) => allowed.has(method));
    if (!normalized.length) {
      throw new Error(
        "methods must contain at least one of: oa, doi, url, custom",
      );
    }
    return [...new Set(normalized)];
  }

  private getItemFileLookupFields(item: any): any {
    return {
      title: this.safeGetItemField(item, "title"),
      DOI:
        this.safeGetItemField(item, "DOI") ||
        this.safeGetExtraField(item, "DOI"),
      PMCID: this.safeGetItemField(item, "PMCID"),
      url: this.safeGetItemField(item, "url"),
    };
  }

  private safeGetItemField(item: any, field: string): string {
    try {
      return item?.getField ? String(item.getField(field) || "") : "";
    } catch (_error) {
      return "";
    }
  }

  private safeGetExtraField(item: any, field: string): string {
    try {
      return item?.getExtraField ? String(item.getExtraField(field) || "") : "";
    } catch (_error) {
      return "";
    }
  }

  private getExistingFileAttachments(item: any): any[] {
    const fileTypes = (Zotero.Attachments as any).FIND_AVAILABLE_FILE_TYPES || [
      "application/pdf",
      "application/epub+zip",
    ];
    const attachmentIDs = item.getAttachments ? item.getAttachments() : [];
    return attachmentIDs
      .map((id: number) => Zotero.Items.get(id))
      .filter((attachment: any) => attachment?.isAttachment?.())
      .filter((attachment: any) => {
        const contentType = attachment.attachmentContentType || "";
        const filename = attachment.attachmentFilename || "";
        return (
          fileTypes.includes(contentType) ||
          /pdf|epub/i.test(contentType) ||
          /\.(pdf|epub)$/i.test(filename)
        );
      })
      .map((attachment: any) => ({
        key: attachment.key,
        title: this.safeGetItemField(attachment, "title"),
        contentType: attachment.attachmentContentType || "",
        filename: attachment.attachmentFilename || "",
        url: this.safeGetItemField(attachment, "url"),
      }));
  }

  private getFileResolverSummary(item: any, methods: string[]): any[] {
    const resolvers = this.getFileResolvers(item, methods);
    return resolvers.map((resolver: any, index: number) =>
      this.describeFileResolver(resolver, index),
    );
  }

  private async resolveFileResolverCandidates(
    item: any,
    methods: string[],
  ): Promise<any[]> {
    const resolvers = this.getFileResolvers(item, methods);
    const candidates = [];

    for (let index = 0; index < resolvers.length; index++) {
      const resolver = resolvers[index];
      try {
        const resolved =
          typeof resolver === "function" ? await resolver() : resolver;
        const results = Array.isArray(resolved) ? resolved : [resolved];
        for (const result of results) {
          const candidate = this.normalizeFileResolverCandidate(result, index);
          if (candidate.url || candidate.pageURL) {
            candidates.push(candidate);
          }
        }
      } catch (error) {
        candidates.push({
          ...this.describeFileResolver(resolver, index),
          error: String(error),
        });
      }
    }

    return candidates;
  }

  private getFileResolvers(item: any, methods: string[]): any[] {
    if (typeof (Zotero.Attachments as any).getFileResolvers !== "function") {
      throw new Error(
        "This Zotero version does not expose Attachments.getFileResolvers.",
      );
    }
    return (Zotero.Attachments as any).getFileResolvers(item, methods) || [];
  }

  private describeFileResolver(resolver: any, resolverIndex: number): any {
    if (typeof resolver === "string") {
      return { resolverIndex, type: "url", url: resolver };
    }
    if (typeof resolver === "function") {
      return { resolverIndex, type: "dynamic" };
    }
    return this.normalizeFileResolverCandidate(resolver, resolverIndex);
  }

  private normalizeFileResolverCandidate(
    candidate: any,
    resolverIndex: number,
  ): any {
    if (!candidate) {
      return { resolverIndex, type: "empty" };
    }
    if (typeof candidate === "string") {
      return { resolverIndex, type: "url", url: candidate };
    }
    return {
      resolverIndex,
      type: "candidate",
      accessMethod: candidate.accessMethod || null,
      articleVersion: candidate.articleVersion || null,
      url: candidate.url || null,
      pageURL: candidate.pageURL || null,
      referrer: candidate.referrer || null,
    };
  }

  private describeZoteroItem(item: any): any {
    return {
      key: item.key,
      id: item.id,
      libraryID: item.libraryID,
      itemType: item.itemType,
      title: item.getField ? item.getField("title") || "" : "",
      parentKey: item.parentKey || null,
      dateAdded: item.dateAdded || null,
      dateModified: item.dateModified || null,
    };
  }

  private normalizeStyleID(style: string): string {
    const trimmed = String(style || "").trim();
    if (!trimmed) {
      return "http://www.zotero.org/styles/apa";
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (!trimmed.includes("/")) {
      return `http://www.zotero.org/styles/${trimmed}`;
    }
    return trimmed;
  }

  private renderCitationContent(
    style: any,
    items: any[],
    citationItems: any[],
    options: { mode: string; output: string; locale: string },
  ): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};
    const formats =
      options.output === "both" ? ["text", "html"] : [options.output];
    const locale =
      options.locale || Zotero.Prefs.get("export.quickCopy.locale") || "";

    for (const format of formats) {
      if (format !== "text" && format !== "html") {
        throw new Error(`Unsupported citation output format: ${format}`);
      }

      const csl = style.getCiteProc(locale, format, { cache: true });
      try {
        if (options.mode === "citation") {
          csl.updateItems(items.map((item: any) => item.id));
          const itemByKey = new Map(items.map((item: any) => [item.key, item]));
          const citation = {
            citationItems: citationItems.map((citationItem: any) => {
              const item = itemByKey.get(citationItem.itemKey);
              if (!item) {
                throw new Error(
                  `Citation item key is not in the resolved item set: ${citationItem.itemKey}`,
                );
              }
              const cslItem: any = { id: item.id };
              if (citationItem.locator)
                cslItem.locator = String(citationItem.locator);
              if (citationItem.label)
                cslItem.label = String(citationItem.label);
              if (citationItem.prefix)
                cslItem.prefix = String(citationItem.prefix);
              if (citationItem.suffix)
                cslItem.suffix = String(citationItem.suffix);
              if (citationItem.suppressAuthor === true)
                cslItem["suppress-author"] = true;
              return cslItem;
            }),
            properties: {},
          };
          result[format] = csl.previewCitationCluster(citation, [], [], format);
        } else if (options.mode === "bibliography") {
          result[format] = Zotero.Cite.makeFormattedBibliographyOrCitationList(
            csl,
            items,
            format,
          );
        } else {
          throw new Error(`Unsupported citation mode: ${options.mode}`);
        }
      } finally {
        csl.free();
      }
    }

    return result;
  }

  private async tryGetBetterBibTeXCitekey(
    betterBibTeX: any,
    item: any,
  ): Promise<string | null> {
    try {
      const keyManager = betterBibTeX.KeyManager || betterBibTeX.keyManager;
      if (keyManager?.get) {
        const result = await keyManager.get(item.id);
        return typeof result === "string"
          ? result
          : result?.citationKey || result?.citekey || null;
      }
      if (betterBibTeX.getCitationKey) {
        return await betterBibTeX.getCitationKey(item.id);
      }
      if (betterBibTeX.citekey) {
        return await betterBibTeX.citekey(item.id);
      }
    } catch (error) {
      ztoolkit.log(
        `[StreamableMCP] Better BibTeX citekey lookup failed for ${item.key}: ${error}`,
        "warn",
      );
    }
    return null;
  }

  private async resolveExportTranslator(args: any): Promise<any> {
    const translation = new Zotero.Translate.Export();
    const translators = await translation.getTranslators();
    const format = args.format || "bibtex";

    if (args.translatorID) {
      const byID = translators.find(
        (translator: any) => translator.translatorID === args.translatorID,
      );
      if (byID) return byID;
      throw new Error(`Export translator ID not found: ${args.translatorID}`);
    }

    const commonTranslatorID = this.getCommonTranslatorID(format);
    if (commonTranslatorID) {
      const byCommonID = translators.find(
        (translator: any) => translator.translatorID === commonTranslatorID,
      );
      if (byCommonID) return byCommonID;
    }

    const labelQuery =
      args.translatorLabel || this.getCommonTranslatorLabel(format);
    if (!labelQuery) {
      throw new Error(
        "translatorID or translatorLabel is required when format is translator",
      );
    }

    const lowerQuery = String(labelQuery).toLowerCase();
    const exact = translators.find(
      (translator: any) =>
        String(translator.label || "").toLowerCase() === lowerQuery,
    );
    if (exact) return exact;

    const partial = translators.find((translator: any) =>
      String(translator.label || "")
        .toLowerCase()
        .includes(lowerQuery),
    );
    if (partial) return partial;

    const available = translators
      .slice(0, 20)
      .map((translator: any) => translator.label)
      .join(", ");
    throw new Error(
      `No export translator matched "${labelQuery}". Available examples: ${available}`,
    );
  }

  private getCommonTranslatorLabel(format: string): string | null {
    switch (format) {
      case "bibtex":
        return "BibTeX";
      case "biblatex":
        return "BibLaTeX";
      case "ris":
        return "RIS";
      case "csljson":
        return "CSL JSON";
      case "zoteroRDF":
        return "Zotero RDF";
      default:
        return null;
    }
  }

  private getCommonTranslatorID(format: string): string | null {
    switch (format) {
      case "bibtex":
        return "9cb70025-a888-4a29-a210-93ec52da40d4";
      case "biblatex":
        return "b6e39b57-8942-4d11-8259-342c46ce395f";
      case "ris":
        return "32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7";
      case "csljson":
        return "bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7";
      case "zoteroRDF":
        return "14763d24-8ba0-45df-8f52-b8d1108e7ac9";
      default:
        return null;
    }
  }

  private async exportItemsToString(
    items: any[],
    translator: any,
    displayOptions: any,
  ): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      try {
        const translation = new Zotero.Translate.Export();
        translation.setItems(items.slice());
        translation.setTranslator(translator);
        translation.setDisplayOptions(displayOptions);
        translation.setHandler("done", (obj: any, worked: boolean) => {
          if (worked) {
            resolve(obj?.string || translation.string || "");
          } else {
            reject(
              new Error(
                `Export translator failed: ${translator.label || translator.translatorID}`,
              ),
            );
          }
        });
        const maybePromise = translation.translate();
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  // ============ Semantic Search Methods ============

  private async callSemanticSearch(args: any): Promise<any> {
    try {
      const semanticService = getSemanticSearchService();
      await semanticService.initialize();

      const results = await semanticService.search(args.query, {
        topK: args.topK,
        minScore: args.minScore,
        language: args.language,
      });

      const response = {
        mode: "semantic",
        query: args.query,
        data: results,
        metadata: {
          extractedAt: new Date().toISOString(),
          searchMode: "semantic",
          resultCount: results.length,
          fallbackMode:
            semanticService.getIndexProgress().status === "idle"
              ? (await semanticService.getStats()).serviceStatus.fallbackMode
              : false,
        },
      };

      return response;
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Semantic search error: ${error}`, "error");
      throw error;
    }
  }

  private async callFindSimilar(args: any): Promise<any> {
    try {
      const semanticService = getSemanticSearchService();
      await semanticService.initialize();

      const results = await semanticService.findSimilar(args.itemKey, {
        topK: args.topK,
        minScore: args.minScore,
      });

      const response = {
        mode: "similar",
        sourceItemKey: args.itemKey,
        data: results,
        metadata: {
          extractedAt: new Date().toISOString(),
          resultCount: results.length,
        },
      };

      return response;
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Find similar error: ${error}`, "error");
      throw error;
    }
  }

  private async callSemanticStatus(): Promise<any> {
    try {
      const semanticService = getSemanticSearchService();
      const isReady = await semanticService.isReady();
      const stats = isReady ? await semanticService.getStats() : null;
      const progress = semanticService.getIndexProgress();

      // Check Int8 migration status
      let int8Status = null;
      try {
        const { getVectorStore } = await import("./semantic/vectorStore");
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        int8Status = await vectorStore.needsInt8Migration();
      } catch (e) {
        // Ignore if vector store not available
      }

      let message = !isReady
        ? "Semantic search service not initialized"
        : stats?.serviceStatus.fallbackMode
          ? "Running in fallback mode (API not configured)"
          : `Semantic search ready with ${stats?.indexStats.totalItems || 0} indexed items`;

      // Add Int8 migration suggestion if needed
      if (int8Status?.needed) {
        message += `. WARNING: ${int8Status.count}/${int8Status.total} vectors need Int8 migration for ~6x faster search. Run migrate_int8 to optimize.`;
      }

      return {
        ready: isReady,
        initialized: stats?.serviceStatus.initialized || false,
        fallbackMode: stats?.serviceStatus.fallbackMode || false,
        indexProgress: progress,
        indexStats: stats?.indexStats || null,
        int8Migration: int8Status,
        message,
      };
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Semantic status error: ${error}`, "error");
      return {
        ready: false,
        error: String(error),
      };
    }
  }

  private async callFulltextDatabase(args: any): Promise<any> {
    try {
      const { getVectorStore } = await import("./semantic/vectorStore");
      const vectorStore = getVectorStore();
      await vectorStore.initialize();

      const {
        action,
        query,
        itemKeys,
        limit = 20,
        caseSensitive = false,
      } = args;

      switch (action) {
        case "list": {
          const cachedItems = await vectorStore.listCachedContent();
          const limitedItems = cachedItems.slice(0, limit);

          return {
            action: "list",
            data: limitedItems,
            metadata: {
              extractedAt: new Date().toISOString(),
              totalCached: cachedItems.length,
              returned: limitedItems.length,
              message: `Found ${cachedItems.length} items in full-text database`,
            },
          };
        }

        case "search": {
          if (!query) {
            throw new Error("query is required for search action");
          }

          const searchResults = await vectorStore.searchCachedContent(query, {
            limit,
            caseSensitive,
          });

          return {
            action: "search",
            query,
            data: searchResults,
            metadata: {
              extractedAt: new Date().toISOString(),
              resultCount: searchResults.length,
              caseSensitive,
              message: `Found ${searchResults.length} items matching "${query}"`,
            },
          };
        }

        case "get": {
          if (!itemKeys || itemKeys.length === 0) {
            throw new Error("itemKeys is required for get action");
          }

          const contentMap = await vectorStore.getFullContentBatch(itemKeys);
          const results: Array<{
            itemKey: string;
            content: string | null;
            contentLength: number;
          }> = [];

          for (const key of itemKeys) {
            const content = contentMap.get(key) || null;
            results.push({
              itemKey: key,
              content,
              contentLength: content ? content.length : 0,
            });
          }

          return {
            action: "get",
            data: results,
            metadata: {
              extractedAt: new Date().toISOString(),
              requested: itemKeys.length,
              found: results.filter((r) => r.content !== null).length,
              message: `Retrieved content for ${results.filter((r) => r.content !== null).length}/${itemKeys.length} items`,
            },
          };
        }

        case "stats": {
          const stats = await vectorStore.getStats();

          // Format size nicely
          const formatSize = (bytes: number) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
          };

          return {
            action: "stats",
            data: {
              cachedItems: stats.cachedContentItems,
              cachedContentSize: stats.cachedContentSizeBytes,
              cachedContentSizeFormatted: formatSize(
                stats.cachedContentSizeBytes,
              ),
              indexedItems: stats.totalItems,
              totalVectors: stats.totalVectors,
              zhVectors: stats.zhVectors,
              enVectors: stats.enVectors,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Full-text database: ${stats.cachedContentItems} items, ${formatSize(stats.cachedContentSizeBytes)}`,
            },
          };
        }

        default:
          throw new Error(
            `Unknown action: ${action}. Use list, search, get, or stats. Database management is done through Zotero preferences.`,
          );
      }
    } catch (error) {
      ztoolkit.log(
        `[StreamableMCP] Fulltext database error: ${error}`,
        "error",
      );
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Convert Markdown content to HTML suitable for Zotero notes.
   * Auto-detects if content is already HTML and skips conversion.
   */
  private markdownToNoteHtml(markdown: string): string {
    if (!markdown || typeof markdown !== "string") return "";

    // Detect if content is already HTML
    const trimmed = markdown.trim();
    if (trimmed.startsWith("<") && /<\/.+>/.test(trimmed)) {
      return markdown;
    }

    let html = markdown;

    // Escape HTML entities
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headings (process longest first)
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // Bold + italic, bold, italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, "<hr/>");

    // Unordered lists (block)
    html = html.replace(/(?:^[-*+]\s+.+$\n?)+/gm, (match) => {
      const items = match
        .trim()
        .split("\n")
        .map((line: string) => {
          const content = line.replace(/^[-*+]\s+/, "");
          return `<li>${content}</li>`;
        })
        .join("");
      return `<ul>${items}</ul>\n`;
    });

    // Ordered lists (block)
    html = html.replace(/(?:^\d+\.\s+.+$\n?)+/gm, (match) => {
      const items = match
        .trim()
        .split("\n")
        .map((line: string) => {
          const content = line.replace(/^\d+\.\s+/, "");
          return `<li>${content}</li>`;
        })
        .join("");
      return `<ol>${items}</ol>\n`;
    });

    // Paragraphs: split by double newline, wrap plain text blocks in <p>
    const blocks = html.split(/\n\n+/);
    html = blocks
      .map((block: string) => {
        block = block.trim();
        if (!block) return "";
        if (/^<(h[1-6]|ul|ol|li|blockquote|hr|div|p|pre|table)/i.test(block)) {
          return block;
        }
        block = block.replace(/\n/g, "<br/>");
        return `<p>${block}</p>`;
      })
      .filter(Boolean)
      .join("\n");

    return html;
  }

  /**
   * Handle write_note tool calls: create, update, append notes
   */
  private async callWriteNote(args: any): Promise<any> {
    const {
      action,
      parentKey,
      noteKey,
      content,
      tags,
      libraryID = Zotero.Libraries.userLibraryID,
    } = args;

    try {
      const htmlContent = this.markdownToNoteHtml(content);

      switch (action) {
        case "create": {
          const note = new Zotero.Item("note");
          note.libraryID = libraryID;

          if (parentKey) {
            const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
              libraryID,
              parentKey,
            );
            if (!parentItem) {
              throw new Error(
                `Parent item not found in library ${libraryID}: ${parentKey}`,
              );
            }
            if (parentItem.isNote()) {
              throw new Error("Cannot attach a note to another note");
            }
            if (parentItem.isAttachment()) {
              throw new Error("Cannot attach a note to an attachment");
            }
            note.parentKey = parentKey;
          }

          note.setNote(htmlContent);

          if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
              note.addTag(tag, 0);
            }
          }

          await note.saveTx();

          ztoolkit.log(
            `[StreamableMCP] Created note ${note.key}${parentKey ? " attached to " + parentKey : " (standalone)"}`,
          );

          return {
            action: "create",
            success: true,
            data: {
              noteKey: note.key,
              parentKey: parentKey || null,
              type: parentKey ? "child" : "standalone",
              contentPreview: content.substring(0, 200),
              contentLength: content.length,
              tags: tags || [],
              dateCreated: note.dateAdded,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Note created successfully (key: ${note.key})`,
            },
          };
        }

        case "update": {
          if (!noteKey) {
            throw new Error("noteKey is required for update action");
          }

          const existingNote = await Zotero.Items.getByLibraryAndKeyAsync(
            libraryID,
            noteKey,
          );
          if (!existingNote) {
            throw new Error(
              `Note not found in library ${libraryID}: ${noteKey}`,
            );
          }
          if (!existingNote.isNote()) {
            throw new Error(`Item ${noteKey} is not a note`);
          }

          existingNote.setNote(htmlContent);

          if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
              existingNote.addTag(tag, 0);
            }
          }

          await existingNote.saveTx();

          ztoolkit.log(`[StreamableMCP] Updated note ${noteKey}`);

          return {
            action: "update",
            success: true,
            data: {
              noteKey,
              contentPreview: content.substring(0, 200),
              contentLength: content.length,
              tags: existingNote.getTags().map((t: any) => t.tag),
              dateModified: existingNote.dateModified,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Note ${noteKey} updated successfully`,
            },
          };
        }

        case "append": {
          if (!noteKey) {
            throw new Error("noteKey is required for append action");
          }

          const existingNote = await Zotero.Items.getByLibraryAndKeyAsync(
            libraryID,
            noteKey,
          );
          if (!existingNote) {
            throw new Error(
              `Note not found in library ${libraryID}: ${noteKey}`,
            );
          }
          if (!existingNote.isNote()) {
            throw new Error(`Item ${noteKey} is not a note`);
          }

          const currentHtml = existingNote.getNote() || "";
          const appendedHtml = currentHtml + htmlContent;
          existingNote.setNote(appendedHtml);

          if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
              existingNote.addTag(tag, 0);
            }
          }

          await existingNote.saveTx();

          ztoolkit.log(`[StreamableMCP] Appended to note ${noteKey}`);

          return {
            action: "append",
            success: true,
            data: {
              noteKey,
              appendedContentPreview: content.substring(0, 200),
              appendedContentLength: content.length,
              totalContentLength: appendedHtml.length,
              tags: existingNote.getTags().map((t: any) => t.tag),
              dateModified: existingNote.dateModified,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Content appended to note ${noteKey} successfully`,
            },
          };
        }

        default:
          throw new Error(
            `Unknown action: ${action}. Use create, update, or append.`,
          );
      }
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Write note error: ${error}`, "error");
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Handle write_tag tool calls: add, remove, set tags on items
   */
  private async callWriteTag(args: any): Promise<any> {
    const {
      action,
      itemKey,
      tags,
      libraryID = Zotero.Libraries.userLibraryID,
    } = args;

    try {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        libraryID,
        itemKey,
      );
      if (!item) {
        throw new Error(`Item not found in library ${libraryID}: ${itemKey}`);
      }

      const beforeTags = item.getTags().map((t: any) => t.tag);

      switch (action) {
        case "add": {
          for (const tag of tags) {
            item.addTag(tag, 0);
          }
          break;
        }

        case "remove": {
          for (const tag of tags) {
            item.removeTag(tag);
          }
          break;
        }

        case "set": {
          // Remove all existing tags
          for (const existing of beforeTags) {
            item.removeTag(existing);
          }
          // Add new tags
          for (const tag of tags) {
            item.addTag(tag, 0);
          }
          break;
        }

        default:
          throw new Error(
            `Unknown action: ${action}. Use add, remove, or set.`,
          );
      }

      await item.saveTx();

      const afterTags = item.getTags().map((t: any) => t.tag);

      ztoolkit.log(
        `[StreamableMCP] write_tag ${action} on ${itemKey}: [${beforeTags.join(", ")}] -> [${afterTags.join(", ")}]`,
      );

      return {
        action,
        success: true,
        data: {
          itemKey,
          beforeTags,
          afterTags,
          tagsModified: tags,
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message: `Tags ${action === "add" ? "added to" : action === "remove" ? "removed from" : "set on"} item ${itemKey}`,
        },
      };
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Write tag error: ${error}`, "error");
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Handle write_metadata tool calls: update fields and creators on items
   */
  private async callWriteMetadata(args: any): Promise<any> {
    const {
      itemKey,
      fields,
      creators,
      libraryID = Zotero.Libraries.userLibraryID,
    } = args;

    try {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        libraryID,
        itemKey,
      );
      if (!item) {
        throw new Error(`Item not found in library ${libraryID}: ${itemKey}`);
      }
      if (!item.isRegularItem()) {
        throw new Error(
          `Item ${itemKey} is not a regular item (it is a ${item.itemType}). Use write_note for notes.`,
        );
      }

      const updatedFields: Record<string, { before: string; after: string }> =
        {};
      let creatorsUpdated = false;
      let beforeCreators: any[] = [];
      let afterCreators: any[] = [];

      // Update fields
      if (fields && typeof fields === "object") {
        for (const [fieldName, value] of Object.entries(fields)) {
          try {
            const before = String(item.getField(fieldName) || "");
            item.setField(fieldName, String(value));
            updatedFields[fieldName] = { before, after: String(value) };
          } catch (fieldError) {
            throw new Error(
              `Failed to set field "${fieldName}": ${fieldError}`,
            );
          }
        }
      }

      // Update creators
      if (creators && Array.isArray(creators)) {
        beforeCreators = item.getCreators().map((c: any) => ({
          creatorType: Zotero.CreatorTypes.getName(c.creatorTypeID),
          firstName: c.firstName,
          lastName: c.lastName,
        }));

        item.setCreators(
          creators.map((c: any) => {
            const creatorData: any = {
              creatorType: c.creatorType || "author",
            };
            if (c.name) {
              // Organization / single-field name
              creatorData.name = c.name;
            } else {
              creatorData.firstName = c.firstName || "";
              creatorData.lastName = c.lastName || "";
            }
            return creatorData;
          }),
        );

        creatorsUpdated = true;
        afterCreators = creators;
      }

      await item.saveTx();

      ztoolkit.log(
        `[StreamableMCP] Updated metadata on ${itemKey}: fields=[${Object.keys(updatedFields).join(", ")}], creators=${creatorsUpdated}`,
      );

      return {
        success: true,
        data: {
          itemKey,
          updatedFields,
          creatorsUpdated,
          ...(creatorsUpdated ? { beforeCreators, afterCreators } : {}),
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          message: `Metadata updated on item ${itemKey}`,
        },
      };
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Write metadata error: ${error}`, "error");
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Handle write_item tool calls: create items, reparent attachments, and import files
   */
  private async callWriteItem(args: any): Promise<any> {
    const {
      action,
      itemType,
      fields,
      creators,
      tags,
      attachmentKeys,
      parentKey,
      filePath,
      parentItemKey,
      title,
      libraryID = Zotero.Libraries.userLibraryID,
    } = args;

    try {
      switch (action) {
        case "create": {
          if (!itemType) {
            throw new Error(
              "itemType is required for create action (e.g., journalArticle, book, conferencePaper)",
            );
          }

          // Create new item
          const item = new Zotero.Item(itemType);
          item.libraryID = libraryID;

          // Set fields
          if (fields && typeof fields === "object") {
            for (const [fieldName, value] of Object.entries(fields)) {
              try {
                item.setField(fieldName, String(value));
              } catch (fieldError) {
                throw new Error(
                  `Failed to set field "${fieldName}": ${fieldError}`,
                );
              }
            }
          }

          // Set creators
          if (creators && Array.isArray(creators)) {
            item.setCreators(
              creators.map((c: any) => {
                const creatorData: any = {
                  creatorType: c.creatorType || "author",
                };
                if (c.name) {
                  creatorData.name = c.name;
                } else {
                  creatorData.firstName = c.firstName || "";
                  creatorData.lastName = c.lastName || "";
                }
                return creatorData;
              }),
            );
          }

          // Add tags
          if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
              item.addTag(tag, 0);
            }
          }

          await item.saveTx();

          ztoolkit.log(
            `[StreamableMCP] Created item ${item.key} (type: ${itemType})`,
          );

          // Re-parent attachments if provided
          const reparentedAttachments: string[] = [];
          if (attachmentKeys && Array.isArray(attachmentKeys)) {
            for (const attKey of attachmentKeys) {
              const attachment = await Zotero.Items.getByLibraryAndKeyAsync(
                libraryID,
                attKey,
              );
              if (!attachment) {
                ztoolkit.log(
                  `[StreamableMCP] Attachment not found in library ${libraryID}: ${attKey}`,
                  "warn",
                );
                continue;
              }
              if (!attachment.isAttachment()) {
                ztoolkit.log(
                  `[StreamableMCP] Item ${attKey} is not an attachment (type: ${attachment.itemType}), skipping`,
                  "warn",
                );
                continue;
              }
              attachment.parentKey = item.key;
              await attachment.saveTx();
              reparentedAttachments.push(attKey);
              ztoolkit.log(
                `[StreamableMCP] Re-parented attachment ${attKey} under ${item.key}`,
              );
            }
          }

          return {
            action: "create",
            success: true,
            data: {
              itemKey: item.key,
              itemType,
              title: fields?.title || "",
              creatorsCount: creators?.length || 0,
              tagsCount: tags?.length || 0,
              reparentedAttachments,
              dateCreated: item.dateAdded,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Item created (key: ${item.key}, type: ${itemType})${reparentedAttachments.length > 0 ? `, ${reparentedAttachments.length} attachment(s) attached` : ""}`,
            },
          };
        }

        case "reparent": {
          if (
            !attachmentKeys ||
            !Array.isArray(attachmentKeys) ||
            attachmentKeys.length === 0
          ) {
            throw new Error("attachmentKeys is required for reparent action");
          }
          if (!parentKey) {
            throw new Error("parentKey is required for reparent action");
          }

          // Verify parent exists
          const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
            libraryID,
            parentKey,
          );
          if (!parentItem) {
            throw new Error(
              `Parent item not found in library ${libraryID}: ${parentKey}`,
            );
          }
          if (!parentItem.isRegularItem()) {
            throw new Error(
              `Parent ${parentKey} is not a regular item (type: ${parentItem.itemType})`,
            );
          }

          const results: Array<{
            key: string;
            success: boolean;
            error?: string;
          }> = [];
          for (const attKey of attachmentKeys) {
            try {
              const attachment = await Zotero.Items.getByLibraryAndKeyAsync(
                libraryID,
                attKey,
              );
              if (!attachment) {
                results.push({
                  key: attKey,
                  success: false,
                  error: `Not found in library ${libraryID}`,
                });
                continue;
              }
              if (!attachment.isAttachment() && !attachment.isNote()) {
                results.push({
                  key: attKey,
                  success: false,
                  error: `Not an attachment or note (type: ${attachment.itemType})`,
                });
                continue;
              }
              attachment.parentKey = parentKey;
              await attachment.saveTx();
              results.push({ key: attKey, success: true });
              ztoolkit.log(
                `[StreamableMCP] Re-parented ${attKey} under ${parentKey}`,
              );
            } catch (attError) {
              results.push({
                key: attKey,
                success: false,
                error: String(attError),
              });
            }
          }

          const successCount = results.filter((r) => r.success).length;

          return {
            action: "reparent",
            success: successCount > 0,
            data: {
              parentKey,
              results,
              successCount,
              totalCount: attachmentKeys.length,
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `Re-parented ${successCount}/${attachmentKeys.length} item(s) under ${parentKey}`,
            },
          };
        }

        case "import": {
          if (!filePath || typeof filePath !== "string") {
            throw new Error(
              "filePath is required for import action (absolute path to the file)",
            );
          }
          const importParentKey = parentItemKey || parentKey;
          if (!importParentKey) {
            throw new Error("parentItemKey is required for import action");
          }
          if (!(await IOUtils.exists(filePath))) {
            throw new Error(`File not found: ${filePath}`);
          }

          // Verify parent exists
          const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
            libraryID,
            importParentKey,
          );
          if (!parentItem) {
            throw new Error(
              `Parent item not found in library ${libraryID}: ${importParentKey}`,
            );
          }
          if (!parentItem.isRegularItem()) {
            throw new Error(
              `Parent ${importParentKey} is not a regular item (type: ${parentItem.itemType}), cannot attach files`,
            );
          }

          // Import file as attachment
          const attachment = await Zotero.Attachments.importFromFile({
            file: filePath,
            parentItemID: parentItem.id,
            title:
              title || filePath.split(/[\\/]/).pop() || "Imported Attachment",
          });

          ztoolkit.log(
            `[StreamableMCP] Imported file as attachment ${attachment.key} under ${importParentKey}`,
          );

          return {
            action: "import",
            success: true,
            data: {
              attachmentKey: attachment.key,
              parentItemKey: importParentKey,
              filePath,
              title: attachment.getField("title"),
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              message: `File imported as attachment (key: ${attachment.key}) under parent ${importParentKey}`,
            },
          };
        }

        default:
          throw new Error(
            `Unknown action: ${action}. Use create, reparent, or import.`,
          );
      }
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Write item error: ${error}`, "error");
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Format tool result for MCP response with intelligent content type detection
   */
  private formatToolResult(result: any, toolName: string, args: any): any {
    // Check if client explicitly requested text format
    const requestedTextFormat = args?.format === "text";

    // If result is already a string (text format), wrap it in MCP content format
    if (typeof result === "string") {
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    }

    // For structured data, provide both JSON and formatted options
    if (typeof result === "object" && result !== null) {
      // If explicitly requested text format, convert to readable text
      if (requestedTextFormat) {
        return {
          content: [
            {
              type: "text",
              text: this.formatObjectAsText(result, toolName),
            },
          ],
          isError: false,
        };
      }

      // Default: provide structured JSON with formatted preview
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
        // Include raw structured data for programmatic access
        _structuredData: result,
        _contentType: "application/json",
      };
    }

    // Fallback for other types
    return {
      content: [
        {
          type: "text",
          text: String(result),
        },
      ],
      isError: false,
    };
  }

  /**
   * Format object as human-readable text based on tool type
   */
  private formatObjectAsText(obj: any, toolName: string): string {
    switch (toolName) {
      case "get_content":
        return this.formatContentAsText(obj);
      case "search_library":
        return this.formatSearchResultsAsText(obj);
      case "get_annotations":
        return this.formatAnnotationsAsText(obj);
      default:
        return JSON.stringify(obj, null, 2);
    }
  }

  private formatContentAsText(contentResult: any): string {
    const parts = [];

    if (contentResult.title) {
      parts.push(`TITLE: ${contentResult.title}\n`);
    }

    if (contentResult.content) {
      if (contentResult.content.abstract) {
        parts.push(`ABSTRACT:\n${contentResult.content.abstract.content}\n`);
      }

      if (contentResult.content.attachments) {
        for (const att of contentResult.content.attachments) {
          parts.push(
            `ATTACHMENT (${att.filename || att.type}):\n${att.content}\n`,
          );
        }
      }

      if (contentResult.content.notes) {
        for (const note of contentResult.content.notes) {
          parts.push(`NOTE (${note.title}):\n${note.content}\n`);
        }
      }
    }

    return parts.join("\n---\n\n");
  }

  private formatSearchResultsAsText(searchResult: any): string {
    if (!searchResult.results || !Array.isArray(searchResult.results)) {
      return JSON.stringify(searchResult, null, 2);
    }

    const parts = [`SEARCH RESULTS (${searchResult.results.length} items):\n`];

    searchResult.results.forEach((item: any, index: number) => {
      parts.push(`${index + 1}. ${item.title || "Untitled"}`);
      if (item.creators && item.creators.length > 0) {
        parts.push(
          `   Authors: ${item.creators.map((c: any) => c.name || `${c.firstName} ${c.lastName}`).join(", ")}`,
        );
      }
      if (item.date) {
        parts.push(`   Date: ${item.date}`);
      }
      if (item.itemKey) {
        parts.push(`   Key: ${item.itemKey}`);
      }
      parts.push("");
    });

    return parts.join("\n");
  }

  private formatAnnotationsAsText(annotationResult: any): string {
    if (!annotationResult.data || !Array.isArray(annotationResult.data)) {
      return JSON.stringify(annotationResult, null, 2);
    }

    const parts = [`ANNOTATIONS (${annotationResult.data.length} items):\n`];

    annotationResult.data.forEach((ann: any, index: number) => {
      parts.push(`${index + 1}. [${ann.type.toUpperCase()}] ${ann.content}`);
      if (ann.page) {
        parts.push(`   Page: ${ann.page}`);
      }
      if (ann.dateModified) {
        parts.push(`   Modified: ${ann.dateModified}`);
      }
      parts.push("");
    });

    return parts.join("\n");
  }

  private createResponse(id: string | number | null, result: any): MCPResponse {
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  private createError(
    id: string | number | null,
    code: number,
    message: string,
    data?: any,
  ): MCPResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
  }

  private isNotificationRequest(request: MCPRequest): boolean {
    return (
      !Object.prototype.hasOwnProperty.call(request, "id") ||
      request.id === null ||
      request.id === undefined
    );
  }

  /**
   * Get server status and capabilities
   */
  getStatus() {
    const semanticEnabled =
      Zotero.Prefs.get(
        "extensions.zotero.zotero-mcp-plugin.semantic.enabled",
        true,
      ) !== false;
    const writeEnabled = this.isWriteEnabled();
    let activeToolNames = getAllToolNames();
    if (!semanticEnabled) {
      activeToolNames = activeToolNames.filter(
        (name) => !SEMANTIC_TOOL_NAMES.has(name),
      );
    }
    if (!writeEnabled) {
      activeToolNames = activeToolNames.filter(
        (name) => !WRITE_TOOL_NAMES.has(name),
      );
    }

    return {
      isInitialized: this.isInitialized,
      serverInfo: this.serverInfo,
      protocolVersion: "2024-11-05",
      supportedMethods: [
        "initialize",
        "initialized",
        "notifications/initialized",
        "tools/list",
        "tools/call",
        "resources/list",
        "prompts/list",
        "ping",
      ],
      availableTools: activeToolNames,
      toolPolicy: getToolPolicySummary(activeToolNames),
      transport: {
        type: "streamable-http",
        keepAliveSupported: false,
        maxConnections: 100,
      },
    };
  }

  /**
   * Get fulltext search mode configuration
   */
  private getFulltextModeConfiguration(mode: string): any {
    const modeConfigs = {
      minimal: {
        contextLength: 100,
        maxResults: 20,
      },
      preview: {
        contextLength: 200,
        maxResults: 50,
      },
      standard: {
        contextLength: 250,
        maxResults: 100,
      },
      complete: {
        contextLength: 400,
        maxResults: 200,
      },
    };

    return (
      modeConfigs[mode as keyof typeof modeConfigs] || modeConfigs["standard"]
    );
  }

  /**
   * Get search mode configuration
   */
  private getSearchModeConfiguration(mode: string): any {
    const modeConfigs = {
      minimal: {
        limit: 30,
      },
      preview: {
        limit: 100,
      },
      standard: {
        limit: 200,
      },
      complete: {
        limit: 500,
      },
    };

    return (
      modeConfigs[mode as keyof typeof modeConfigs] || modeConfigs["standard"]
    );
  }

  /**
   * Get collection mode configuration
   */
  private getCollectionModeConfiguration(mode: string): any {
    const modeConfigs = {
      minimal: {
        limit: 20,
      },
      preview: {
        limit: 50,
      },
      standard: {
        limit: 100,
      },
      complete: {
        limit: 500,
      },
    };

    return (
      modeConfigs[mode as keyof typeof modeConfigs] || modeConfigs["standard"]
    );
  }

  /**
   * Get item details mode configuration
   */
  private getItemDetailsModeConfiguration(mode: string): any {
    const modeConfigs = {
      minimal: {
        fields: ["key", "title", "creators", "date", "itemType"],
      },
      preview: {
        fields: [
          "key",
          "title",
          "creators",
          "date",
          "itemType",
          "abstractNote",
          "tags",
          "collections",
        ],
      },
      standard: {
        fields: null, // Include most fields (default behavior)
      },
      complete: {
        fields: null, // Include all fields
      },
    };

    return (
      modeConfigs[mode as keyof typeof modeConfigs] || modeConfigs["standard"]
    );
  }
}
