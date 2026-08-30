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

/** BBT 默认端口（Juris-M 为 24119） */
const BBT_DEFAULT_PORT = 23119;

/** 未知 BBT 版本时的占位符 */
const UNKNOWN = "unknown";

export class CitationExportService {
  /** BBT JSON-RPC 基地址 */
  private get bbtRpcUrl(): string {
    return `http://localhost:${BBT_DEFAULT_PORT}/better-bibtex/json-rpc`;
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
   * @param params.exportNotes 是否导出笔记（BBT displayOptions）
   * @param params.useJournalAbbreviation 是否使用期刊缩写（BBT displayOptions）
   */
  async exportBibliography(params: {
    itemKeys: string[];
    format?: string;
    libraryID?: number;
    exportNotes?: boolean;
    useJournalAbbreviation?: boolean;
  }): Promise<any> {
    const {
      itemKeys,
      format = "biblatex",
      libraryID,
      exportNotes = false,
      useJournalAbbreviation = false,
    } = params;

    if (!itemKeys || itemKeys.length === 0) {
      throw new Error("itemKeys 不能为空");
    }

    const normalizedFormat = (format || "biblatex").toLowerCase();
    const translator =
      BBT_TRANSLATORS[normalizedFormat] ?? BBT_TRANSLATORS.biblatex;

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
      // BBT item.export 可能不支持 displayOptions，作为独立提示
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
    // 1) 按 styleID 精确匹配
    try {
      const s = Zotero.Styles.get(style);
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
    libraryID?: number;
  }): Promise<any> {
    const {
      itemKeys,
      style,
      contentType = "html",
      mode = "bibliography",
      libraryID,
    } = params;

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
    for (const key of itemKeys) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(lib, key);
      if (item && !item.isAttachment() && !item.isNote()) {
        items.push(item);
      } else if (!item) {
        missing.push(key);
      }
    }

    if (items.length === 0) {
      throw new Error(
        `未找到可用条目。请确认 itemKey 正确。缺失: ${missing.join(", ")}`,
      );
    }

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
      format = `${mode}=${resolved.styleID}`;
      styleInfo = {
        id: resolved.styleID,
        title: resolved.title,
        isDefault: false,
        hasBibliography: resolved.hasBibliography,
      };
    } else {
      // 使用 Zotero 默认 Quick Copy 设置
      const defaultSetting =
        (Zotero.Prefs.get("export.quickCopy.setting") as string) || "";
      const prefix = defaultSetting.split("=")[0];

      if (
        defaultSetting &&
        (prefix === "bibliography" || prefix === "citation")
      ) {
        // 默认设置本身就是引文格式，按需调整前缀以匹配请求模式
        const styleIdPart = defaultSetting.substring(
          defaultSetting.indexOf("=") + 1,
        );
        format = `${mode}=${styleIdPart}`;
        styleInfo = { isDefault: true, id: styleIdPart };
      } else {
        // 默认设置非引文格式，回退到 APA
        const fallback = "http://www.zotero.org/styles/apa";
        format = `${mode}=${fallback}`;
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
          lib,
          asCitations,
        ),
      );
    } catch (e) {
      throw new Error(
        `生成引文失败: ${e instanceof Error ? e.message : String(e)}`,
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
    };
  }

  /**
   * 列出 Zotero 中可用的 CSL 引文样式。
   * @param filter 可选关键字过滤（按标题或 ID）
   */
  async listStyles(filter?: string): Promise<any> {
    // 确保样式 schema 已加载
    try {
      await Zotero.Schema.schemeUpdatePromise;
    } catch {
      // 忽略 schema 加载错误
    }

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

  // ============ sync-bib & cite Draft Methods ============

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Count BibTeX entries in exported text.
   */
  private countBibtexEntries(text: string): number {
    const matches = text.match(/@\w+\s*\{\s*[^,\s]+/g);
    return matches ? matches.length : 0;
  }

  /**
   * Get all top-level (or all) item keys from a Zotero library.
   */
  private async getAllItemKeys(
    libraryID: number,
    includeChildren: boolean = false,
  ): Promise<string[]> {
    const s = new Zotero.Search();
    (s as any).libraryID = libraryID;
    if (!includeChildren) {
      s.addCondition('noChildren', 'true');
    }
    const ids = await s.search();
    const items = await Zotero.Items.getAsync(ids);
    return items
      .filter((item: any) => !item.isAttachment() && !item.isNote())
      .map((item: any) => item.key);
  }

  /**
   * Find a single Zotero item by itemKey or search query.
   * When multiple items match the query, the first result is used
   * and a warning is logged.
   */
  private async findItemByKeyOrQuery(
    itemKey: string | undefined,
    query: string | undefined,
    libraryID: number,
  ): Promise<any> {
    if (itemKey) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        libraryID,
        itemKey,
      );
      if (!item) {
        throw new Error(`No item found with key: ${itemKey}`);
      }
      return item;
    }

    if (!query) {
      throw new Error('Either itemKey or query must be provided');
    }

    // Search by title and creators
    const s = new Zotero.Search();
    (s as any).libraryID = libraryID;
    s.addCondition('noChildren', 'true');
    const ids = await s.search();
    const items = await Zotero.Items.getAsync(ids);

    const lower = query.toLowerCase();
    const matches = items.filter((item: any) => {
      const title = (item.getField('title') || '').toLowerCase();
      const creatorParts = item
        .getCreators()
        .map((c: any) =>
          [c.lastName, c.firstName, c.name]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ')
        .toLowerCase();
      return title.includes(lower) || creatorParts.includes(lower);
    });

    if (matches.length === 0) {
      throw new Error(`No items found matching query: "${query}"`);
    }
    if (matches.length > 1) {
      ztoolkit.log(
        `[CitationExport] findItemByKeyOrQuery: ${matches.length} matches, using first: ${matches[0].key}`,
      );
    }
    return matches[0];
  }

  /**
   * 【功能 3】同步导出整个 Zotero 文献库到 .bib 文件。
   *
   * 导出所有顶级条目（或包含子条目）为 BibTeX/BibLaTeX 格式，
   * 并写入指定的 .bib 文件。类似于 OpenAI Codex zotero skill 的 sync-bib 命令。
   *
   * @param params.bibPath         目标 .bib 文件的绝对路径
   * @param params.format          导出格式：bibtex(默认) | biblatex | csljson | cslyaml
   * @param params.libraryID       可选库 ID
   * @param params.includeChildren 是否包含子条目（笔记、附件等）
   */
  async syncBibFile(params: {
    bibPath: string;
    format?: string;
    libraryID?: number;
    includeChildren?: boolean;
  }): Promise<any> {
    const {
      bibPath,
      format = 'bibtex',
      libraryID,
      includeChildren = false,
    } = params;

    const lib =
      libraryID !== undefined && libraryID !== null
        ? libraryID
        : Zotero.Libraries.userLibraryID;

    // 1) Get all item keys
    const itemKeys = await this.getAllItemKeys(lib, includeChildren);

    if (itemKeys.length === 0) {
      throw new Error('No items found in the library to export.');
    }

    // 2) Export via BBT
    const exportResult = await this.exportBibliography({
      itemKeys,
      format,
      libraryID: lib,
    });

    const content = exportResult.content || '';

    // 3) Write to file
    await IOUtils.writeUTF8(bibPath, content);

    const entryCount = this.countBibtexEntries(content);

    ztoolkit.log(
      `[CitationExport] syncBibFile: format=${format}, items=${itemKeys.length}, entries=${entryCount}, path=${bibPath}`,
    );

    return {
      path: bibPath,
      format,
      entries: entryCount,
      exportedCount: exportResult.exportedCount,
      missingKeys: exportResult.missingKeys,
    };
  }

  /**
   * 【功能 4】在草稿（LaTeX 或 Markdown）中插入引用，并同步 .bib 文件。
   *
   * 查找 Zotero 条目 → 导出为 BibTeX → 追加到 .bib 文件（若不存在） →
   * 在草稿中插入引用标记。类似于 OpenAI Codex zotero skill 的 cite 命令。
   *
   * @param params.itemKey      Zotero 条目 Key（与 query 二选一）
   * @param params.query       搜索关键词（与 itemKey 二选一）
   * @param params.bibPath     .bib 文件路径（默认 references.bib）
   * @param params.texPath     LaTeX 草稿路径（与 markdownPath 二选一）
   * @param params.markdownPath Markdown 草稿路径（与 texPath 二选一）
   * @param params.marker      若提供，将草稿中该标记替换为引用；否则在末尾追加
   * @param params.libraryID    可选库 ID
   */
  async citeInDraft(params: {
    itemKey?: string;
    query?: string;
    bibPath: string;
    texPath?: string;
    markdownPath?: string;
    marker?: string;
    libraryID?: number;
  }): Promise<any> {
    const {
      itemKey,
      query,
      bibPath,
      texPath,
      markdownPath,
      marker,
      libraryID,
    } = params;

    const lib =
      libraryID !== undefined && libraryID !== null
        ? libraryID
        : Zotero.Libraries.userLibraryID;

    // 1) Find item
    const item = await this.findItemByKeyOrQuery(itemKey, query, lib);
    const foundKey = item.key;
    if (!foundKey) {
      throw new Error('Matched Zotero item has no key');
    }
    const title = item.getField('title') || '';

    // 2) Export as BibTeX
    const exportResult = await this.exportBibliography({
      itemKeys: [foundKey],
      format: 'bibtex',
      libraryID: lib,
    });

    const bibtexContent = (exportResult.content || '').trim();
    const citekeys = exportResult.citationKeys || [];
    if (citekeys.length === 0) {
      throw new Error(
        'Could not extract a citation key from the BibTeX export.',
      );
    }
    const citekey = citekeys[0];

    // 3) Read existing .bib and check for duplicates
    let existingBib = '';
    try {
      if (await IOUtils.exists(bibPath)) {
        existingBib = await IOUtils.readUTF8(bibPath);
      }
    } catch {
      // file may not exist yet
    }

    const keyRegex = new RegExp(
      `@\\w+\\s*\\{\\s*${this.escapeRegex(citekey)}\\s*,`,
      'i',
    );
    const alreadyPresent = keyRegex.test(existingBib);
    let bibEntryAdded = false;

    if (!alreadyPresent) {
      const prefix =
        existingBib.trim().length > 0
          ? existingBib.replace(/\n+$/, '') + '\n\n'
          : '';
      await IOUtils.writeUTF8(bibPath, prefix + bibtexContent + '\n');
      bibEntryAdded = true;
    }

    // 4) Determine citation format
    const isLatex = !!texPath;
    const citation = isLatex
      ? `\\cite{${citekey}}`
      : `[@${citekey}]`;

    const draftPath = texPath || markdownPath;
    if (!draftPath) {
      throw new Error('Either texPath or markdownPath must be provided');
    }

    // 5) Read draft and insert citation
    let draftContent = '';
    try {
      if (await IOUtils.exists(draftPath)) {
        draftContent = await IOUtils.readUTF8(draftPath);
      }
    } catch {
      // file may not exist yet
    }

    if (marker) {
      if (!draftContent.includes(marker)) {
        throw new Error(`Marker "${marker}" not found in ${draftPath}`);
      }
      draftContent = draftContent.replace(marker, citation);
    } else {
      const suffix =
        draftContent.length === 0 || draftContent.endsWith('\n')
          ? ''
          : '\n';
      draftContent = draftContent + suffix + citation + '\n';
    }

    await IOUtils.writeUTF8(draftPath, draftContent);

    ztoolkit.log(
      `[CitationExport] citeInDraft: itemKey=${foundKey}, citekey=${citekey}, bibAdded=${bibEntryAdded}, draft=${draftPath}`,
    );

    return {
      item_key: foundKey,
      title,
      bibtex_key: citekey,
      bib_path: bibPath,
      bib_entry_added: bibEntryAdded,
      edited_file: draftPath,
      inserted: citation,
    };
  }
}
