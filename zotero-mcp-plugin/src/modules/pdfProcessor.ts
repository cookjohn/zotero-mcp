// This implementation is based strictly on the user-provided sample code.
declare const Zotero: any;
declare const IOUtils: any; // Trusting this is available in the execution context.
declare const ztoolkit: ZToolkit;

/**
 * PDF处理器服务
 * 提供PDF文件的直接处理功能
 */
export class PDFProcessor {
  private Zotero: any;
  private _worker: Worker | null = null;
  private _lastPromiseID = 0;
  private _waitingPromises: {
    [id: number]: {
      resolve: (value: any) => void;
      reject: (reason?: any) => void;
    };
  } = {};

  private _useDocumentWorker = false;

  /**
   * Number of font/CMap assets the worker asked for that could not be loaded.
   * Non-zero means the extracted text may be missing glyphs (typically CJK)
   * even though extraction "succeeded" (#116).
   */
  fontDataFetchFailures = 0;

  constructor(private readonly ztoolkit: any) {
    this.Zotero = ztoolkit.getGlobal("Zotero");
    // Zotero 10 replaced the pdf-worker with the unified document-worker:
    // new worker URL, 'pdf.'-prefixed actions, unified FetchData asset callback
    // (see WORKER_URL / getAssetURL in Zotero 10 pdfWorker/manager.js)
    const major = parseInt(String(this.Zotero.version || "").split(".")[0], 10) || 0;
    this._useDocumentWorker = major >= 10;
    this.ztoolkit.log(`[PDFProcessor] 初始化 (documentWorker=${this._useDocumentWorker})`);
  }

  private _init(): void {
    if (this._worker) return;
    // Zotero 7-9: chrome://zotero/content/xpcom/pdfWorker/worker.js
    // Zotero 10+: resource://zotero/document-worker/worker.js
    this._worker = new Worker(
      this._useDocumentWorker
        ? "resource://zotero/document-worker/worker.js"
        : "chrome://zotero/content/xpcom/pdfWorker/worker.js",
    );
    this._worker.addEventListener("message", async (event: MessageEvent) => {
      const message = event.data;

      if (message.responseID) {
        const { resolve, reject } = this._waitingPromises[message.responseID];
        delete this._waitingPromises[message.responseID];

        if (message.data) {
          const textContent =
            typeof message.data === "string" ? message.data : message.data.text;
          if (textContent !== undefined) {
            resolve({ text: textContent });
          } else {
            reject(new Error("PDF text extraction returned invalid format"));
          }
        } else {
          reject(
            new Error(JSON.stringify(message.error || "Unknown worker error")),
          );
        }
        return;
      }

      if (message.id) {
        let respData = null;
        try {
          if (message.action === "FetchData") {
            // Zotero 10+ unified asset callback. Mirrors getAssetURL() in the
            // shipped 10.0.x manager.js: cmaps/ and standard_fonts/ live under
            // reader/pdf/web/, everything else under document-worker/.
            // Response must be a raw Uint8Array (no {compressionType,cMapData} wrapper).
            const assetPath = String(message.data || "");
            const base =
              assetPath.startsWith("cmaps/") ||
              assetPath.startsWith("standard_fonts/")
                ? "resource://zotero/reader/pdf/web/"
                : "resource://zotero/document-worker/";
            const response = await this.Zotero.HTTP.request("GET", base + assetPath, {
              responseType: "arraybuffer",
            });
            respData = new Uint8Array(response.response);
          } else if (message.action === "FetchBuiltInCMap") {
            const response = await this.Zotero.HTTP.request(
              "GET",
              "resource://zotero/reader/pdf/web/cmaps/" +
                message.data +
                ".bcmap",
              { responseType: "arraybuffer" },
            );
            respData = {
              compressionType: 1,
              cMapData: new Uint8Array(response.response),
            };
          } else if (message.action === "FetchStandardFontData") {
            const response = await this.Zotero.HTTP.request(
              "GET",
              "resource://zotero/reader/pdf/web/standard_fonts/" + message.data,
              { responseType: "arraybuffer" },
            );
            respData = new Uint8Array(response.response);
          }
        } catch (e) {
          this.fontDataFetchFailures++;
          this.ztoolkit.log("Failed to fetch font data:", e, "error");
        }

        this._worker!.postMessage({ responseID: message.id, data: respData });
      }
    });

    this._worker.addEventListener("error", (error: any) => {
      this.ztoolkit.log("[PDFProcessor] Worker错误:", error, "error");
      // A worker that failed to load (e.g. dead URL) never answers any query;
      // reject pending promises now so callers get the real reason instead of
      // a misleading "timed out after 30000ms".
      const pending = this._waitingPromises;
      this._waitingPromises = {};
      for (const id of Object.keys(pending)) {
        pending[Number(id)].reject(
          new Error(
            `PDF worker error: ${error?.message || "failed to load worker script"}`,
          ),
        );
      }
    });
  }

  private static readonly PREF_TIMEOUT_SECONDS =
    "extensions.zotero.zotero-mcp-plugin.pdf.timeoutSeconds";

  private _getTimeoutMs(): number {
    try {
      const raw = this.Zotero.Prefs.get(PDFProcessor.PREF_TIMEOUT_SECONDS, true);
      const seconds = parseInt(String(raw), 10);
      if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    } catch {
      // fall through to default
    }
    return 120000; // default raised from 30s: large scanned books need longer
  }

  private async _query<T>(
    action: string,
    data: unknown,
    transfer?: ArrayBuffer[],
    timeoutMs?: number,
  ): Promise<T> {
    this._init();
    return new Promise<T>((resolve, reject) => {
      this._lastPromiseID++;
      const promiseID = this._lastPromiseID;

      // Set up timeout
      const effectiveTimeoutMs = timeoutMs ?? this._getTimeoutMs();
      const timeoutId = setTimeout(() => {
        if (this._waitingPromises[promiseID]) {
          delete this._waitingPromises[promiseID];
          reject(
            new Error(`PDF processing timed out after ${effectiveTimeoutMs}ms`),
          );
        }
      }, effectiveTimeoutMs);

      this._waitingPromises[promiseID] = {
        resolve: (value: T) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (reason?: any) => {
          clearTimeout(timeoutId);
          reject(reason);
        }
      };

      if (transfer) {
        this._worker!.postMessage(
          { id: promiseID, action, data },
          transfer,
        );
      } else {
        this._worker!.postMessage({ id: promiseID, action, data });
      }
    });
  }

  /**
   * 提取PDF文本内容
   * @param path PDF文件路径
   * @returns Promise<string> 提取的文本内容
   */
  async extractText(path: string): Promise<string> {
    try {
      this.ztoolkit.log("[PDFProcessor] 开始提取文本:", { path });

      // Using IOUtils.read directly as per the sample code.
      const fileData = await IOUtils.read(path);
      if (!fileData) {
        throw new Error("文件读取失败 (IOUtils.read returned falsy)");
      }

      this.ztoolkit.log(
        `[PDFProcessor] 文件读取成功: ${fileData.byteLength} bytes`,
      );

      const response = await this._query<{ text: string }>(
        this._useDocumentWorker ? "pdf.getFulltext" : "getFulltext",
        {
          buf: fileData.buffer, // The original code used .buffer
          maxPages: null,
          password: undefined,
        },
        [fileData.buffer],
      );

      if (!response?.text) {
        throw new Error("PDF text extraction returned empty result");
      }

      return response.text;
    } catch (error) {
      const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.ztoolkit.log(`[PDFProcessor] PDF文本提取失败: ${errMsg}`, "error");
      throw error;
    }
  }

  public terminate(): void {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}
