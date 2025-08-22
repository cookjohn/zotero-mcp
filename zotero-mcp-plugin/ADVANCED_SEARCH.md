# 高级搜索功能文档

Zotero MCP Plugin 2.0 版本新增了强大的高级搜索功能，支持多种搜索操作符、相关性评分、范围查询等。

## 🚀 新增功能概览

### 1. 高级字段操作符

- **精确匹配** (`exact`): 完全匹配
- **包含匹配** (`contains`): 部分匹配（默认）
- **开始匹配** (`startsWith`): 前缀匹配
- **结束匹配** (`endsWith`): 后缀匹配
- **正则表达式** (`regex`): 正则匹配

### 2. 范围查询

- **年份范围**: `yearRange=2020-2023`
- **日期范围**: `dateAddedRange=2023-01-01,2023-12-31`
- **页数范围**: `numPagesRange=10-50`

### 3. 相关性评分

- **智能评分**: `relevanceScoring=true`
- **字段权重**: `boostFields=title,abstractNote`
- **相关性排序**: `sort=relevance`

### 4. 扩展字段支持

- 摘要文本、发表期刊、语言、版权信息等

## 📖 API 使用示例

### 基础搜索

```
GET /search?q=人工智能&limit=10
```

### 标题精确匹配

```
GET /search?title=数字化转型&titleOperator=exact&limit=5
```

### 年份范围搜索

```
GET /search?yearRange=2020-2023&limit=10
```

### 相关性评分搜索

```
GET /search?q=创新&relevanceScoring=true&sort=relevance&direction=desc&limit=10
```

### 复合条件搜索

```
GET /search?title=机器学习&titleOperator=contains&yearRange=2021-2023&creator=张&creatorOperator=contains&relevanceScoring=true&limit=5
```

### 摘要正则搜索

```
GET /search?abstractText=数字.*转型&abstractOperator=regex&limit=5
```

### 字段权重提升

```
GET /search?q=区块链&relevanceScoring=true&boostFields=title,abstractNote&sort=relevance&limit=5
```

## 🔧 支持的搜索参数

### 基础参数

- `q`: 全文搜索关键词
- `key`: 精确项目键匹配
- `limit`: 结果数量限制 (最大 500)
- `offset`: 分页偏移量
- `sort`: 排序字段 (`date|title|creator|dateAdded|dateModified|relevance`)
- `direction`: 排序方向 (`asc|desc`)

### 字段特定搜索

- `title` + `titleOperator`: 标题搜索
- `creator` + `creatorOperator`: 作者搜索
- `abstractText` + `abstractOperator`: 摘要搜索
- `publicationTitle` + `publicationTitleOperator`: 发表期刊搜索

### 范围查询参数

- `yearRange`: 年份范围 (`"2020-2023"`)
- `dateAddedRange`: 添加日期范围 (`"2023-01-01,2023-12-31"`)
- `dateModifiedRange`: 修改日期范围
- `numPagesRange`: 页数范围 (`"10-50"`)

### 相关性参数

- `relevanceScoring`: 启用相关性评分 (`"true"|"false"`)
- `boostFields`: 权重提升字段 (逗号分隔)
- `sort=relevance`: 按相关性排序

### 其他字段

- `language`: 语言过滤
- `rights`: 版权信息
- `url`: URL 地址
- `extra`: 额外信息

## 📊 响应格式

### 基础响应

```json
{
  "query": { ... },
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 42,
    "hasMore": true
  },
  "searchTime": "156ms",
  "version": "2.0",
  "searchFeatures": ["fulltext", "relevanceScoring"],
  "results": [ ... ]
}
```

### 相关性评分响应

```json
{
  "relevanceStats": {
    "averageScore": 2.35,
    "maxScore": 5.2,
    "minScore": 0.8
  },
  "results": [
    {
      "key": "ABCD1234",
      "title": "人工智能研究",
      "relevanceScore": 5.2,
      "matchedFields": ["title", "abstractNote"],
      ...
    }
  ]
}
```

## 🧪 测试功能

访问测试端点查看所有高级搜索功能的演示：

```
GET /test/advanced-search
```

该端点将运行 12 个不同的测试用例，展示各种高级搜索功能的使用方法和效果。

## 📈 性能优化

### 搜索策略

1. **精确键查找优先**: `key` 参数时直接查找，无需全表扫描
2. **Zotero 原生搜索**: 先用 Zotero Search API 快速过滤
3. **内存后处理**: 高级功能在内存中进一步过滤和评分
4. **智能缓存**: 相同查询结果可复用

### 建议用法

- 使用 `limit` 控制结果数量，避免大量数据传输
- 结合基础搜索和高级过滤，先缩小范围再精确匹配
- 相关性评分适用于全文搜索，传统排序适用于浏览

## 🔄 版本兼容性

- **v1.0 兼容**: 所有原有参数继续支持
- **v2.0 新增**: 高级操作符和相关性评分
- **响应标识**: `"version": "2.0"` 标识增强版引擎

## 💡 使用建议

1. **精确查找**: 已知项目键时使用 `key` 参数
2. **模糊搜索**: 使用 `q` 参数进行全文搜索
3. **范围过滤**: 结合年份、日期范围缩小结果
4. **相关性排序**: 全文搜索时启用相关性评分
5. **字段权重**: 根据需求提升重要字段权重
6. **复合查询**: 组合多个条件实现精确检索

通过这些功能，您可以实现更精确、更智能的文献检索和管理。
