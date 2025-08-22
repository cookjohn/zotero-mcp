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

  constructor(private readonly ztoolkit: any) {
    this.Zotero = ztoolkit.getGlobal("Zotero");
    this.ztoolkit.log("[PDFProcessor] 初始化");
  }

  private _init(): void {
    if (this._worker) return;
    // Using the exact path from the user's sample code.
    this._worker = new Worker(
      "chrome://zotero/content/xpcom/pdfWorker/worker.js",
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
          if (message.action === "FetchBuiltInCMap") {
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
          this.ztoolkit.log("Failed to fetch font data:", e, "error");
        }

        this._worker!.postMessage({ responseID: message.id, data: respData });
      }
    });

    this._worker.addEventListener("error", (error) => {
      this.ztoolkit.log("[PDFProcessor] Worker错误:", error, "error");
    });
  }

  private async _query<T>(
    action: string,
    data: unknown,
    transfer?: ArrayBuffer[],
  ): Promise<T> {
    this._init();
    return new Promise<T>((resolve, reject) => {
      this._lastPromiseID++;
      this._waitingPromises[this._lastPromiseID] = { resolve, reject };
      if (transfer) {
        this._worker!.postMessage(
          { id: this._lastPromiseID, action, data },
          transfer,
        );
      } else {
        this._worker!.postMessage({ id: this._lastPromiseID, action, data });
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
        "getFulltext",
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
      this.ztoolkit.log("[PDFProcessor] PDF文本提取失败:", error, "error");
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
