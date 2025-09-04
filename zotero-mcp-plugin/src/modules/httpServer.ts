import { StreamableMCPServer } from "./streamableMCPServer";
import { serverPreferences } from "./serverPreferences";
import { testMCPIntegration } from "./mcpTest";

declare let ztoolkit: ZToolkit;

export class HttpServer {
  public static testServer() {
    Zotero.debug("Static testServer method called.");
  }
  private serverSocket: any;
  private isRunning: boolean = false;
  private mcpServer: StreamableMCPServer | null = null;
  private port: number = 8080;

  public isServerRunning(): boolean {
    return this.isRunning;
  }

  public start(port: number) {
    if (this.isRunning) {
      Zotero.debug("[HttpServer] Server is already running.");
      return;
    }

    // 验证端口参数
    if (!port || isNaN(port) || port < 1 || port > 65535) {
      const errorMsg = `[HttpServer] Invalid port number: ${port}. Port must be between 1 and 65535.`;
      Zotero.debug(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      this.port = port;
      Zotero.debug(
        `[HttpServer] Attempting to start server on port ${port}...`,
      );

      this.serverSocket = Cc[
        "@mozilla.org/network/server-socket;1"
      ].createInstance(Ci.nsIServerSocket);

      // init方法参数：端口，是否允许回环地址，backlog队列大小
      this.serverSocket.init(port, true, -1);
      this.serverSocket.asyncListen(this.listener);
      this.isRunning = true;

      Zotero.debug(
        `[HttpServer] Successfully started HTTP server on port ${port}`,
      );

      // Initialize integrated MCP server if enabled
      this.initializeMCPServer();
    } catch (e) {
      const errorMsg = `[HttpServer] Failed to start server on port ${port}: ${e}`;
      Zotero.debug(errorMsg);
      this.stop();
      throw new Error(errorMsg);
    }
  }

  private initializeMCPServer(): void {
    try {
      this.mcpServer = new StreamableMCPServer();
      ztoolkit.log(`[HttpServer] Integrated MCP server initialized`);
    } catch (error) {
      ztoolkit.log(`[HttpServer] Failed to initialize MCP server: ${error}`);
      // Don't throw error, HTTP server can still work without MCP
    }
  }

  public stop() {
    if (!this.isRunning || !this.serverSocket) {
      Zotero.debug(
        "[HttpServer] Server is not running or socket is null, nothing to stop.",
      );
      return;
    }
    try {
      this.serverSocket.close();
      this.isRunning = false;
      Zotero.debug("[HttpServer] HTTP server stopped successfully.");
    } catch (e) {
      Zotero.debug(`[HttpServer] Error stopping server: ${e}`);
    }

    // Clean up MCP server
    this.cleanupMCPServer();
  }

  private cleanupMCPServer(): void {
    if (this.mcpServer) {
      this.mcpServer = null;
      ztoolkit.log("[HttpServer] MCP server cleaned up");
    }
  }

  private listener = {
    onSocketAccepted: async (_socket: any, transport: any) => {
      let input: any = null;
      let output: any = null;
      let sin: any = null;
      const converterStream: any = null;

      try {
        input = transport.openInputStream(0, 0, 0);
        output = transport.openOutputStream(0, 0, 0);

        // 使用转换输入流来正确处理UTF-8编码
        const converterStream = Cc[
          "@mozilla.org/intl/converter-input-stream;1"
        ].createInstance(Ci.nsIConverterInputStream);
        converterStream.init(input, "UTF-8", 0, 0);

        sin = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
          Ci.nsIScriptableInputStream,
        );
        sin.init(input);

        // 改进请求读取逻辑 - 读取完整的HTTP请求
        let requestText = "";
        let totalBytesRead = 0;
        const maxRequestSize = 4096; // 增加最大请求大小

        try {
          // 尝试读取完整的HTTP请求直到遇到空行
          while (totalBytesRead < maxRequestSize) {
            const bytesToRead = Math.min(1024, maxRequestSize - totalBytesRead);
            if (input.available() === 0) {
              // 等待数据到达
              await new Promise((resolve) => setTimeout(resolve, 10));
              if (input.available() === 0) {
                break; // 没有更多数据
              }
            }

            // 尝试使用UTF-8转换流读取
            let chunk = "";
            try {
              const str: { value?: string } = {};
              const bytesRead = converterStream.readString(bytesToRead, str);
              chunk = str.value || "";
              if (bytesRead === 0) break;
            } catch (converterError) {
              // 如果转换器失败，回退到原始方法
              ztoolkit.log(
                `[HttpServer] Converter failed, using fallback: ${converterError}`,
                "error",
              );
              chunk = sin.read(bytesToRead);
              if (!chunk) break;
            }

            requestText += chunk;
            totalBytesRead += chunk.length;

            // 检查是否读取到完整的HTTP头部（以双CRLF结束）
            if (requestText.includes("\r\n\r\n")) {
              break;
            }
          }
        } catch (readError) {
          ztoolkit.log(
            `[HttpServer] Error reading request: ${readError}`,
            "error",
          );
          requestText = requestText || "INVALID_REQUEST";
        }

        try {
          if (converterStream) converterStream.close();
        } catch (e) {
          ztoolkit.log(
            `[HttpServer] Error closing converter stream: ${e}`,
            "error",
          );
        }

        if (sin) sin.close();

        const requestLine = requestText.split("\r\n")[0];
        ztoolkit.log(
          `[HttpServer] Received request: ${requestLine} (${requestText.length} bytes)`,
        );

        // 验证请求格式
        if (!requestLine || !requestLine.includes("HTTP/")) {
          ztoolkit.log(
            `[HttpServer] Invalid request format: ${requestLine}`,
            "error",
          );
          try {
            const errorResponse =
              "HTTP/1.1 400 Bad Request\r\n" +
              "Content-Type: text/plain; charset=utf-8\r\n" +
              "Content-Length: 11\r\n" +
              "Connection: close\r\n" +
              "\r\n" +
              "Bad Request";
            output.write(errorResponse, errorResponse.length);
          } catch (e) {
            ztoolkit.log(
              `[HttpServer] Error sending bad request response: ${e}`,
              "error",
            );
          }
          return;
        }

        try {
          const requestParts = requestLine.split(" ");
          const method = requestParts[0];
          const urlPath = requestParts[1];
          const url = new URL(urlPath, "http://127.0.0.1");
          const query = new URLSearchParams(url.search);
          const path = url.pathname;
          
          // 提取POST请求的body
          let requestBody = "";
          if (method === "POST") {
            const bodyStart = requestText.indexOf("\r\n\r\n");
            if (bodyStart !== -1) {
              requestBody = requestText.substring(bodyStart + 4);
            }
          }

          let result;

          if (path === "/mcp" && method === "POST") {
            // Handle MCP requests via streamable HTTP
            if (this.mcpServer) {
              result = await this.mcpServer.handleMCPRequest(requestBody);
            } else {
              result = {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({ error: "MCP server not enabled" }),
              };
            }
          } else if (path === "/mcp/status") {
            // MCP server status endpoint
            if (this.mcpServer) {
              result = {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify(this.mcpServer.getStatus()),
              };
            } else {
              result = {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({ error: "MCP server not enabled", enabled: false }),
              };
            }
          } else if (path === "/mcp/capabilities" || path === "/capabilities" || path === "/help") {
            // Comprehensive capabilities discovery endpoint
            result = {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify(this.getCapabilities()),
            };
          } else if (path === "/test/mcp") {
            const testResult = await testMCPIntegration();
            result = {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify(testResult),
            };
          } else if (path.startsWith("/ping")) {
            const response =
              "HTTP/1.1 200 OK\r\n" +
              "Content-Type: text/plain\r\n" +
              "Content-Length: 4\r\n" +
              "Connection: close\r\n" +
              "\r\n" +
              "pong";
            output.write(response, response.length);
            return;
          } else {
            const response =
              "HTTP/1.1 404 Not Found\r\n" +
              "Content-Type: text/plain\r\n" +
              "Content-Length: 9\r\n" +
              "Connection: close\r\n" +
              "\r\n" +
              "Not Found";
            output.write(response, response.length);
            return;
          }

          const body = result.body || "";
          const storageStream = Cc[
            "@mozilla.org/storagestream;1"
          ].createInstance(Ci.nsIStorageStream);
          storageStream.init(8192, 0xffffffff);
          const storageConverter = Cc[
            "@mozilla.org/intl/converter-output-stream;1"
          ].createInstance(Ci.nsIConverterOutputStream);
          (storageConverter as any).init(
            storageStream.getOutputStream(0),
            "UTF-8",
            0,
            0x003f,
          );
          storageConverter.writeString(body);
          storageConverter.close();
          const byteLength = storageStream.length;
          const finalHeaders =
            `HTTP/1.1 ${result.status} ${result.statusText}\r\n` +
            `Content-Type: ${
              result.headers?.["Content-Type"] ||
              "application/json; charset=utf-8"
            }\r\n` +
            `Content-Length: ${byteLength}\r\n` +
            "Connection: close\r\n" +
            "\r\n";
          output.write(finalHeaders, finalHeaders.length);
          if (byteLength > 0) {
            const inputStream = storageStream.newInputStream(0);
            output.writeFrom(inputStream, byteLength);
          }
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          ztoolkit.log(
            `[HttpServer] Error in request handling: ${error.message}`,
            "error",
          );
          const errorBody = JSON.stringify({ error: error.message });
          const errorResponse =
            `HTTP/1.1 500 Internal Server Error\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${errorBody.length}\r\n` +
            "Connection: close\r\n" +
            "\r\n" +
            errorBody;
          output.write(errorResponse, errorResponse.length);
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        ztoolkit.log(
          `[HttpServer] Error handling request: ${error.message}`,
          "error",
        );
        ztoolkit.log(`[HttpServer] Error stack: ${error.stack}`, "error");
        try {
          if (!output) {
            output = transport.openOutputStream(0, 0, 0);
          }
          const errorResponse =
            "HTTP/1.1 500 Internal Server Error\r\n" +
            "Content-Type: text/plain\r\n" +
            "Content-Length: 21\r\n" +
            "Connection: close\r\n" +
            "\r\n" +
            "Internal Server Error";
          output.write(errorResponse, errorResponse.length);
          ztoolkit.log(`[HttpServer] Error response sent`);
        } catch (closeError) {
          ztoolkit.log(
            `[HttpServer] Error sending error response: ${closeError}`,
            "error",
          );
        }
      } finally {
        // 确保资源清理
        try {
          if (output) {
            output.close();
            ztoolkit.log(`[HttpServer] Output stream closed`);
          }
        } catch (e) {
          ztoolkit.log(
            `[HttpServer] Error closing output stream: ${e}`,
            "error",
          );
        }

        try {
          if (input) {
            input.close();
            ztoolkit.log(`[HttpServer] Input stream closed`);
          }
        } catch (e) {
          ztoolkit.log(
            `[HttpServer] Error closing input stream: ${e}`,
            "error",
          );
        }
      }
    },
    onStopListening: () => {
      this.isRunning = false;
    },
  };

/**
 * Get comprehensive capabilities and API documentation
 */
private getCapabilities() {
  return {
    serverInfo: {
      name: "Zotero MCP Plugin",
      version: "1.1.0",
      description: "Model Context Protocol integration for Zotero research management",
      author: "Zotero MCP Team",
      repository: "https://github.com/zotero/zotero-mcp",
      documentation: "https://github.com/zotero/zotero-mcp/blob/main/README.md"
    },
    protocols: {
      mcp: {
        version: "2024-11-05",
        transport: "streamable-http",
        endpoint: "/mcp",
        description: "Full MCP protocol support for AI clients"
      },
      rest: {
        version: "1.1.0",
        description: "REST API for direct HTTP access",
        baseUrl: `http://127.0.0.1:${this.port}`
      }
    },
    capabilities: {
      search: {
        library: true,
        annotations: true,
        collections: true,
        fullText: true,
        advanced: true
      },
      retrieval: {
        items: true,
        annotations: true,
        pdfContent: true,
        collections: true,
        notes: true
      },
      formats: {
        json: true,
        text: true,
        markdown: false
      }
    },
    tools: [
      {
        name: "search_library",
        description: "Search the Zotero library with advanced parameters including boolean operators, relevance scoring, and pagination. Returns: {query, pagination, searchTime, results: [{key, title, creators, date, attachments: [{key, filename, filePath, contentType, linkMode}]}], searchFeatures, version}",
        category: "search",
        parameters: {
          q: { type: "string", description: "General search query", required: false },
          title: { type: "string", description: "Title search", required: false },
          titleOperator: { 
            type: "string", 
            enum: ["contains", "exact", "startsWith", "endsWith", "regex"],
            description: "Title search operator",
            required: false
          },
          yearRange: { type: "string", description: "Year range (e.g., '2020-2023')", required: false },
          relevanceScoring: { type: "boolean", description: "Enable relevance scoring", required: false },
          sort: { 
            type: "string", 
            enum: ["relevance", "date", "title", "year"],
            description: "Sort order",
            required: false
          },
          limit: { type: "number", description: "Maximum results to return", required: false },
          offset: { type: "number", description: "Pagination offset", required: false }
        },
        examples: [
          { query: { q: "machine learning" }, description: "Basic text search" },
          { query: { title: "deep learning", titleOperator: "contains" }, description: "Title-specific search" },
          { query: { yearRange: "2020-2023", sort: "relevance" }, description: "Year-filtered search with relevance sorting" }
        ]
      },
      {
        name: "search_annotations",
        description: "Search all notes, PDF annotations and highlights with smart content processing",
        category: "search",
        parameters: {
          q: { type: "string", description: "Search query for content, comments, and tags", required: false },
          type: { 
            type: "string", 
            enum: ["note", "highlight", "annotation", "ink", "text", "image"],
            description: "Filter by annotation type",
            required: false
          },
          detailed: { type: "boolean", description: "Return detailed content (default: false for preview)", required: false },
          limit: { type: "number", description: "Maximum results (preview: 20, detailed: 50)", required: false },
          offset: { type: "number", description: "Pagination offset", required: false }
        },
        examples: [
          { query: { q: "important findings" }, description: "Search annotation content" },
          { query: { type: "highlight", detailed: true }, description: "Get detailed highlights" }
        ]
      },
      {
        name: "get_item_details",
        description: "Get detailed information for a specific item including metadata, abstract, attachments info, notes, and tags but not fulltext content. Returns: {key, title, creators, date, itemType, publicationTitle, volume, issue, pages, DOI, url, abstractNote, tags, notes: [note_content], attachments: [{key, title, path, contentType, filename, url, linkMode, hasFulltext, size}]}",
        category: "retrieval",
        parameters: {
          itemKey: { type: "string", description: "Unique item key", required: true }
        },
        examples: [
          { query: { itemKey: "ABCD1234" }, description: "Get item by key" }
        ]
      },
      {
        name: "get_annotation_by_id",
        description: "Get complete content of a specific annotation by ID",
        category: "retrieval",
        parameters: {
          annotationId: { type: "string", description: "Annotation ID", required: true }
        }
      },
      {
        name: "get_annotations_batch",
        description: "Get complete content of multiple annotations by IDs",
        category: "retrieval",
        parameters: {
          ids: { 
            type: "array", 
            items: { type: "string" },
            description: "Array of annotation IDs",
            required: true
          }
        }
      },
      {
        name: "get_item_pdf_content",
        description: "Extract text content from PDF attachments",
        category: "retrieval",
        parameters: {
          itemKey: { type: "string", description: "Item key", required: true },
          page: { type: "number", description: "Specific page number (optional)", required: false }
        }
      },
      {
        name: "get_collections",
        description: "Get list of all collections in the library",
        category: "collections",
        parameters: {
          limit: { type: "number", description: "Maximum results to return", required: false },
          offset: { type: "number", description: "Pagination offset", required: false }
        }
      },
      {
        name: "search_collections",
        description: "Search collections by name",
        category: "collections",
        parameters: {
          q: { type: "string", description: "Collection name search query", required: true },
          limit: { type: "number", description: "Maximum results to return", required: false }
        }
      },
      {
        name: "get_collection_details",
        description: "Get detailed information about a specific collection",
        category: "collections",
        parameters: {
          collectionKey: { type: "string", description: "Collection key", required: true }
        }
      },
      {
        name: "get_collection_items",
        description: "Get items in a specific collection",
        category: "collections",
        parameters: {
          collectionKey: { type: "string", description: "Collection key", required: true },
          limit: { type: "number", description: "Maximum results to return", required: false },
          offset: { type: "number", description: "Pagination offset", required: false }
        }
      },
      {
        name: "get_item_fulltext",
        description: "Get comprehensive fulltext content from item including attachments, notes, abstracts, and webpage snapshots. Returns: {itemKey, title, itemType, abstract, fulltext: {attachments: [{attachmentKey, filename, filePath, contentType, type, content, length, extractionMethod}], notes: [{noteKey, title, content, htmlContent, length, dateModified}], webpage: {url, filename, filePath, content, length, type}, total_length}, metadata: {extractedAt, sources}}",
        category: "fulltext",
        parameters: {
          itemKey: { type: "string", description: "Item key", required: true },
          attachments: { type: "boolean", description: "Include attachment content (default: true)", required: false },
          notes: { type: "boolean", description: "Include notes content (default: true)", required: false },
          webpage: { type: "boolean", description: "Include webpage snapshots (default: true)", required: false },
          abstract: { type: "boolean", description: "Include abstract (default: true)", required: false }
        },
        examples: [
          { query: { itemKey: "ABCD1234" }, description: "Get all fulltext content for an item" },
          { query: { itemKey: "ABCD1234", attachments: true, notes: false }, description: "Get only attachment content" }
        ]
      },
      {
        name: "get_attachment_content",
        description: "Extract text content from a specific attachment (PDF, HTML, text files). Returns: {attachmentKey, filename, filePath, contentType, type, content, length, extractionMethod, extractedAt}",
        category: "fulltext",
        parameters: {
          attachmentKey: { type: "string", description: "Attachment key", required: true },
          format: { type: "string", enum: ["json", "text"], description: "Response format (default: json)", required: false }
        }
      },
      {
        name: "search_fulltext",
        description: "Search within fulltext content of items with context and relevance scoring",
        category: "fulltext",
        parameters: {
          q: { type: "string", description: "Search query", required: true },
          itemKeys: { type: "array", items: { type: "string" }, description: "Limit search to specific items (optional)", required: false },
          contextLength: { type: "number", description: "Context length around matches (default: 200)", required: false },
          maxResults: { type: "number", description: "Maximum results to return (default: 50)", required: false },
          caseSensitive: { type: "boolean", description: "Case sensitive search (default: false)", required: false }
        },
        examples: [
          { query: { q: "machine learning" }, description: "Search for 'machine learning' in all fulltext" },
          { query: { q: "neural networks", maxResults: 10, contextLength: 100 }, description: "Limited context search" }
        ]
      },
      {
        name: "get_item_abstract",
        description: "Get the abstract/summary of a specific item",
        category: "retrieval",
        parameters: {
          itemKey: { type: "string", description: "Item key", required: true },
          format: { type: "string", enum: ["json", "text"], description: "Response format (default: json)", required: false }
        }
      }
    ],
    endpoints: {
      mcp: {
        "/mcp": {
          method: "POST",
          description: "MCP protocol endpoint for AI clients",
          contentType: "application/json",
          protocol: "MCP 2024-11-05"
        }
      },
      rest: {
        "/ping": {
          method: "GET",
          description: "Health check endpoint",
          response: "text/plain"
        },
        "/mcp/status": {
          method: "GET", 
          description: "MCP server status and capabilities",
          response: "application/json"
        },
        "/capabilities": {
          method: "GET",
          description: "This endpoint - comprehensive API documentation",
          response: "application/json"
        },
        "/help": {
          method: "GET",
          description: "Alias for /capabilities",
          response: "application/json"
        },
        "/test/mcp": {
          method: "GET",
          description: "MCP integration testing endpoint",
          response: "application/json"
        }
      }
    },
    usage: {
      gettingStarted: {
        mcp: {
          description: "Connect via MCP protocol",
          steps: [
            "Configure MCP client to connect to this server",
            "Use streamable HTTP transport",
            "Send MCP requests to /mcp endpoint",
            "Available tools will be listed via tools/list method"
          ]
        },
        rest: {
          description: "Use REST API directly", 
          examples: [
            "GET /capabilities - Get this documentation",
            "GET /ping - Health check",
            "GET /mcp/status - Check MCP server status"
          ]
        }
      },
      authentication: "None required for local connections",
      rateLimit: "No rate limiting currently implemented",
      cors: "CORS headers not currently set"
    },
    timestamp: new Date().toISOString(),
    status: this.mcpServer ? "ready" : "mcp-disabled"
  };
}
}

export const httpServer = new HttpServer();
