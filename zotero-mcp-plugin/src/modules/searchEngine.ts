import { formatItem, formatItemBrief } from './itemFormatter';

declare let ztoolkit: ZToolkit;

class MCPError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'MCPError';
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
  tagMode?: 'any' | 'all' | 'none';
  tagMatch?: 'exact' | 'contains' | 'startsWith';
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
  libraryID?: string;  // 添加库ID参数
  includeAttachments?: string;  // 是否包含附件
  includeNotes?: string;  // 是否包含笔记
}

// 定义支持的排序字段
const SUPPORTED_SORT_FIELDS = ['date', 'title', 'creator', 'dateAdded', 'dateModified'];

/**
 * 处理搜索引擎请求
 * @param params 搜索参数
 */
export async function handleSearchRequest(params: SearchParams): Promise<Record<string, any>> {
  Zotero.debug(`[MCP Search] Received search params: ${JSON.stringify(params)}`);
  const startTime = Date.now();

  // --- 1. 参数处理和验证 ---
  const libraryID = params.libraryID ? parseInt(params.libraryID, 10) : Zotero.Libraries.userLibraryID;
  const limit = Math.min(parseInt(params.limit || '100', 10), 500);
  const offset = parseInt(params.offset || '0', 10);
  const sort = params.sort || 'dateAdded';
  const direction = params.direction || 'desc';

  if (!SUPPORTED_SORT_FIELDS.includes(sort)) {
    throw new MCPError(400, `Unsupported sort field: ${sort}. Supported fields are: ${SUPPORTED_SORT_FIELDS.join(', ')}`);
  }
  if (!['asc', 'desc'].includes(direction.toLowerCase())) {
    throw new MCPError(400, `Unsupported sort direction: ${direction}. Use 'asc' or 'desc'.`);
  }

  // --- 2. 精确 Key 查找 (优先) ---
  if (params.key) {
    const item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, params.key);
    return {
      query: params,
      pagination: { limit: 1, offset: 0, total: item ? 1 : 0, hasMore: false },
      searchTime: `${Date.now() - startTime}ms`,
      results: item ? [formatItem(item)] : [],
    };
  }

  // --- 3. 构建 Zotero 搜索条件 (除标签外) ---
  const s = new Zotero.Search();
  (s as any).libraryID = libraryID;

  if (params.q) s.addCondition('quicksearch-everything', 'contains', params.q);

  const fieldMappings: { [key in keyof SearchParams]?: string } = {
    title: 'title', creator: 'creator', year: 'date',
    itemType: 'itemType', doi: 'DOI', isbn: 'ISBN',
  };

  // 向后兼容：如果提供了旧的 `tag` 参数且没有新的 `tags` 参数，则使用 Zotero 的原生标签搜索
  if (params.tag && !params.tags) {
    fieldMappings.tag = 'tag';
  }

  for (const [paramKey, conditionKey] of Object.entries(fieldMappings)) {
    const value = params[paramKey as keyof SearchParams];
    if (value) {
      const operator = ['year', 'itemType'].includes(paramKey) ? 'is' : 'contains';
      s.addCondition(conditionKey, operator, value as string);
    }
  }

  if (params.collection) {
    const collection = await Zotero.Collections.getByLibraryAndKeyAsync(libraryID, params.collection);
    if (collection) {
      s.addCondition('collection', 'is', collection.id);
    } else {
      return { // 无效 collection，返回空结果
        query: params, pagination: { limit, offset, total: 0, hasMore: false },
        searchTime: `${Date.now() - startTime}ms`, results: [],
      };
    }
  }

  if (params.hasAttachment) s.addCondition('attachment', 'is', params.hasAttachment);
  if (params.hasNote) s.addCondition('note', 'is', params.hasNote);
  if (params.includeAttachments !== 'true') s.addCondition('itemType', 'isNot', 'attachment');
  if (params.includeNotes !== 'true') s.addCondition('itemType', 'isNot', 'note');

  // --- 4. 执行初步搜索 ---
  const initialItemIDs = await s.search();
  if (initialItemIDs.length === 0) {
    return {
      query: params, pagination: { limit, offset, total: 0, hasMore: false },
      searchTime: `${Date.now() - startTime}ms`, results: [],
    };
  }

  // --- 5. 高级标签过滤 (内存中处理) ---
  let items = await Zotero.Items.getAsync(initialItemIDs);
  const queryTags = Array.isArray(params.tags) ? params.tags : (params.tags ? [params.tags] : []);
  const matchedTagsStats: Record<string, number> = {};

  if (queryTags.length > 0) {
    const tagMatch = params.tagMatch || 'exact';
    const tagMode = params.tagMode || 'any';

    const filteredItems: Zotero.Item[] = [];
    items.forEach(item => {
      const itemTags = item.getTags().map(t => t.tag);
      const matchedTags: string[] = [];

      for (const queryTag of queryTags) {
        const isMatch = itemTags.some(itemTag => {
          switch (tagMatch) {
            case 'contains': return itemTag.toLowerCase().includes(queryTag.toLowerCase());
            case 'startsWith': return itemTag.toLowerCase().startsWith(queryTag.toLowerCase());
            case 'exact': default: return itemTag.toLowerCase() === queryTag.toLowerCase();
          }
        });
        if (isMatch) {
          matchedTags.push(queryTag);
        }
      }

      const uniqueMatched = [...new Set(matchedTags)];
      let shouldInclude = false;
      switch (tagMode) {
        case 'all':
          shouldInclude = uniqueMatched.length === queryTags.length;
          break;
        case 'none':
          shouldInclude = uniqueMatched.length === 0;
          break;
        case 'any':
        default:
          shouldInclude = uniqueMatched.length > 0;
          break;
      }

      if (shouldInclude) {
        (item as any).matchedTags = uniqueMatched; // 附加匹配的标签
        filteredItems.push(item);
        uniqueMatched.forEach(tag => {
          matchedTagsStats[tag] = (matchedTagsStats[tag] || 0) + 1;
        });
      }
    });
    items = filteredItems;
  }

  // --- 6. 排序、分页和格式化 ---
  // Zotero 7 的排序是在 search() 中完成的，内存过滤后需要手动排序
  items.sort((a, b) => {
    let valA: any, valB: any;
    if (sort === 'creator') {
      valA = a.getCreators().map(c => c.lastName).join(', ');
      valB = b.getCreators().map(c => c.lastName).join(', ');
    } else {
      valA = a.getField(sort as any) || '';
      valB = b.getField(sort as any) || '';
    }
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);
  const results = paginatedItems.map(item => {
    const formatted = formatItemBrief(item);
    if ((item as any).matchedTags) {
      formatted.matchedTags = (item as any).matchedTags;
    }
    return formatted;
  });

  // --- 7. 返回最终结果 ---
  return {
    query: params,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
    matchedTags: matchedTagsStats,
    searchTime: `${Date.now() - startTime}ms`,
    results,
  };
}