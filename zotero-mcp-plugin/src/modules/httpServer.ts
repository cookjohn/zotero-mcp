import {
  handleSearch,
  handleGetCollections,
  handleSearchCollections,
  handleGetCollectionDetails,
  handleGetCollectionItems,
  handleGetPDFContent,
  handleAdvancedSearchTestEndpoint,
  handleSearchAnnotations,
  handleGetItemNotes,
  handleGetItemAnnotations,
  handleGetAnnotationById,
  handleGetAnnotationsBatch,
} from "./apiHandlers";
import { handleSearchTest } from "./searchTest";
import { testPDFExtraction } from "./apiTest";
import { handleAnnotationTestEndpoint } from "./annotationTestHandler";

declare let ztoolkit: ZToolkit;

export class HttpServer {
  public static testServer() {
    Zotero.debug("Static testServer method called.");
  }
  private serverSocket: any;
  private isRunning: boolean = false;

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
    } catch (e) {
      const errorMsg = `[HttpServer] Failed to start server on port ${port}: ${e}`;
      Zotero.debug(errorMsg);
      this.stop();
      throw new Error(errorMsg);
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
          const url = new URL(urlPath, "http://localhost");
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
          const collectionKeyMatch = path.match(/^\/collections\/([A-Z0-9]+)$/);
          const collectionItemsMatch = path.match(
            /^\/collections\/([A-Z0-9]+)\/items$/,
          );
          const pdfContentMatch = path.match(
            /^\/items\/([A-Z0-9]+)\/pdf-content$/,
          );
          const itemNotesMatch = path.match(/^\/items\/([A-Z0-9]+)\/notes$/);
          const itemAnnotationsMatch = path.match(
            /^\/items\/([A-Z0-9]+)\/annotations$/,
          );
          const annotationByIdMatch = path.match(/^\/annotations\/([A-Z0-9]+)$/);
          const annotationsBatchMatch = path.match(/^\/annotations\/batch$/);

          if (path === "/collections") {
            result = await handleGetCollections(query);
          } else if (pdfContentMatch) {
            const params = { 1: pdfContentMatch[1] };
            result = await handleGetPDFContent(params, query);
          } else if (path === "/collections/search") {
            result = await handleSearchCollections(query);
          } else if (collectionKeyMatch) {
            const params = { 1: collectionKeyMatch[1] };
            result = await handleGetCollectionDetails(params, query);
          } else if (collectionItemsMatch) {
            const params = { 1: collectionItemsMatch[1] };
            result = await handleGetCollectionItems(params, query);
          } else if (itemNotesMatch) {
            const params = { 1: itemNotesMatch[1] };
            result = await handleGetItemNotes(params, query);
          } else if (itemAnnotationsMatch) {
            const params = { 1: itemAnnotationsMatch[1] };
            result = await handleGetItemAnnotations(params, query);
          } else if (annotationByIdMatch && method === "GET") {
            const params = { 1: annotationByIdMatch[1] };
            result = await handleGetAnnotationById(params);
          } else if (annotationsBatchMatch && method === "POST") {
            result = await handleGetAnnotationsBatch(requestBody);
          } else if (path === "/annotations/search") {
            result = await handleSearchAnnotations(query);
          } else if (path.startsWith("/search")) {
            result = await handleSearch(query);
          } else if (path === "/test/advanced-search") {
            result = await handleAdvancedSearchTestEndpoint();
          } else if (path === "/test/annotations") {
            result = await handleAnnotationTestEndpoint();
          } else if (path.startsWith("/test")) {
            result = await handleSearchTest();
          } else if (path === "/api-test") {
            const report = await testPDFExtraction();
            result = {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "text/plain; charset=utf-8" },
              body: report,
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
}

export const httpServer = new HttpServer();
