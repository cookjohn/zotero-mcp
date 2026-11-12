/**
 * Citation & Bibliography Export Service
 *
 * 提供两个核心能力：
 *  1. 基于 zotero-better-bibtex (BBT) 的 BibLaTeX/BibTeX 条目导出
 *     —— 通过 BBT 内嵌 webserver 的 JSON-RPC API (http://localhost:23119/better-bibtex/json-rpc)
 *  2. 指定 CSL 样式的参考文献条目生成（未指定样式时回退到 Zotero 默认 Quick Copy 样式）
 *     —— 通过 Zotero 原生 Zotero.QuickCopy API
 *
 * BBT JSON-RPC 关键方法（参见 https://retorque.re/zotero-better-bibtex/exporting/json-rpc/）：
 *   - api.ready()                       检测 BBT 是否可用
 *   - item.citationkey(item_keys)       由 itemKey 解析 citation key
 *   - item.export(citekeys, translator) 按 BBT 翻译器导出条目字符串
 *   - item.bibliography(citekeys, fmt)  按 CSL 样式生成参考文献
 *
 * Zotero 原生引文 API（参见 https://www.zotero.org/support/dev/client_coding/javascript_api）：
 *   - Zotero.QuickCopy.getContentFromItems(items, format, library, asCitations)
 *   - Zotero.Styles.getVisible() / Zotero.Styles.get(styleID)
 */

declare let ztoolkit: ZToolkit;
declare const IOUtils: any;

/** BBT 导出格式 -> 翻译器名称映射 */
const BBT_TRANSLATORS: Record<string, string> = {
  biblatex: "Better BibLaTeX",
  bibtex: "Better BibTeX",
  csljson: "Better CSL JSON",
  json: "Better CSL JSON",
  cslyaml: "Better CSL YAML",
  yaml: "Better CSL YAML",
  yml: "Better CSL YAML",
};

/** Zotero 连接器服务器默认端口（BBT 的 JSON-RPC 挂在其上；Juris-M 为 24119） */
const BBT_DEFAULT_PORT = 23119;

/** 未知 BBT 版本时的占位符 */
const UNKNOWN = "unknown";

export class CitationExportService {
  /** BBT JSON-RPC 基地址 */
  private get bbtRpcUrl(): string {
    // BBT is served by Zotero's own connector server, whose port is
    // configurable (extensions.zotero.httpServer.port).
    const configured = Number(Zotero.Prefs.get("httpServer.port"));
    const port =
      Number.isInteger(configured) && configured > 0
        ? configured
        : BBT_DEFAULT_PORT;
    return `http://127.0.0.1:${port}/better-bibtex/json-rpc`;
  }

  /**
   * Normalize an MCP-supplied libraryID the same way the REST handlers do
   * (apiHandlers.resolveLibraryID): omitted / empty / 0 mean the user
   * library, anything that is not an integer is rejected instead of being
   * silently treated as the user library.
   */
  private normalizeLibraryID(raw: unknown): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === "string" && !raw.trim()) return undefined;
    const libraryID = Number(raw);
    if (!Number.isInteger(libraryID)) {
      throw new Error("Invalid libraryID: must be an integer");
    }
    return libraryID === 0 ? undefined : libraryID;
  }

  /**
   * Zotero.Styles.get()/getVisible() throw "Styles not yet loaded" until
   * Zotero.Styles.init() has run.
   */
  private async ensureStylesLoaded(): Promise<void> {
    const styles = Zotero.Styles as any;
    if (typeof styles.initialized === "function" && !styles.initialized()) {
      await styles.init();
    }
  }

  /**
   * 调用 BBT JSON-RPC 方法。
   * @param method JSON-RPC 方法名
   * @param params 位置参数数组
   * @returns result 字段
   */
  private async bbtRpc(method: string, params: any[] = []): Promise<any> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: `mcp-${Date.now()}`,
    });

    let response: any;
    try {
      response = await Zotero.HTTP.request("POST", this.bbtRpcUrl, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Zotero blocks browser-like requests to its embedded webserver.
          // This header signals a programmatic request and is the officially
          // recommended workaround (see BBT issue #3554).
          "Zotero-Allowed-Request": "1",
        },
        body,
        timeout: 30000,
        responseType: "json",
      });
    } catch (e) {
      throw new Error(
        `无法连接 Better BibTeX JSON-RPC 服务 (${this.bbtRpcUrl})。请确认已安装并启用 zotero-better-bibtex 插件，且 Zotero 正在运行。原始错误: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (response.status >= 400) {
      throw new Error(`Better BibTeX JSON-RPC 返回 HTTP ${response.status}`);
    }

    const data: any =
      response.response ?? JSON.parse(response.responseText ?? "{}");
    if (data.error) {
      throw new Error(
        `Better BibTeX JSON-RPC 错误: ${data.error.message ?? JSON.stringify(data.error)}`,
      );
    }
    return data.result;
  }

  /**
   * 检测 Better BibTeX 是否安装且 JSON-RPC 可用。
   */
  async checkBBT(): Promise<{
    available: boolean;
    betterbibtexVersion?: string;
    zoteroVersion?: string;
    error?: string;
  }> {
    try {
      const result = await this.bbtRpc("api.ready", []);
      return {
        available: true,
        betterbibtexVersion: result?.betterbibtex ?? UNKNOWN,
        zoteroVersion: result?.zotero ?? UNKNOWN,
      };
    } catch (e) {
      return {
        available: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * 将 Zotero itemKey 解析为 BBT citation key。
   * @param itemKeys 条目 key 数组（如 ["ABCD1234"]）
   * @param libraryID 可选库 ID；省略时表示用户个人库
   */
  async resolveCitekeys(
    itemKeys: string[],
    libraryID?: number,
  ): Promise<{
    citekeys: string[];
    map: Record<string, string>;
    missing: string[];
  }> {
    // BBT 的 item.citationkey 接受 [libraryID]:[itemKey] 形式的字符串
    const keyStrings = itemKeys.map((k) =>
      libraryID !== undefined && libraryID !== null ? `${libraryID}:${k}` : k,
    );

    const result = (await this.bbtRpc("item.citationkey", [keyStrings])) ?? {};

    const map: Record<string, string> = {};
    const citekeys: string[] = [];
    const missing: string[] = [];

    for (let i = 0; i < itemKeys.length; i++) {
      const itemKey = itemKeys[i];
      const lookupKey = keyStrings[i];
      const citekey = result[lookupKey] ?? result[itemKey];
      if (citekey) {
        map[itemKey] = citekey;
        citekeys.push(citekey);
      } else {
        missing.push(itemKey);
      }
    }

    return { citekeys, map, missing };
  }

  /**
   * 【功能 1】通过 Better BibTeX 导出参考文献条目（BibLaTeX / BibTeX / CSL-JSON / CSL-YAML）。
   *
   * @param params.itemKeys 要导出的条目 key 数组
   * @param params.format   导出格式：biblatex(默认) | bibtex | csljson | cslyaml
   * @param params.libraryID 可选库 ID
   */
  async exportBibliography(params: {
    itemKeys: string[];
    format?: string;
    libraryID?: number | string;
  }): Promise<any> {
    const { itemKeys, format = "biblatex" } = params;
    const libraryID = this.normalizeLibraryID(params.libraryID);

    if (!itemKeys || itemKeys.length === 0) {
      throw new Error("itemKeys 不能为空");
    }

    const normalizedFormat = (format || "biblatex").toLowerCase();
    const translator = BBT_TRANSLATORS[normalizedFormat];
    if (!translator) {
      throw new Error(
        `Unsupported format "${format}". Use one of: biblatex, bibtex, csljson, cslyaml.`,
      );
    }

    // 1) 先校验 BBT 可用性，给出友好错误
    const bbtStatus = await this.checkBBT();
    if (!bbtStatus.available) {
      throw new Error(
        `导出 ${normalizedFormat} 需要 Better BibTeX 插件支持，但当前不可用：${bbtStatus.error ?? "未知原因"}`,
      );
    }

    // 2) 解析 citation key
    const { citekeys, missing } = await this.resolveCitekeys(
      itemKeys,
      libraryID,
    );
    if (citekeys.length === 0) {
      throw new Error(
        `未能为给定条目解析出任何 citation key。请确认条目存在且 Better BibTeX 已为其生成引用键。缺失: ${missing.join(", ")}`,
      );
    }

    // 3) 调用 item.export 导出
    //    item.export(citekeys, translator, libraryID?)
    const rpcParams: any[] = [citekeys, translator];
    if (libraryID !== undefined && libraryID !== null) {
      rpcParams.push(libraryID);
    }

    let exportString: string;
    try {
      exportString = await this.bbtRpc("item.export", rpcParams);
    } catch (e) {
      throw new Error(
        `调用 BBT item.export 失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    ztoolkit.log(
      `[CitationExport] exportBibliography: format=${normalizedFormat}, translator=${translator}, exported=${citekeys.length}, missing=${missing.length}`,
    );

    return {
      format: normalizedFormat,
      content: exportString,
      exportedCount: citekeys.length,
      citationKeys: citekeys,
      missingKeys: missing.length > 0 ? missing : undefined,
    };
  }

  /**
   * 解析 CSL 样式：先按 styleID 精确匹配，再按标题精确/模糊匹配。
   * @returns 命中的样式对象，或 null
   */
  private resolveStyle(style: string): {
    styleID: string;
    title: string;
    hasBibliography: boolean;
  } | null {
    // 1) 按 styleID 精确匹配；短名（如 "apa"、"ieee"）补全为
    //    http://www.zotero.org/styles/<短名>，Zotero.Styles.get 不会自动补全
    const candidates = style.includes("://")
      ? [style]
      : [style, `http://www.zotero.org/styles/${style.trim().toLowerCase()}`];
    for (const candidate of candidates) {
      try {
        const s = Zotero.Styles.get(candidate);
        if (s) {
          return {
            styleID: s.styleID,
            title: s.title,
            hasBibliography: s.hasBibliography,
          };
        }
      } catch {
        // 忽略，继续按标题匹配
      }
    }

    // 2) 按标题精确匹配（大小写不敏感）
    const styles = Zotero.Styles.getVisible();
    const lower = style.toLowerCase();
    for (const s of styles) {
      if (s.title.toLowerCase() === lower) {
        return {
          styleID: s.styleID,
          title: s.title,
          hasBibliography: s.hasBibliography,
        };
      }
    }

    // 3) 按标题模糊匹配
    for (const s of styles) {
      if (s.title.toLowerCase().includes(lower)) {
        return {
          styleID: s.styleID,
          title: s.title,
          hasBibliography: s.hasBibliography,
        };
      }
    }
    return null;
  }

  /**
   * 【功能 2】生成指定 CSL 样式的参考文献条目。
   * 若未指定 style，则使用 Zotero 默认 Quick Copy 样式。
   *
   * @param params.itemKeys    条目 key 数组
   * @param params.style       可选 CSL 样式 ID 或标题（如 "apa"、"http://www.zotero.org/styles/apa"）
   * @param params.contentType 输出格式：html(默认) | text
   * @param params.mode        生成模式：bibliography(默认，参考文献条目) | citation(文内引用)
   * @param params.libraryID   可选库 ID
   */
  async getCitation(params: {
    itemKeys: string[];
    style?: string;
    contentType?: "html" | "text";
    mode?: "bibliography" | "citation";
    libraryID?: number | string;
  }): Promise<any> {
    const {
      itemKeys,
      style,
      contentType = "html",
      mode = "bibliography",
    } = params;
    const libraryID = this.normalizeLibraryID(params.libraryID);

    if (!itemKeys || itemKeys.length === 0) {
      throw new Error("itemKeys 不能为空");
    }

    // 1) 解析条目对象
    const lib =
      libraryID !== undefined && libraryID !== null
        ? libraryID
        : Zotero.Libraries.userLibraryID;

    const items: Zotero.Item[] = [];
    const missing: string[] = [];
    // Attachments and notes have no citation of their own.
    const skipped: string[] = [];
    for (const key of itemKeys) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(lib, key);
      if (!item) {
        missing.push(key);
      } else if (item.isAttachment() || item.isNote()) {
        skipped.push(key);
      } else {
        items.push(item);
      }
    }

    if (items.length === 0) {
      throw new Error(
        `未找到可用条目。请确认 itemKey 正确。缺失: ${missing.join(", ") || "无"}；` +
          `附件/笔记（无法生成引文）: ${skipped.join(", ") || "无"}`,
      );
    }

    await this.ensureStylesLoaded();

    // 2) 确定格式字符串与样式信息
    let format: string;
    let styleInfo: {
      id?: string;
      title?: string;
      isDefault: boolean;
      hasBibliography?: boolean;
    };

    if (style) {
      const resolved = this.resolveStyle(style);
      if (!resolved) {
        throw new Error(
          `未找到引文样式 "${style}"。请使用 list_citation_styles 查看可用样式。`,
        );
      }
      format = `bibliography=${resolved.styleID}`;
      styleInfo = {
        id: resolved.styleID,
        title: resolved.title,
        isDefault: false,
        hasBibliography: resolved.hasBibliography,
      };
    } else {
      // 使用 Zotero 默认 Quick Copy 设置。通过 Zotero 自己的解析器处理
      // bibliography/html=STYLE 等合法格式。
      const defaultSetting =
        (Zotero.Prefs.get("export.quickCopy.setting") as string) || "";
      const parsedSetting = (Zotero.QuickCopy as any).unserializeSetting(
        defaultSetting,
      );

      if (parsedSetting?.mode === "bibliography" && parsedSetting?.id) {
        const styleIdPart = parsedSetting.id;
        format = `bibliography=${styleIdPart}`;
        styleInfo = { isDefault: true, id: styleIdPart };
      } else {
        // 默认设置非引文格式，回退到 APA
        const fallback = "http://www.zotero.org/styles/apa";
        format = `bibliography=${fallback}`;
        styleInfo = { isDefault: true, id: fallback, title: "APA (fallback)" };
      }
    }

    // 3) 调用 QuickCopy 生成
    const asCitations = mode === "citation";
    let result: any;
    try {
      // getContentFromItems 在 Zotero 7 中为同步调用，包裹 Promise.resolve 以兼容可能的异步实现
      result = await Promise.resolve(
        (Zotero.QuickCopy as any).getContentFromItems(
          items,
          format,
          undefined,
          asCitations,
        ),
      );
    } catch (e) {
      throw new Error(
        `生成引文失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (result === false) {
      // QuickCopy refuses batches above export.quickCopy.dragLimit and
      // returns false instead of throwing.
      const limit = Zotero.Prefs.get("export.quickCopy.dragLimit");
      throw new Error(
        `一次最多可为 ${limit} 个条目生成引文（Zotero export.quickCopy.dragLimit），当前 ${items.length} 个，请分批调用。`,
      );
    }

    const html = result?.html ?? "";
    const text = result?.text ?? "";

    ztoolkit.log(
      `[CitationExport] getCitation: mode=${mode}, style=${styleInfo.id ?? "default"}, items=${items.length}, missing=${missing.length}`,
    );

    return {
      mode,
      style: styleInfo.id ?? undefined,
      styleTitle: styleInfo.title ?? undefined,
      content: contentType === "text" ? text : html,
      itemCount: items.length,
      missingKeys: missing.length > 0 ? missing : undefined,
      skippedKeys: skipped.length > 0 ? skipped : undefined,
    };
  }

  /**
   * 列出 Zotero 中可用的 CSL 引文样式。
   * @param filter 可选关键字过滤（按标题或 ID）
   */
  async listStyles(filter?: string): Promise<any> {
    await this.ensureStylesLoaded();

    const styles = Zotero.Styles.getVisible();
    let mapped = styles.map((s: any) => ({
      id: s.styleID,
      title: s.title,
    }));

    if (filter) {
      const f = filter.toLowerCase();
      mapped = mapped.filter(
        (s: any) =>
          s.title.toLowerCase().includes(f) || s.id.toLowerCase().includes(f),
      );
    }

    return {
      total: mapped.length,
      styles: mapped,
    };
  }
}
