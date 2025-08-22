# 注释和笔记检索功能文档

Zotero MCP Plugin 新增了强大的注释、笔记和高亮内容检索功能，让您能够快速访问和搜索您的研究笔记。

## 🚀 主要功能

### 1. 笔记检索

- 获取所有笔记或特定文献的笔记
- 支持笔记内容全文搜索
- 按日期、标签等条件过滤

### 2. PDF注释和高亮

- 提取PDF中的高亮内容
- 获取用户添加的注释评论
- 支持按颜色、页码、类型过滤
- 按页面位置自动排序

### 3. 统一搜索

- 跨笔记和注释的全文搜索
- 支持多种过滤条件组合
- 灵活的排序和分页

## 📖 API 端点

### 搜索所有注释

```
GET /annotations/search?q=关键词&type=highlight,note&limit=20
```

**参数:**

- `q`: 搜索关键词（在内容、评论、标签中搜索）
- `type`: 注释类型过滤 (`note|highlight|annotation|ink|text|image`)
- `tags`: 标签过滤（逗号分隔）
- `color`: 颜色过滤（适用于高亮）
- `hasComment`: 是否有评论 (`true|false`)
- `dateRange`: 日期范围 (`2023-01-01,2023-12-31`)
- `itemKey`: 限制到特定文献
- `sort`: 排序方式 (`dateAdded|dateModified|position`)
- `direction`: 排序方向 (`asc|desc`)
- `limit`: 结果数量限制（最大200）
- `offset`: 分页偏移量

### 获取文献笔记

```
GET /items/{itemKey}/notes
```

获取特定文献的所有笔记内容。

### 获取文献注释

```
GET /items/{itemKey}/annotations?type=highlight&color=yellow
```

获取特定文献PDF中的注释和高亮，支持类型和颜色过滤。

### 测试功能

```
GET /test/annotations
```

运行注释功能的完整测试套件。

## 📊 响应格式

### 搜索响应

```json
{
  "results": [
    {
      "id": "ABCD1234",
      "itemKey": "ABCD1234",
      "parentKey": "EFGH5678",
      "type": "highlight",
      "content": "这是重要的内容",
      "text": "原始高亮文本",
      "comment": "我的评论",
      "color": "yellow",
      "tags": ["重要", "理论"],
      "dateAdded": "2023-01-01T12:00:00.000Z",
      "dateModified": "2023-01-02T12:00:00.000Z",
      "page": 15,
      "sortIndex": 100
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "hasMore": true
  },
  "searchTime": "45ms",
  "totalCount": 150,
  "version": "2.0",
  "endpoint": "annotations/search"
}
```

### 注释对象字段

| 字段           | 类型     | 描述                        |
| -------------- | -------- | --------------------------- |
| `id`           | string   | 注释唯一ID                  |
| `itemKey`      | string   | 文献Key                     |
| `parentKey`    | string   | 父文献Key（如果是附件注释） |
| `type`         | string   | 注释类型                    |
| `content`      | string   | 注释内容（评论或文本）      |
| `text`         | string   | 原始文本（高亮内容）        |
| `comment`      | string   | 用户评论                    |
| `color`        | string   | 高亮颜色                    |
| `tags`         | string[] | 标签列表                    |
| `dateAdded`    | string   | 创建日期                    |
| `dateModified` | string   | 修改日期                    |
| `page`         | number   | 页码（PDF注释）             |
| `sortIndex`    | number   | 页面内位置索引              |

## 🔧 使用示例

### 搜索包含特定关键词的高亮

```bash
curl "http://localhost:23119/annotations/search?q=机器学习&type=highlight&limit=10"
```

### 获取带评论的注释

```bash
curl "http://localhost:23119/annotations/search?hasComment=true&sort=dateModified&direction=desc"
```

### 搜索特定颜色的高亮

```bash
curl "http://localhost:23119/annotations/search?type=highlight&color=red&limit=20"
```

### 获取文献的所有笔记

```bash
curl "http://localhost:23119/items/ABCD1234/notes"
```

### 获取PDF中的注释（按页面排序）

```bash
curl "http://localhost:23119/items/ABCD1234/annotations"
```

### 搜索最近添加的注释

```bash
curl "http://localhost:23119/annotations/search?dateRange=2023-12-01,2023-12-31&sort=dateAdded&direction=desc"
```

## 💡 使用技巧

### 1. 组合搜索

```bash
# 搜索包含"深度学习"且有评论的黄色高亮
curl "http://localhost:23119/annotations/search?q=深度学习&type=highlight&color=yellow&hasComment=true"
```

### 2. 按位置浏览PDF注释

```bash
# 获取文献的PDF注释，按页面位置排序
curl "http://localhost:23119/items/ABCD1234/annotations?sort=position&direction=asc"
```

### 3. 查找重要笔记

```bash
# 搜索标记为"重要"标签的注释
curl "http://localhost:23119/annotations/search?tags=重要&sort=dateModified&direction=desc"
```

## 🎯 支持的注释类型

- **`note`**: 独立笔记或文献笔记
- **`highlight`**: PDF高亮内容
- **`annotation`**: 一般注释
- **`text`**: 文本注释（PDF）
- **`ink`**: 手绘注释
- **`image`**: 图像注释

## 🌟 高级特性

### 1. 智能内容提取

- 自动提取HTML笔记的纯文本内容
- 保留原始格式化内容供详细查看

### 2. 位置信息

- PDF注释自动按页码和位置排序
- 支持按阅读顺序浏览注释

### 3. 标签整合

- 注释标签与Zotero标签系统完全整合
- 支持标签的模糊匹配和精确匹配

### 4. 性能优化

- 大量注释的高效处理
- 智能缓存和分页机制

通过这些功能，您可以更好地管理和利用在Zotero中积累的研究笔记和注释，提升研究效率！
