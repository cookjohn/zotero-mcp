# Zotero MCP Server v1.1.0 更新说明

## 🚀 主要更新

### 1. 注释搜索工具增强 (`search_annotations`)

#### 新增参数：
- **`detailed`**: 控制内容详细程度
  - `false`（默认）: 预览模式，内容截断 + 关键词
  - `true`: 详细模式，返回完整内容
- **优化分页**:
  - 预览模式：默认20条，最大100条
  - 详细模式：默认50条，最大200条

#### 改进描述：
```typescript
"Search all notes, PDF annotations and highlights in the Zotero library. 
Returns metadata first (pagination, total count, search time) followed by results. 
Use preview mode (default) for overview, detailed mode for full content."
```

### 2. 文献笔记工具更新 (`get_item_notes`)

#### 新增功能：
- **分页支持**: `limit` (最大100, 默认20) 和 `offset` 参数
- **元数据优先**: 返回格式优化，统计信息在前

#### 新参数：
```typescript
{
  itemKey: string,      // 文献ID
  limit?: string,       // 返回数量限制  
  offset?: string       // 分页偏移量
}
```

### 3. 文献注释工具更新 (`get_item_annotations`)

#### 新增功能：
- **分页支持**: 添加 `limit` 和 `offset` 参数
- **按位置排序**: 结果按页面位置自动排序
- **元数据优先**: 统一的响应格式

### 4. 新增精准检索工具

#### 工具一：`get_annotation_by_id`
- **功能**: 按ID获取单个注释的完整内容
- **参数**: `annotationId` (string)
- **用途**: 从预览结果中精准获取感兴趣的完整内容

#### 工具二：`get_annotations_batch`
- **功能**: 批量获取多个注释的完整内容
- **参数**: `ids` (string[])
- **用途**: 一次性获取多个注释的详细信息

## 📊 API响应格式优化

### 元数据优先的统一格式：
```json
{
  "pagination": {
    "limit": 20,
    "offset": 0, 
    "total": 98,
    "hasMore": true
  },
  "searchTime": "45ms",
  "totalCount": 98,
  "contentMode": "preview",
  "version": "2.0",
  "endpoint": "annotations/search",
  "results": [...]  // 实际数据
}
```

## 🎯 推荐使用流程

### 1. 高效的注释检索流程：
```
1. search_annotations (preview模式) → 了解全貌
2. 分析pagination.hasMore → 判断是否需要更多数据  
3. get_annotation_by_id → 获取感兴趣的完整内容
4. get_annotations_batch → 批量获取多个详细内容
```

### 2. 分页策略：
```
# 初始概览
search_annotations?q=keyword&limit=20

# 需要更多结果
search_annotations?q=keyword&limit=20&offset=20

# 需要详细内容  
search_annotations?q=keyword&detailed=true&limit=10
```

## 🔧 工具总览

| 工具名 | 用途 | 主要特性 |
|--------|------|----------|
| `search` | 文献搜索 | 高级搜索参数，相关性评分 |
| `search_annotations` | 注释搜索 | 预览/详细模式，智能分页 |
| `get_item_notes` | 文献笔记 | 分页支持，元数据优先 |
| `get_item_annotations` | 文献注释 | 分页 + 过滤，位置排序 |
| `get_annotation_by_id` | 精准检索 | 按ID获取完整内容 |
| `get_annotations_batch` | 批量检索 | 一次获取多个完整内容 |

## 💡 性能优化

1. **Token友好**: 预览模式减少80%的数据传输
2. **渐进式加载**: 从概览到详细的智能获取路径
3. **合理分页**: 根据模式自动调整默认大小
4. **元数据优先**: AI可快速评估数据规模和质量

## 🔄 向后兼容性

- 所有现有参数保持兼容
- 新参数均为可选，不影响现有使用
- API响应格式增强但保持向后兼容

此更新显著提升了MCP服务器处理大量注释数据的能力，为AI提供了更高效的信息获取和处理体验。