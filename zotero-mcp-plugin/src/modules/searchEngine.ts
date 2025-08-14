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
  tag?: string;
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
  // 添加调试日志：记录接收到的参数
  Zotero.debug(`[MCP Search] Received search params: ${JSON.stringify(params)}`, 1);

  const startTime = Date.now();
  const libraryID = params.libraryID ? parseInt(params.libraryID, 10) : Zotero.Libraries.userLibraryID;

  // 如果提供了 key，执行精确查找
  if (params.key) {
    const item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, params.key);
    if (item) {
      return {
        query: params,
        pagination: { limit: 1, offset: 0, total: 1, hasMore: false },
        searchTime: `${Date.now() - startTime}ms`,
        results: [formatItem(item)], // 精确匹配总是返回详细信息
      };
    } else {
      return {
        query: params,
        pagination: { limit: 1, offset: 0, total: 0, hasMore: false },
        searchTime: `${Date.now() - startTime}ms`,
        results: [],
      };
    }
  }

  // 1. 参数验证和处理
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

  // 2. 创建 Zotero.Search 实例
  const s = new Zotero.Search();
  
  // 获取库ID - 支持搜索所有库或指定库
  // 设置库ID
  (s as any).libraryID = libraryID;
  ztoolkit.log(`[MCP Search] Created search instance with libraryID: ${libraryID}`);
  
  // 打印可用的库信息
  try {
    const allLibraries = Zotero.Libraries.getAll();
    ztoolkit.log(`[MCP Search] Available libraries: ${allLibraries.length}`);
    allLibraries.forEach(lib => {
      // 使用类型断言访问type属性
      const libType = (lib as any).type || 'unknown';
      ztoolkit.log(`[MCP Search]   - Library: ID=${lib.id}, Name=${lib.name}, Type=${libType}`);
    });
  } catch (e) {
    ztoolkit.log(`[MCP Search] Could not list libraries: ${e}`, "error");
  }

  // 3. 构建搜索条件
  // 快速搜索 (q)
  if (params.q) {
    ztoolkit.log(`[MCP Search] Adding quicksearch condition for: ${params.q}`);
    s.addCondition('quicksearch-everything', 'contains', params.q);
  }

  // 精确字段搜索
  const fieldMappings: { [key in keyof SearchParams]?: string } = {
    title: 'title',
    creator: 'creator',
    year: 'date', // Zotero uses 'date' for year filtering
    tag: 'tag',
    itemType: 'itemType',
    doi: 'DOI',
    isbn: 'ISBN',
  };

  for (const [paramKey, conditionKey] of Object.entries(fieldMappings)) {
    if (params[paramKey as keyof SearchParams]) {
      // 'year' is a special case for the 'date' field
      const operator = paramKey === 'year' ? 'is' : 'contains';
      const value = params[paramKey as keyof SearchParams];
      ztoolkit.log(`[MCP Search] Adding condition: ${conditionKey} ${operator} "${value}"`);
      
      s.addCondition(conditionKey, operator, value);
    }
  }

  // 高级筛选
  if (params.collection) {
    const collectionID = parseInt(params.collection, 10);
    if (!isNaN(collectionID)) {
        const collection = await Zotero.Collections.getAsync(collectionID);
        if (collection) {
            s.addCondition('collection', 'is', collection.id);
        } else {
            // If collection is not found, return empty result to avoid searching everything.
            return {
                query: params,
                pagination: { limit, offset, total: 0, hasMore: false },
                searchTime: `${Date.now() - startTime}ms`,
                results: [],
            };
        }
    } else {
        // If collection ID is invalid, return empty result.
        return {
            query: params,
            pagination: { limit, offset, total: 0, hasMore: false },
            searchTime: `${Date.now() - startTime}ms`,
            results: [],
        };
    }
  }

  if (params.hasAttachment === 'true') {
    s.addCondition('attachment', 'is', 'true');
  } else if (params.hasAttachment === 'false') {
    s.addCondition('attachment', 'is', 'false');
  }

  if (params.hasNote === 'true') {
    s.addCondition('note', 'is', 'true');
  } else if (params.hasNote === 'false') {
    s.addCondition('note', 'is', 'false');
  }
  
  // 确保只搜索主条目，排除附件和笔记（可以通过参数控制）
  const excludeAttachments = params.includeAttachments !== 'true';
  const excludeNotes = params.includeNotes !== 'true';
  
  if (excludeAttachments) {
    s.addCondition('itemType', 'isNot', 'attachment');
    ztoolkit.log(`[MCP Search] Excluding attachments`);
  }
  if (excludeNotes) {
    s.addCondition('itemType', 'isNot', 'note');
    ztoolkit.log(`[MCP Search] Excluding notes`);
  }

  // 打印搜索条件信息
  try {
    const conditions = (s as any).conditions || [];
    ztoolkit.log(`[MCP Search] Total conditions added: ${conditions.length}`);
    conditions.forEach((cond: any, index: number) => {
      ztoolkit.log(`[MCP Search] Condition ${index}: ${JSON.stringify(cond)}`);
    });
  } catch (e) {
    ztoolkit.log(`[MCP Search] Could not log conditions: ${e}`, "error");
  }

  // 4. 设置排序并执行搜索
  // Zotero 7 API - sort and direction are properties
  (s as any).sort = sort;
  (s as any).direction = direction;
  
  ztoolkit.log(`[MCP Search] Sort by: ${sort} ${direction}`);
  ztoolkit.log(`[MCP Search] Executing search...`);

  // 执行搜索
  let allItemIDs: number[] = [];
  
  try {
    allItemIDs = await s.search();
    ztoolkit.log(`[MCP Search] Search completed. Found ${allItemIDs.length} items`);
  } catch (searchError) {
    ztoolkit.log(`[MCP Search] Search error: ${searchError}`, "error");
    // 当搜索失败时，抛出错误而不是尝试备用方案
    throw new MCPError(500, `Search failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`);
  }
  
  const total = allItemIDs.length;

  // 手动分页
  const paginatedIDs = allItemIDs.slice(offset, offset + limit);
  ztoolkit.log(`[MCP Search] Paginated results: offset=${offset}, limit=${limit}, returning ${paginatedIDs.length} items`);
  
  const items = await Zotero.Items.getAsync(paginatedIDs);

  // 5. 格式化结果
  const results = items.map((item) => formatItemBrief(item));
  const endTime = Date.now();
  
  // 打印前几个结果的标题用于调试
  if (results.length > 0) {
    ztoolkit.log(`[MCP Search] Sample results (first 3):`);
    results.slice(0, 3).forEach((item, index) => {
      ztoolkit.log(`[MCP Search]   ${index + 1}. ${item.title}`);
    });
  }

  // 6. 返回最终数据
  return {
    query: params,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
    searchTime: `${endTime - startTime}ms`,
    results,
  };
}