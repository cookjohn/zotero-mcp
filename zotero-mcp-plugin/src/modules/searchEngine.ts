import { formatItem, formatItemBrief } from "./itemFormatter";

declare let ztoolkit: ZToolkit;

class MCPError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "MCPError";
  }
}

// 定义支持的搜索参数接口
interface SearchParams {
  q?: string;
  key?: string; // 新增 key 用于精确匹配
  title?: string;
  creator?: string;
  year?: string;
  tag?: string; // 向后兼容
  tags?: string | string[]; // 支持字符串或数组
  tagMode?: "any" | "all" | "none";
  tagMatch?: "exact" | "contains" | "startsWith";
  itemType?: string;
  doi?: string;
  isbn?: string;
  collection?: string;
  hasAttachment?: string;
  hasNote?: string;
  limit?: string;
  offset?: string;
  sort?: string;
  direction?: string;
  libraryID?: string; // 添加库ID参数
  includeAttachments?: string; // 是否包含附件
  includeNotes?: string; // 是否包含笔记

  // 全文搜索专用参数
  fulltext?: string; // 全文搜索内容
  fulltextMode?: "attachment" | "note" | "both"; // 全文搜索模式：仅附件、仅笔记、或两者
  fulltextOperator?: "contains" | "exact" | "regex"; // 全文搜索操作符

  // 高级搜索参数
  titleOperator?: "contains" | "exact" | "startsWith" | "endsWith" | "regex";
  creatorOperator?: "contains" | "exact" | "startsWith" | "endsWith";
  yearRange?: string; // 格式: "2020-2023" 或 "2020-" 或 "-2023"
  dateAdded?: string; // ISO日期字符串
  dateAddedRange?: string; // 格式: "2023-01-01,2023-12-31"
  dateModified?: string;
  dateModifiedRange?: string;
  publicationTitle?: string;
  publicationTitleOperator?: "contains" | "exact";
  abstractText?: string;
  abstractOperator?: "contains" | "regex";
  language?: string;
  rights?: string;
  url?: string;
  extra?: string;
  numPages?: string;
  numPagesRange?: string; // 格式: "100-500"

  // 布尔查询支持
  booleanQuery?: string; // 高级布尔查询字符串
  fieldQueries?: FieldQuery[]; // 结构化字段查询

  // 结果相关性和排序
  relevanceScoring?: "true" | "false";
  boostFields?: string; // 逗号分隔的字段列表，用于提升相关性权重

  // 保存的搜索
  savedSearchName?: string;
  saveSearch?: "true" | "false";
}

// 字段查询结构
interface FieldQuery {
  field: string;
  operator:
    | "contains"
    | "exact"
    | "startsWith"
    | "endsWith"
    | "regex"
    | "range"
    | "gt"
    | "lt"
    | "gte"
    | "lte";
  value: string;
  boost?: number; // 权重提升因子
}

// 相关性评分结果
interface ScoredItem {
  item: Zotero.Item;
  relevanceScore: number;
  matchedFields: string[];
}

// 定义支持的排序字段
const SUPPORTED_SORT_FIELDS = [
  "date",
  "title",
  "creator",
  "dateAdded",
  "dateModified",
  "relevance",
];

// 高级搜索辅助函数

/**
 * 解析日期范围字符串
 * @param rangeStr 格式: "2020-2023" 或 "2020-" 或 "-2023" 或 "2023-01-01,2023-12-31"
 * @returns {start: Date|null, end: Date|null}
 */
function parseDateRange(rangeStr: string): {
  start: Date | null;
  end: Date | null;
} {
  if (!rangeStr) return { start: null, end: null };

  // 处理逗号分隔的日期格式
  if (rangeStr.includes(",")) {
    const [startStr, endStr] = rangeStr.split(",").map((s) => s.trim());
    return {
      start: startStr ? new Date(startStr) : null,
      end: endStr ? new Date(endStr) : null,
    };
  }

  // 处理连字符分隔的年份格式
  if (rangeStr.includes("-")) {
    const parts = rangeStr.split("-");
    if (parts.length === 2) {
      const [startYear, endYear] = parts;
      return {
        start: startYear ? new Date(`${startYear}-01-01`) : null,
        end: endYear ? new Date(`${endYear}-12-31`) : null,
      };
    }
  }

  return { start: null, end: null };
}

/**
 * 解析数值范围字符串
 * @param rangeStr 格式: "100-500" 或 "100-" 或 "-500"
 * @returns {min: number|null, max: number|null}
 */
function parseNumberRange(rangeStr: string): {
  min: number | null;
  max: number | null;
} {
  if (!rangeStr) return { min: null, max: null };

  if (rangeStr.includes("-")) {
    const parts = rangeStr.split("-");
    if (parts.length === 2) {
      const [minStr, maxStr] = parts;
      return {
        min: minStr ? parseInt(minStr, 10) : null,
        max: maxStr ? parseInt(maxStr, 10) : null,
      };
    }
  }

  return { min: null, max: null };
}

/**
 * 检查字段值是否匹配操作符和查询值
 * @param fieldValue 字段值
 * @param operator 操作符
 * @param queryValue 查询值
 * @returns 是否匹配
 */
function matchesFieldQuery(
  fieldValue: any,
  operator: string,
  queryValue: string,
): boolean {
  if (!fieldValue && !queryValue) return true;
  if (!fieldValue || !queryValue) return false;

  const fieldStr = String(fieldValue).toLowerCase();
  const queryStr = queryValue.toLowerCase();

  switch (operator) {
    case "exact":
      return fieldStr === queryStr;
    case "contains":
      return fieldStr.includes(queryStr);
    case "startsWith":
      return fieldStr.startsWith(queryStr);
    case "endsWith":
      return fieldStr.endsWith(queryStr);
    case "regex":
      try {
        const regex = new RegExp(queryValue, "i");
        return regex.test(fieldStr);
      } catch {
        return false;
      }
    default:
      return fieldStr.includes(queryStr);
  }
}

/**
 * 计算项目的相关性评分
 * @param item Zotero项目
 * @param params 搜索参数
 * @returns 相关性评分和匹配字段
 */
function calculateRelevanceScore(
  item: Zotero.Item,
  params: SearchParams,
): { score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];
  const boostFields = params.boostFields?.split(",").map((f) => f.trim()) || [];

  // 基础字段权重
  const fieldWeights: Record<string, number> = {
    title: 3.0,
    creator: 2.0,
    abstractNote: 1.5,
    publicationTitle: 1.2,
    tags: 1.0,
    extra: 0.5,
  };

  // 应用提升权重
  boostFields.forEach((field) => {
    if (fieldWeights[field]) {
      fieldWeights[field] *= 2;
    }
  });

  // 检查各字段匹配情况
  if (params.q) {
    const query = params.q.toLowerCase();
    Object.entries(fieldWeights).forEach(([field, weight]) => {
      let fieldValue: string = "";

      if (field === "creator") {
        fieldValue = item
          .getCreators()
          .map((c) => `${c.firstName} ${c.lastName}`)
          .join(" ");
      } else if (field === "tags") {
        fieldValue = item
          .getTags()
          .map((t) => t.tag)
          .join(" ");
      } else {
        try {
          fieldValue = item.getField(field as any) || "";
        } catch {
          fieldValue = "";
        }
      }

      if (fieldValue.toLowerCase().includes(query)) {
        score += weight;
        matchedFields.push(field);
      }
    });
  }

  // 特定字段匹配加分
  if (
    params.title &&
    item.getField("title")?.toLowerCase().includes(params.title.toLowerCase())
  ) {
    score += fieldWeights.title || 3.0;
    if (!matchedFields.includes("title")) matchedFields.push("title");
  }

  if (params.creator) {
    const creators = item
      .getCreators()
      .map((c) => `${c.firstName} ${c.lastName}`.toLowerCase());
    if (creators.some((c) => c.includes(params.creator!.toLowerCase()))) {
      score += fieldWeights.creator || 2.0;
      if (!matchedFields.includes("creator")) matchedFields.push("creator");
    }
  }

  return { score, matchedFields };
}

/**
 * 执行全文搜索
 * @param query 搜索词
 * @param libraryID 库ID
 * @param mode 搜索模式
 * @param operator 操作符
 * @returns 匹配的项目ID列表
 */
async function performFulltextSearch(
  query: string,
  libraryID: number,
  mode: "attachment" | "note" | "both" = "both",
  operator: "contains" | "exact" | "regex" = "contains"
): Promise<{ itemIDs: number[], matchDetails: Map<number, any> }> {
  const matchDetails = new Map<number, any>();
  let itemIDs: number[] = [];

  try {
    if (mode === "attachment" || mode === "both") {
      // 使用Zotero.Search搜索附件全文
      const attachmentSearch = new Zotero.Search();
      (attachmentSearch as any).libraryID = libraryID;
      
      // 搜索附件内容
      const searchOperator = operator === "exact" ? "is" : "contains";
      attachmentSearch.addCondition("fulltextContent", searchOperator, query);
      attachmentSearch.addCondition("itemType", "is", "attachment");
      
      const attachmentIDs = await attachmentSearch.search();
      
      for (const attachmentID of attachmentIDs) {
        const attachment = Zotero.Items.get(attachmentID);
        if (attachment && attachment.isAttachment()) {
          const parentItem = attachment.parentItem;
          const targetID = parentItem ? parentItem.id : attachment.id;
          
          if (parentItem && !itemIDs.includes(parentItem.id)) {
            itemIDs.push(parentItem.id);
          } else if (!parentItem && !itemIDs.includes(attachment.id)) {
            itemIDs.push(attachment.id);
          }
          
          // 记录匹配详情
          if (!matchDetails.has(targetID)) {
            matchDetails.set(targetID, {
              attachments: [],
              notes: [],
              score: 0
            });
          }
          
          const details = matchDetails.get(targetID);
          
          // 尝试获取匹配片段
          let snippet = '';
          try {
            const content = await attachment.attachmentText || '';
            if (content) {
              const queryPos = content.toLowerCase().indexOf(query.toLowerCase());
              if (queryPos >= 0) {
                const start = Math.max(0, queryPos - 50);
                const end = Math.min(content.length, queryPos + query.length + 50);
                snippet = '...' + content.substring(start, end) + '...';
              }
            }
          } catch (e) {
            // 获取片段失败，使用空字符串
            snippet = '';
          }
          
          details.attachments.push({
            attachmentID: attachment.id,
            filename: attachment.attachmentFilename || '',
            snippet: snippet,
            score: 1
          });
          details.score += 1;
        }
      }
    }

    if (mode === "note" || mode === "both") {
      // 搜索笔记内容
      const s = new Zotero.Search();
      (s as any).libraryID = libraryID;
      s.addCondition("itemType", "is", "note");
      
      // 根据操作符设置搜索条件
      const searchOperator = operator === "exact" ? "is" : "contains";
      s.addCondition("note", searchOperator, query);
      
      const noteIDs = await s.search();
      
      for (const noteID of noteIDs) {
        const note = Zotero.Items.get(noteID);
        if (note && note.isNote()) {
          const parentItem = note.parentItem;
          if (parentItem && !itemIDs.includes(parentItem.id)) {
            itemIDs.push(parentItem.id);
          }
          
          const targetID = parentItem ? parentItem.id : note.id;
          if (!matchDetails.has(targetID)) {
            matchDetails.set(targetID, {
              attachments: [],
              notes: [],
              score: 0
            });
          }
          
          const details = matchDetails.get(targetID);
          const noteContent = note.getNote();
          let snippet = '';
          
          // 提取匹配片段
          if (noteContent) {
            const cleanContent = noteContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            const queryPos = cleanContent.toLowerCase().indexOf(query.toLowerCase());
            if (queryPos >= 0) {
              const start = Math.max(0, queryPos - 50);
              const end = Math.min(cleanContent.length, queryPos + query.length + 50);
              snippet = '...' + cleanContent.substring(start, end) + '...';
            }
          }
          
          details.notes.push({
            noteID: note.id,
            snippet: snippet,
            score: 1
          });
          details.score += 1;
        }
      }
    }

    return { itemIDs: [...new Set(itemIDs)], matchDetails };
  } catch (error) {
    ztoolkit.log(`[SearchEngine] Fulltext search error: ${error}`, "error");
    return { itemIDs: [], matchDetails };
  }
}

/**
 * 应用高级过滤条件到项目列表
 * @param items 项目列表
 * @param params 搜索参数
 * @returns 过滤后的项目列表
 */
function applyAdvancedFilters(
  items: Zotero.Item[],
  params: SearchParams,
): Zotero.Item[] {
  return items.filter((item) => {
    // 日期范围过滤
    if (params.yearRange) {
      const { start, end } = parseDateRange(params.yearRange);
      if (start || end) {
        const itemDate = item.getField("date");
        if (itemDate) {
          const year = parseInt(itemDate.toString().substring(0, 4), 10);
          if (start && year < start.getFullYear()) return false;
          if (end && year > end.getFullYear()) return false;
        }
      }
    }

    // 添加日期范围过滤
    if (params.dateAddedRange) {
      const { start, end } = parseDateRange(params.dateAddedRange);
      if (start || end) {
        const dateAdded = new Date(item.dateAdded);
        if (start && dateAdded < start) return false;
        if (end && dateAdded > end) return false;
      }
    }

    // 修改日期范围过滤
    if (params.dateModifiedRange) {
      const { start, end } = parseDateRange(params.dateModifiedRange);
      if (start || end) {
        const dateModified = new Date(item.dateModified);
        if (start && dateModified < start) return false;
        if (end && dateModified > end) return false;
      }
    }

    // 页数范围过滤
    if (params.numPagesRange) {
      const { min, max } = parseNumberRange(params.numPagesRange);
      if (min || max) {
        const numPages = parseInt(item.getField("numPages") || "0", 10);
        if (min && numPages < min) return false;
        if (max && numPages > max) return false;
      }
    }

    // 高级字段匹配
    if (params.titleOperator && params.title) {
      const title = item.getField("title") || "";
      if (!matchesFieldQuery(title, params.titleOperator, params.title)) {
        return false;
      }
    }

    if (params.creatorOperator && params.creator) {
      const creators = item
        .getCreators()
        .map((c) => `${c.firstName} ${c.lastName}`)
        .join(" ");
      if (
        !matchesFieldQuery(creators, params.creatorOperator, params.creator)
      ) {
        return false;
      }
    }

    if (params.abstractOperator && params.abstractText) {
      const abstract = item.getField("abstractNote") || "";
      if (
        !matchesFieldQuery(
          abstract,
          params.abstractOperator,
          params.abstractText,
        )
      ) {
        return false;
      }
    }

    if (params.publicationTitleOperator && params.publicationTitle) {
      const pubTitle = item.getField("publicationTitle") || "";
      if (
        !matchesFieldQuery(
          pubTitle,
          params.publicationTitleOperator,
          params.publicationTitle,
        )
      ) {
        return false;
      }
    }

    // 其他字段精确匹配
    const exactMatchFields = ["language", "rights", "url", "extra"];
    for (const field of exactMatchFields) {
      const paramValue = params[field as keyof SearchParams];
      if (paramValue && typeof paramValue === "string") {
        const fieldValue = item.getField(field as any) || "";
        if (!fieldValue.toLowerCase().includes(paramValue.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * 处理搜索引擎请求
 * @param params 搜索参数
 */
export async function handleSearchRequest(
  params: SearchParams,
): Promise<Record<string, any>> {
  Zotero.debug(
    `[MCP Search] Received search params: ${JSON.stringify(params)}`,
  );
  const startTime = Date.now();

  // --- 1. 参数处理和验证 ---
  const libraryID = params.libraryID
    ? parseInt(params.libraryID, 10)
    : Zotero.Libraries.userLibraryID;
  const limit = Math.min(parseInt(params.limit || "100", 10), 500);
  const offset = parseInt(params.offset || "0", 10);
  const sort = params.sort || "dateAdded";
  const direction = params.direction || "desc";

  if (!SUPPORTED_SORT_FIELDS.includes(sort)) {
    throw new MCPError(
      400,
      `Unsupported sort field: ${sort}. Supported fields are: ${SUPPORTED_SORT_FIELDS.join(", ")}`,
    );
  }
  if (!["asc", "desc"].includes(direction.toLowerCase())) {
    throw new MCPError(
      400,
      `Unsupported sort direction: ${direction}. Use 'asc' or 'desc'.`,
    );
  }

  // --- 2. 精确 Key 查找 (优先) ---
  if (params.key) {
    const item = await Zotero.Items.getByLibraryAndKeyAsync(
      libraryID,
      params.key,
    );
    return {
      query: params,
      pagination: { limit: 1, offset: 0, total: item ? 1 : 0, hasMore: false },
      searchTime: `${Date.now() - startTime}ms`,
      results: item ? [await formatItem(item)] : [],
    };
  }

  // --- 3. 处理全文搜索 (优先级高) ---
  let fulltextItemIDs: number[] = [];
  let fulltextMatchDetails = new Map<number, any>();

  if (params.fulltext) {
    const mode = params.fulltextMode || "both";
    const operator = params.fulltextOperator || "contains";
    const fulltextResult = await performFulltextSearch(params.fulltext, libraryID, mode, operator);
    fulltextItemIDs = fulltextResult.itemIDs;
    fulltextMatchDetails = fulltextResult.matchDetails;

    if (fulltextItemIDs.length === 0) {
      return {
        query: params,
        pagination: { limit, offset, total: 0, hasMore: false },
        searchTime: `${Date.now() - startTime}ms`,
        results: [],
        searchFeatures: ["fulltext"]
      };
    }
  }

  // --- 4. 构建 Zotero 搜索条件 (除标签外) ---
  const s = new Zotero.Search();
  (s as any).libraryID = libraryID;

  // 普通搜索条件
  if (params.q) {
    s.addCondition("quicksearch-everything", "contains", params.q);
  }

  const fieldMappings: { [key in keyof SearchParams]?: string } = {
    title: "title",
    creator: "creator",
    year: "date",
    itemType: "itemType",
    doi: "DOI",
    isbn: "ISBN",
  };

  // 向后兼容：如果提供了旧的 `tag` 参数且没有新的 `tags` 参数，则使用 Zotero 的原生标签搜索
  if (params.tag && !params.tags) {
    fieldMappings.tag = "tag";
  }

  for (const [paramKey, conditionKey] of Object.entries(fieldMappings)) {
    const value = params[paramKey as keyof SearchParams];
    if (value) {
      const operator = ["year", "itemType"].includes(paramKey)
        ? "is"
        : "contains";
      s.addCondition(conditionKey, operator, value as string);
    }
  }

  if (params.collection) {
    const collection = await Zotero.Collections.getByLibraryAndKeyAsync(
      libraryID,
      params.collection,
    );
    if (collection) {
      s.addCondition("collection", "is", collection.id);
    } else {
      return {
        // 无效 collection，返回空结果
        query: params,
        pagination: { limit, offset, total: 0, hasMore: false },
        searchTime: `${Date.now() - startTime}ms`,
        results: [],
      };
    }
  }

  if (params.hasAttachment)
    s.addCondition("attachment", "is", params.hasAttachment);
  if (params.hasNote) s.addCondition("note", "is", params.hasNote);
  if (params.includeAttachments !== "true")
    s.addCondition("itemType", "isNot", "attachment");
  if (params.includeNotes !== "true")
    s.addCondition("itemType", "isNot", "note");

  // --- 4. 执行初步搜索 ---
  let initialItemIDs: number[];
  
  if (params.fulltext && fulltextItemIDs.length > 0) {
    // 如果指定了全文搜索，使用全文搜索结果
    initialItemIDs = fulltextItemIDs;
  } else {
    // 否则执行常规搜索
    initialItemIDs = await s.search();
  }
  
  if (initialItemIDs.length === 0) {
    return {
      query: params,
      pagination: { limit, offset, total: 0, hasMore: false },
      searchTime: `${Date.now() - startTime}ms`,
      results: [],
    };
  }

  // --- 5. 高级标签过滤 (内存中处理) ---
  let items = await Zotero.Items.getAsync(initialItemIDs);
  const queryTags = Array.isArray(params.tags)
    ? params.tags
    : params.tags
      ? [params.tags]
      : [];
  const matchedTagsStats: Record<string, number> = {};

  if (queryTags.length > 0) {
    const tagMatch = params.tagMatch || "exact";
    const tagMode = params.tagMode || "any";

    const filteredItems: Zotero.Item[] = [];
    items.forEach((item) => {
      const itemTags = item.getTags().map((t) => t.tag);
      const matchedTags: string[] = [];

      for (const queryTag of queryTags) {
        const isMatch = itemTags.some((itemTag) => {
          switch (tagMatch) {
            case "contains":
              return itemTag.toLowerCase().includes(queryTag.toLowerCase());
            case "startsWith":
              return itemTag.toLowerCase().startsWith(queryTag.toLowerCase());
            case "exact":
            default:
              return itemTag.toLowerCase() === queryTag.toLowerCase();
          }
        });
        if (isMatch) {
          matchedTags.push(queryTag);
        }
      }

      const uniqueMatched = [...new Set(matchedTags)];
      let shouldInclude = false;
      switch (tagMode) {
        case "all":
          shouldInclude = uniqueMatched.length === queryTags.length;
          break;
        case "none":
          shouldInclude = uniqueMatched.length === 0;
          break;
        case "any":
        default:
          shouldInclude = uniqueMatched.length > 0;
          break;
      }

      if (shouldInclude) {
        (item as any).matchedTags = uniqueMatched; // 附加匹配的标签
        filteredItems.push(item);
        uniqueMatched.forEach((tag) => {
          matchedTagsStats[tag] = (matchedTagsStats[tag] || 0) + 1;
        });
      }
    });
    items = filteredItems;
  }

  // --- 5.5. 应用高级过滤条件 ---
  if (
    Object.keys(params).some((key) =>
      [
        "yearRange",
        "dateAddedRange",
        "dateModifiedRange",
        "numPagesRange",
        "titleOperator",
        "creatorOperator",
        "abstractOperator",
        "publicationTitleOperator",
        "language",
        "rights",
        "url",
        "extra",
      ].includes(key),
    )
  ) {
    items = applyAdvancedFilters(items, params);
  }

  // --- 6. 相关性评分和排序 ---
  const useRelevanceScoring =
    params.relevanceScoring === "true" || sort === "relevance";
  let scoredItems: ScoredItem[] = [];

  if (useRelevanceScoring) {
    scoredItems = items.map((item) => {
      const { score, matchedFields } = calculateRelevanceScore(item, params);
      return {
        item,
        relevanceScore: score,
        matchedFields,
      };
    });

    if (sort === "relevance") {
      // 按相关性排序
      scoredItems.sort((a, b) => {
        const scoreA = a.relevanceScore;
        const scoreB = b.relevanceScore;
        return direction === "asc" ? scoreA - scoreB : scoreB - scoreA;
      });
      items = scoredItems.map((si) => si.item);
    } else {
      // 非相关性排序，但保留评分信息
      items.sort((a, b) => {
        let valA: any, valB: any;
        if (sort === "creator") {
          valA = a
            .getCreators()
            .map((c) => c.lastName)
            .join(", ");
          valB = b
            .getCreators()
            .map((c) => c.lastName)
            .join(", ");
        } else {
          valA = a.getField(sort as any) || "";
          valB = b.getField(sort as any) || "";
        }
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }
  } else {
    // 传统排序
    items.sort((a, b) => {
      let valA: any, valB: any;
      if (sort === "creator") {
        valA = a
          .getCreators()
          .map((c) => c.lastName)
          .join(", ");
        valB = b
          .getCreators()
          .map((c) => c.lastName)
          .join(", ");
      } else {
        valA = a.getField(sort as any) || "";
        valB = b.getField(sort as any) || "";
      }
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  // --- 7. 分页和格式化 ---
  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);
  const results = paginatedItems.map((item) => {
    const formatted = formatItemBrief(item);

    // 添加附件路径信息
    try {
      const attachmentIDs = item.getAttachments();
      if (attachmentIDs && attachmentIDs.length > 0) {
        formatted.attachments = attachmentIDs.map((id: number) => {
          const attachment = Zotero.Items.get(id);
          if (attachment && attachment.isAttachment()) {
            return {
              key: attachment.key,
              filename: attachment.attachmentFilename || '',
              filePath: attachment.getFilePath() || '',
              contentType: attachment.attachmentContentType || '',
              linkMode: attachment.attachmentLinkMode
            };
          }
          return null;
        }).filter((att: any) => att !== null);
      } else {
        formatted.attachments = [];
      }
    } catch (error) {
      ztoolkit.log(`[SearchEngine] Error getting attachments for item ${item.key}: ${error}`, "warn");
      formatted.attachments = [];
    }

    // 添加标签匹配信息
    if ((item as any).matchedTags) {
      formatted.matchedTags = (item as any).matchedTags;
    }

    // 添加相关性评分信息
    if (useRelevanceScoring) {
      const scoredItem = scoredItems.find((si) => si.item.id === item.id);
      if (scoredItem) {
        formatted.relevanceScore = scoredItem.relevanceScore;
        formatted.matchedFields = scoredItem.matchedFields;
      }
    }

    // 添加全文搜索匹配详情
    if (params.fulltext && fulltextMatchDetails.has(item.id)) {
      const matchDetails = fulltextMatchDetails.get(item.id);
      formatted.fulltextMatch = {
        query: params.fulltext,
        mode: params.fulltextMode || "both",
        attachments: matchDetails.attachments || [],
        notes: matchDetails.notes || [],
        totalScore: matchDetails.score || 0
      };
    }

    return formatted;
  });

  // --- 8. 返回最终结果 ---
  const response: Record<string, any> = {
    query: params,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
    searchTime: `${Date.now() - startTime}ms`,
    results,
  };

  // 添加标签统计信息
  if (Object.keys(matchedTagsStats).length > 0) {
    response.matchedTags = matchedTagsStats;
  }

  // 添加高级搜索统计信息
  if (useRelevanceScoring) {
    response.relevanceStats = {
      averageScore:
        scoredItems.length > 0
          ? scoredItems.reduce((sum, item) => sum + item.relevanceScore, 0) /
            scoredItems.length
          : 0,
      maxScore:
        scoredItems.length > 0
          ? Math.max(...scoredItems.map((item) => item.relevanceScore))
          : 0,
      minScore:
        scoredItems.length > 0
          ? Math.min(...scoredItems.map((item) => item.relevanceScore))
          : 0,
    };
  }

  // 添加搜索类型信息
  const searchFeatures: string[] = [];
  if (params.q) searchFeatures.push("fulltext");
  if (queryTags.length > 0) searchFeatures.push("tags");
  if (params.yearRange) searchFeatures.push("dateRange");
  if (
    params.titleOperator ||
    params.creatorOperator ||
    params.abstractOperator
  ) {
    searchFeatures.push("advancedOperators");
  }
  if (useRelevanceScoring) searchFeatures.push("relevanceScoring");

  response.searchFeatures = searchFeatures;
  response.version = "2.0"; // 标记为增强版搜索引擎

  return response;
}
