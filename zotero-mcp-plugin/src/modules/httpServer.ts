import { handleSearch } from './apiHandlers';
import { handleSearchTest } from './searchTest';

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
      Zotero.debug('[HttpServer] Server is already running.');
      return;
    }

    // 验证端口参数
    if (!port || isNaN(port) || port < 1 || port > 65535) {
      const errorMsg = `[HttpServer] Invalid port number: ${port}. Port must be between 1 and 65535.`;
      Zotero.debug(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      Zotero.debug(`[HttpServer] Attempting to start server on port ${port}...`);
      
      this.serverSocket = Cc['@mozilla.org/network/server-socket;1'].createInstance(
        Ci.nsIServerSocket
      );
      
      // init方法参数：端口，是否允许回环地址，backlog队列大小
      this.serverSocket.init(port, true, -1);
      this.serverSocket.asyncListen(this.listener);
      this.isRunning = true;
      
      Zotero.debug(`[HttpServer] Successfully started HTTP server on port ${port}`);
    } catch (e) {
      const errorMsg = `[HttpServer] Failed to start server on port ${port}: ${e}`;
      Zotero.debug(errorMsg);
      this.stop();
      throw new Error(errorMsg);
    }
  }

  public stop() {
    if (!this.isRunning || !this.serverSocket) {
      Zotero.debug('[HttpServer] Server is not running or socket is null, nothing to stop.');
      return;
    }
    try {
      this.serverSocket.close();
      this.isRunning = false;
      Zotero.debug('[HttpServer] HTTP server stopped successfully.');
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
        const converterStream = Cc['@mozilla.org/intl/converter-input-stream;1']
          .createInstance(Ci.nsIConverterInputStream);
        converterStream.init(input, 'UTF-8', 0, 0);
        
        sin = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(
          Ci.nsIScriptableInputStream
        );
        sin.init(input);

        // 改进请求读取逻辑 - 读取完整的HTTP请求
        let requestText = '';
        let totalBytesRead = 0;
        const maxRequestSize = 4096; // 增加最大请求大小
        
        try {
          // 尝试读取完整的HTTP请求直到遇到空行
          while (totalBytesRead < maxRequestSize) {
            const bytesToRead = Math.min(1024, maxRequestSize - totalBytesRead);
            if (input.available() === 0) {
              // 等待数据到达
              await new Promise(resolve => setTimeout(resolve, 10));
              if (input.available() === 0) {
                break; // 没有更多数据
              }
            }
            
            // 尝试使用UTF-8转换流读取
            let chunk = '';
            try {
              const str: {value?: string} = {};
              const bytesRead = converterStream.readString(bytesToRead, str);
              chunk = str.value || '';
              if (bytesRead === 0) break;
            } catch (converterError) {
              // 如果转换器失败，回退到原始方法
              ztoolkit.log(`[HttpServer] Converter failed, using fallback: ${converterError}`, "error");
              chunk = sin.read(bytesToRead);
              if (!chunk) break;
            }
            
            requestText += chunk;
            totalBytesRead += chunk.length;
            
            // 检查是否读取到完整的HTTP头部（以双CRLF结束）
            if (requestText.includes('\r\n\r\n')) {
              break;
            }
          }
        } catch (readError) {
          ztoolkit.log(`[HttpServer] Error reading request: ${readError}`, "error");
          requestText = requestText || "INVALID_REQUEST";
        }
        
        try {
          if (converterStream) converterStream.close();
        } catch (e) {
          ztoolkit.log(`[HttpServer] Error closing converter stream: ${e}`, "error");
        }
        
        if (sin) sin.close();

        const requestLine = requestText.split('\r\n')[0];
        ztoolkit.log(`[HttpServer] Received request: ${requestLine} (${requestText.length} bytes)`);
        
        // 验证请求格式
        if (!requestLine || !requestLine.includes('HTTP/')) {
          ztoolkit.log(`[HttpServer] Invalid request format: ${requestLine}`, "error");
          try {
            const errorResponse =
              'HTTP/1.1 400 Bad Request\r\n' +
              'Content-Type: text/plain; charset=utf-8\r\n' +
              'Content-Length: 11\r\n' +
              'Connection: close\r\n' +
              '\r\n' +
              'Bad Request';
            output.write(errorResponse, errorResponse.length);
          } catch (e) {
            ztoolkit.log(`[HttpServer] Error sending bad request response: ${e}`, "error");
          }
          return;
        }

        if (requestLine.startsWith('GET /search')) {
          ztoolkit.log(`[HttpServer] Processing search request: ${requestLine}`);
          
          try {
            const urlPath = requestLine.split(' ')[1];
            ztoolkit.log(`[HttpServer] Raw URL path: ${urlPath}`);
            
            // 正确处理UTF-8编码的URL
            const url = new URL(urlPath, 'http://localhost');
            ztoolkit.log(`[HttpServer] Parsed URL: ${url.toString()}`);
            ztoolkit.log(`[HttpServer] Search string: ${url.search}`);
            
            // 手动解码URL编码的参数以正确处理UTF-8
            const query = new URLSearchParams();
            if (url.search) {
              const searchParams = url.search.substring(1); // 移除 '?'
              const pairs = searchParams.split('&');
              for (const pair of pairs) {
                const [key, value] = pair.split('=');
                if (key && value !== undefined) {
                  try {
                    // 使用decodeURIComponent正确解码UTF-8
                    const decodedKey = decodeURIComponent(key);
                    const decodedValue = decodeURIComponent(value);
                    query.set(decodedKey, decodedValue);
                    ztoolkit.log(`[HttpServer] Decoded param: ${decodedKey} = ${decodedValue}`);
                  } catch (decodeError) {
                    ztoolkit.log(`[HttpServer] Error decoding param ${key}=${value}: ${decodeError}`, "error");
                    // 如果解码失败，使用原始值
                    query.set(key, value);
                  }
                }
              }
            }
            
            ztoolkit.log(`[HttpServer] Final query parameters: ${JSON.stringify(Object.fromEntries(query))}`);
            
            const result = await handleSearch(query);
            
            ztoolkit.log(`[HttpServer] handleSearch returned - Status: ${result.status}, Body length: ${(result.body || '').length}`);
            
            const body = result.body || '';

            try {
              // This is the robust XPCOM way to get the byte length of a UTF-8 string.
              // 1. Create an in-memory storage stream.
              const storageStream = Cc['@mozilla.org/storagestream;1'].createInstance(Ci.nsIStorageStream);
              storageStream.init(8192, 0xffffffff); // 8KB initial size, max size

              // 2. Create a converter that writes to the storage stream as UTF-8
              const storageConverter = Cc['@mozilla.org/intl/converter-output-stream;1']
                  .createInstance(Ci.nsIConverterOutputStream);
              (storageConverter as any).init(storageStream.getOutputStream(0), 'UTF-8', 0, 0x003F); // 0x003F is '?'

              // 3. Write the string body to the converter. It lands in storageStream as UTF-8 bytes.
              storageConverter.writeString(body);
              storageConverter.close(); // Finalize the conversion

              // 4. Now, the length of the storage stream is our correct Content-Length
              const byteLength = storageStream.length;

              // 5. Construct headers with the correct length
              const finalHeaders =
                `HTTP/1.1 ${result.status} ${result.statusText}\r\n` +
                `Content-Type: ${result.headers?.['Content-Type'] || 'application/json; charset=utf-8'}\r\n` +
                `Content-Length: ${byteLength}\r\n` +
                'Connection: close\r\n' +
                '\r\n';

              // 6. Write the final headers to the actual network socket
              output.write(finalHeaders, finalHeaders.length);

              // 7. Write the body from the storage stream to the network socket
              if (byteLength > 0) {
                  const inputStream = storageStream.newInputStream(0);
                  output.writeFrom(inputStream, byteLength);
              }
              
              ztoolkit.log(`[HttpServer] Search response sent successfully with correct Content-Length: ${byteLength}`);

            } catch (writeError) {
              ztoolkit.log(`[HttpServer] Error writing search response: ${writeError}`, "error");
            }
          } catch (searchError) {
            const error = searchError instanceof Error ? searchError : new Error(String(searchError));
            ztoolkit.log(`[HttpServer] Error in search handling: ${error.message}`, "error");
            ztoolkit.log(`[HttpServer] Error stack: ${error.stack}`, "error");
            
            try {
              const errorBody = JSON.stringify({ error: error.message, stack: error.stack });
              const errorResponse =
                `HTTP/1.1 500 Internal Server Error\r\n` +
                `Content-Type: application/json\r\n` +
                `Content-Length: ${errorBody.length}\r\n` +
                'Connection: close\r\n' +
                '\r\n' +
                errorBody;
              try {
                output.write(errorResponse, errorResponse.length);
                ztoolkit.log(`[HttpServer] Error response sent`);
              } catch (writeError) {
                ztoolkit.log(`[HttpServer] Error writing error response: ${writeError}`, "error");
              }
            } catch (responseError) {
              ztoolkit.log(`[HttpServer] Failed to send error response: ${responseError}`, "error");
            }
          }
        } else if (requestLine.startsWith('GET /test')) {
          // 执行搜索测试
          const result = await handleSearchTest();
          const body = result.body || '';
          const response =
            `HTTP/1.1 ${result.status} ${result.statusText}\r\n` +
            `Content-Type: ${result.headers?.['Content-Type'] || 'application/json'}\r\n` +
            `Content-Length: ${body.length}\r\n` +
            'Connection: close\r\n' +
            '\r\n' +
            body;
          output.write(response, response.length);
        } else if (requestLine.startsWith('GET /ping')) {
          ztoolkit.log(`[HttpServer] Processing ping request`);
          const response =
            'HTTP/1.1 200 OK\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 4\r\n' +
            'Connection: close\r\n' +
            '\r\n' +
            'pong';
          try {
            output.write(response, response.length);
            ztoolkit.log(`[HttpServer] Ping response sent`);
          } catch (writeError) {
            ztoolkit.log(`[HttpServer] Error writing ping response: ${writeError}`, "error");
          }
        } else {
          ztoolkit.log(`[HttpServer] Unknown request: ${requestLine}`);
          const response =
            'HTTP/1.1 404 Not Found\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 9\r\n' +
            'Connection: close\r\n' +
            '\r\n' +
            'Not Found';
          try {
            output.write(response, response.length);
            ztoolkit.log(`[HttpServer] 404 response sent`);
          } catch (writeError) {
            ztoolkit.log(`[HttpServer] Error writing 404 response: ${writeError}`, "error");
          }
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        ztoolkit.log(`[HttpServer] Error handling request: ${error.message}`, "error");
        ztoolkit.log(`[HttpServer] Error stack: ${error.stack}`, "error");
        try {
          if (!output) {
            output = transport.openOutputStream(0, 0, 0);
          }
          const errorResponse =
            'HTTP/1.1 500 Internal Server Error\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 21\r\n' +
            'Connection: close\r\n' +
            '\r\n' +
            'Internal Server Error';
          output.write(errorResponse, errorResponse.length);
          ztoolkit.log(`[HttpServer] Error response sent`);
        } catch (closeError) {
          ztoolkit.log(`[HttpServer] Error sending error response: ${closeError}`, "error");
        }
      } finally {
        // 确保资源清理
        try {
          if (output) {
            output.close();
            ztoolkit.log(`[HttpServer] Output stream closed`);
          }
        } catch (e) {
          ztoolkit.log(`[HttpServer] Error closing output stream: ${e}`, "error");
        }
        
        try {
          if (input) {
            input.close();
            ztoolkit.log(`[HttpServer] Input stream closed`);
          }
        } catch (e) {
          ztoolkit.log(`[HttpServer] Error closing input stream: ${e}`, "error");
        }
      }
    },
    onStopListening: () => {
      this.isRunning = false;
    },
  };
}

export const httpServer = new HttpServer();