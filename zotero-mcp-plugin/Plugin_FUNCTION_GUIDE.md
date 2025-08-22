# Zotero MCP 插件功能指南

## 1. 功能概述

Zotero MCP (Model-Context-Protocol) 插件旨在将您的 Zotero 文献库转变为一个动态、可编程的知识库。它通过在 Zotero 内部运行一个轻量级的本地 HTTP 服务器，暴露一套安全的 API，允许外部应用程序（如 AI 助手、自动化脚本等）查询和检索您的文献数据。

其核心理念是“拉取模型”：插件在后台静默运行，等待外部指令，而不是由用户手动推送数据。这使得 Zotero 能够无缝集成到更广泛的自动化工作流中。

## 2. 安装与配置

### 安装

详细的构建和安装步骤，请参考项目中的 [`BUILD_AND_INSTALL.md`](BUILD_AND_INSTALL.md) 文件。该文件提供了从源码构建插件到在 Zotero 中成功安装的完整指南。

### 配置

安装并重启 Zotero 后，您可以在以下位置找到插件的配置界面：

- **Windows/Linux:** `编辑` -> `设置`
- **macOS:** `Zotero` -> `设置`

在打开的窗口中，找到名为 "Zotero MCP Plugin" 的设置区域。

#### 可用选项

- **启用 MCP 服务器 (Enable MCP Server):**
  - **作用:** 这是插件的总开关。勾选此项后，HTTP 服务器将在 Zotero 启动时自动运行。取消勾选则会关闭服务器，所有 API 将不可用。
  - **默认值:** 禁用。

- **服务器端口 (Server Port):**
  - **作用:** 指定 HTTP 服务器监听的端口号。只有来自本机 (`localhost`) 的请求才能访问此端口。
  - **默认值:** `23120`
  - **注意:** 如果此端口与您计算机上的其他应用程序冲突，您可以修改为 `1024` 到 `65535` 之间的任何可用端口。

- **默认返回字段 (Default Return Fields):**
  - **作用:** 当您使用 `/search` 端点且未明确指定 `fields` 参数时，API 将默认返回此处勾选的字段。这可以帮助您在常规查询中减少不必要的数据传输，定制最常用的信息集。
  - **可选字段包括:** `title`, `creators`, `year`, `abstract`, `tags`, `doi`, `isbn`, **`attachmentPaths` (附件路径)** 等。
  - **默认勾选:** `title`, `creators`, `year`。
  - **基础字段:** `key`, `itemType`, `date`, `zoteroUrl` 总是会包含在返回结果中，无论是否勾选。

## 3. API 端点详解

### `/ping`

- **用途:** 健康检查端点，用于验证 MCP 服务器是否正在运行并能够响应请求。
- **方法:** `GET`
- **响应 (200 OK):**
  ```json
  {
    "message": "pong",
    "timestamp": "2024-08-11T10:25:00.000Z"
  }
  ```
- **示例:**
  ```bash
  curl http://localhost:23120/ping
  ```

### `/search`

- **用途:** 在您的 Zotero 文献库中执行搜索。这是插件最核心的功能。
- **方法:** `GET`

#### 基础查询参数

| 参数       | 类型   | 是否可选 | 描述                                                               |
| :--------- | :----- | :------- | :----------------------------------------------------------------- |
| `q`        | string | 可选     | 通用搜索关键词，在所有可搜索字段中进行模糊匹配。                   |
| `title`    | string | 可选     | 按标题搜索，支持模糊匹配。                                         |
| `key`      | string | 可选     | 通过条目 `key` 进行精确匹配，返回单个条目的详细信息。              |
| `tags`     | string | 可选     | 根据标签进行筛选。多个标签可以用逗号 `,` 分隔。                    |
| `tagMode`  | string | 可选     | 标签匹配模式 (`any`, `all`, `none`)，默认为 `any`。                |
| `tagMatch` | string | 可选     | 标签匹配方式 (`exact`, `contains`, `startsWith`)，默认为 `exact`。 |

#### 高级搜索参数

| 参数               | 类型   | 是否可选 | 描述                                                                        |
| :----------------- | :----- | :------- | :-------------------------------------------------------------------------- |
| `titleOperator`    | string | 可选     | 标题搜索操作符 (`contains`, `exact`, `startsWith`, `endsWith`, `regex`)。   |
| `yearRange`        | string | 可选     | 年份范围过滤，格式: `2020-2023`。                                          |
| `dateRange`        | string | 可选     | 日期范围过滤，格式: `2023-01-01,2023-12-31`。                              |
| `relevanceScoring` | string | 可选     | 启用相关性评分 (`true`/`false`)，默认为 `false`。                           |
| `boostFields`      | string | 可选     | 提升字段权重，格式: `title:2.0,abstract:1.5` (逗号分隔)。                  |
| `sort`             | string | 可选     | 排序方式 (`relevance`, `date`, `title`, `year`)，默认为 `relevance`。       |
| `direction`        | string | 可选     | 排序方向 (`asc`/`desc`)，默认为 `desc`。                                    |

## 4. 响应格式

API 根据查询参数返回两种不同详细程度的 JSON 格式。

#### a) 核心信息格式 (默认)

当进行全文、标题等常规搜索时返回。此格式为数组，包含核心信息，响应速度快。

- **请求示例 (通用搜索):**
  ```bash
  curl "http://localhost:23120/search?q=机器学习"
  ```
- **响应示例 (核心信息):**
  ```json
  {
    "query": {
      "q": "机器学习"
    },
    "pagination": {
      "limit": 100,
      "offset": 0,
      "total": 1,
      "hasMore": false
    },
    "searchTime": "50ms",
    "results": [
      {
        "key": "ABCDEFGH",
        "title": "深度学习在自然语言处理中的应用",
        "creators": "张三, 李四",
        "date": "2023"
      }
    ]
  }
  ```

#### b) 详细信息格式 (使用 `key` 查询)

当使用 `key` 参数进行精确查询时返回。此格式为数组，包含条目的完整信息。

- **请求示例 (按 Key 精确查询):**
  ```bash
  curl "http://localhost:23120/search?key=ABCDEFGH"
  ```
- **响应示例 (详细信息):**
  ```json
  {
    "query": {
      "key": "ABCDEFGH"
    },
    "pagination": {
      "limit": 1,
      "offset": 0,
      "total": 1,
      "hasMore": false
    },
    "searchTime": "15ms",
    "results": [
      {
        "key": "ABCDEFGH",
        "itemType": "journalArticle",
        "zoteroUrl": "zotero://select/library/items/ABCDEFGH",
        "title": "深度学习在自然语言处理中的应用",
        "creators": [
          { "firstName": "三", "lastName": "张", "creatorType": "author" },
          { "firstName": "四", "lastName": "李", "creatorType": "author" }
        ],
        "date": "2023-10-01",
        "abstractNote": "本文探讨了深度学习模型在机器翻译、情感分析等领域的最新进展...",
        "attachments": [
          {
            "title": "全文PDF",
            "path": "C:/Zotero/storage/ABCDEFGH/完整论文.pdf",
            "contentType": "application/pdf",
            "filename": "完整论文.pdf"
          }
        ],
        "tags": ["深度学习", "NLP"]
      }
    ]
  }
  ```

## 5. 使用示例

### 基础搜索示例

**1. 通用搜索**
在所有字段中搜索包含"机器学习"的条目。

```bash
curl "http://localhost:23120/search?q=机器学习"
```

**2. 按标题搜索**
搜索标题中包含"价值共创"的条目。

```bash
curl "http://localhost:23120/search?title=价值共创"
```

**3. 按 Key 精确查询**
获取 Key 为 `ABC123` 的条目的详细信息。

```bash
curl "http://localhost:23120/search?key=ABC123"
```

### 高级搜索示例

**4. 精确标题匹配**
查找标题完全匹配的条目。

```bash
curl "http://localhost:23120/search?title=深度学习原理与应用&titleOperator=exact"
```

**5. 年份范围搜索**
搜索2020-2023年间发表的文献。

```bash
curl "http://localhost:23120/search?yearRange=2020-2023&sort=year&direction=desc"
```

**6. 启用相关性评分**
使用相关性评分搜索，并提升标题权重。

```bash
curl "http://localhost:23120/search?q=人工智能&relevanceScoring=true&boostFields=title:2.0,abstract:1.5&sort=relevance"
```

**7. 正则表达式搜索**
使用正则表达式匹配标题。

```bash
curl "http://localhost:23120/search?title=^深度.*学习$&titleOperator=regex"
```

**8. 日期范围过滤**
搜索特定日期范围内的文献。

```bash
curl "http://localhost:23120/search?dateRange=2023-01-01,2023-12-31&sort=date&direction=desc"
```

#### 增强的 Tags 搜索功能

- **`tags`**:
  - **功能**: 筛选包含特定标签的条目。
  - **示例**: `tags=深度学习,NLP` (查找同时包含“深度学习”和“NLP”的条目)

- **`tagMode`**:
  - **功能**: 定义多个标签的匹配逻辑。
  - **`any` (默认)**: 包含**任意**一个指定标签即可。
  - **`all`**: 必须包含**所有**指定的标签。
  - **`none`**: **不能包含**任何指定的标签。
  - **示例**: `tags=AI,GPT&tagMode=all`

- **`tagMatch`**:
  - **功能**: 定义标签的匹配方式。
  - **`exact` (默认)**: 精确匹配整个标签。
  - **`contains`**: 标签名包含查询词即可。
  - **`startsWith`**: 标签名以查询词开头。
  - **示例**: `tags=学习&tagMatch=contains` (会匹配“深度学习”、“机器学习”等)

### PDF 文本提取 API

#### `GET /items/:itemKey/pdf-content`

- **用途**: 从指定条目的 PDF 附件中提取文本内容。如果一个条目有多个 PDF 附件，默认选择第一个。
- **方法**: `GET`
- **路径参数**:
  - `:itemKey` (string, required): Zotero 中条目的唯一标识符。

##### 查询参数

| 参数     | 类型   | 是否可选 | 描述                                                                            |
| :------- | :----- | :------- | :------------------------------------------------------------------------------ |
| `page`   | number | 可选     | 指定要提取文本的 PDF 页码（从 1 开始）。如果省略，则提取所有页面的文本。        |
| `format` | string | 可选     | 定义返回内容的格式。支持 `text` (默认，返回纯文本) 和 `json` (返回结构化数据)。 |

##### 响应格式示例 (`format=json`)

```json
{
  "itemKey": "ABCDEFGH",
  "totalPages": 15,
  "pages": [
    {
      "page": 1,
      "content": "这是第一页的文本内容..."
    }
  ]
}
```

##### 使用示例

**1. 获取 PDF 全文 (默认文本格式)**

```bash
curl "http://localhost:23120/items/ABCDEFGH/pdf-content"
```

**2. 获取第 5 页的文本**

```bash
curl "http://localhost:23120/items/ABCDEFGH/pdf-content?page=5"
```

**3. 以 JSON 格式获取第 1 页的内容**

```bash
curl "http://localhost:23120/items/ABCDEFGH/pdf-content?page=1&format=json"
```

##### 技术实现说明

- **核心引擎**: 该功能利用 Zotero 内置的 `pdfWorker` 来解析 PDF 文件，确保了高效和兼容性。
- **异步处理**: 文本提取是一个异步过程，不会阻塞 Zotero 的主线程，保证了用户界面的流畅。
- **错误处理**: 如果条目没有 PDF 附件、PDF 损坏或页码无效，API 会返回相应的错误信息（如 404 Not Found 或 400 Bad Request）。

##### API 测试说明

您可以通过访问 `http://localhost:23120/api-test` 页面来方便地测试此功能。在测试页面中，输入 `itemKey` 并选择 `pdf-content` 即可进行交互式测试。

### Collections API

#### `GET /collections`

- **功能描述**: 获取 Zotero 文献库中所有 collections 的层级列表。
- **请求参数**: 无
- **响应格式示例**:
  ```json
  [
    {
      "key": "COLLECTION_KEY_1",
      "name": "计算机科学",
      "level": 0,
      "children": [
        {
          "key": "COLLECTION_KEY_2",
          "name": "人工智能",
          "level": 1,
          "children": []
        }
      ]
    }
  ]
  ```
- **使用示例**:
  ```bash
  curl http://localhost:23120/collections
  ```

#### `GET /collections/search`

- **功能描述**: 根据名称搜索 collections。
- **请求参数**:
  - `q` (string, required): 搜索关键词。
- **响应格式示例**:
  ```json
  [
    {
      "key": "COLLECTION_KEY_2",
      "name": "人工智能"
    }
  ]
  ```
- **使用示例**:
  ```bash
  curl "http://localhost:23120/collections/search?q=人工智能"
  ```

#### `GET /collections/:collectionKey`

- **功能描述**: 获取单个 collection 的详细信息。
- **请求参数**:
  - `:collectionKey` (string, required): Collection 的唯一标识符。
- **响应格式示例**:
  ```json
  {
    "key": "COLLECTION_KEY_2",
    "name": "人工智能",
    "parent": "COLLECTION_KEY_1",
    "numberOfItems": 50
  }
  ```
- **使用示例**:
  ```bash
  curl http://localhost:23120/collections/COLLECTION_KEY_2
  ```

#### `GET /collections/:collectionKey/items`

- **功能描述**: 获取指定 collection 下的所有文献条目。
- **请求参数**:
  - `:collectionKey` (string, required): Collection 的唯一标识符。
- **响应格式示例**: (与 `/search` 的核心信息格式相同)
  ```json
  {
    "results": [
      {
        "key": "ITEM_KEY_1",
        "title": "A brief history of AI",
        ...
      }
    ]
  }
  ```
- **使用示例**:

  ```bash
  curl http://localhost:23120/collections/COLLECTION_KEY_2/items
  ```

### 注释和笔记检索 API

#### `GET /annotations/search`

- **功能描述**: 搜索 Zotero 文献库中的所有笔记、PDF 注释和高亮内容。
- **方法**: `GET`

##### 查询参数

| 参数         | 类型    | 是否可选 | 描述                                                                          |
| :----------- | :------ | :------- | :---------------------------------------------------------------------------- |
| `q`          | string  | 可选     | 搜索关键词（在内容、评论、标签中搜索）。                                      |
| `type`       | string  | 可选     | 注释类型过滤 (`note`, `highlight`, `annotation`, `ink`, `text`, `image`)。    |
| `tags`       | string  | 可选     | 标签过滤（逗号分隔）。                                                        |
| `color`      | string  | 可选     | 颜色过滤（适用于高亮）。                                                      |
| `hasComment` | boolean | 可选     | 是否有评论 (`true`/`false`)。                                                 |
| `dateRange`  | string  | 可选     | 日期范围 (`2023-01-01,2023-12-31`)。                                         |
| `itemKey`    | string  | 可选     | 限制到特定文献。                                                              |
| `sort`       | string  | 可选     | 排序方式 (`dateAdded`, `dateModified`, `position`)，默认为 `dateModified`。   |
| `direction`  | string  | 可选     | 排序方向 (`asc`/`desc`)，默认为 `desc`。                                      |
| `limit`      | string  | 可选     | 结果数量限制（最大 200），默认为 50。                                         |
| `offset`     | string  | 可选     | 分页偏移量，默认为 0。                                                        |

##### 响应格式示例

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
  "totalCount": 150
}
```

##### 使用示例

**1. 搜索包含特定关键词的高亮**
```bash
curl "http://localhost:23120/annotations/search?q=机器学习&type=highlight&limit=10"
```

**2. 获取带评论的注释**
```bash
curl "http://localhost:23120/annotations/search?hasComment=true&sort=dateModified&direction=desc"
```

**3. 搜索特定颜色的高亮**
```bash
curl "http://localhost:23120/annotations/search?type=highlight&color=red&limit=20"
```

#### `GET /items/:itemKey/notes`

- **功能描述**: 获取特定文献的所有笔记内容。
- **方法**: `GET`
- **路径参数**:
  - `:itemKey` (string, required): 文献的唯一标识符。

##### 响应格式示例

```json
[
  {
    "id": "NOTE123",
    "itemKey": "NOTE123",
    "parentKey": "ITEM456",
    "type": "note",
    "content": "<p>这是一条笔记</p>",
    "text": "这是一条笔记",
    "tags": ["重要"],
    "dateAdded": "2023-01-01T12:00:00.000Z",
    "dateModified": "2023-01-02T12:00:00.000Z"
  }
]
```

##### 使用示例

```bash
curl "http://localhost:23120/items/ABCD1234/notes"
```

#### `GET /items/:itemKey/annotations`

- **功能描述**: 获取特定文献PDF中的注释和高亮，支持类型和颜色过滤。
- **方法**: `GET`
- **路径参数**:
  - `:itemKey` (string, required): 文献的唯一标识符。

##### 查询参数

| 参数     | 类型   | 是否可选 | 描述                                                                       |
| :------- | :----- | :------- | :------------------------------------------------------------------------- |
| `type`   | string | 可选     | 注释类型过滤 (`highlight`, `annotation`, `ink`, `text`, `image`)。         |
| `color`  | string | 可选     | 颜色过滤（适用于高亮）。                                                   |

##### 响应格式示例

与 `/annotations/search` 的格式相同，但结果已按页面位置排序。

##### 使用示例

```bash
curl "http://localhost:23120/items/ABCD1234/annotations?type=highlight&color=yellow"
```

#### `GET /test/annotations`

- **功能描述**: 运行注释功能的完整测试套件。
- **方法**: `GET`

##### 响应格式示例

```json
{
  "message": "Annotation features test completed",
  "message_zh": "注释功能测试完成",
  "testResults": {
    "summary": {
      "total": 5,
      "passed": 5,
      "failed": 0,
      "successRate": "100.0%"
    },
    "tests": [
      {
        "name": "获取所有笔记",
        "status": "PASSED",
        "duration": 253,
        "resultCount": 2001,
        "totalCount": 2001
      }
    ],
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

##### 使用示例

```bash
curl "http://localhost:23120/test/annotations"
```

### 高级搜索测试 API

#### `GET /test/advanced-search`

- **功能描述**: 运行高级搜索功能的完整测试套件。
- **方法**: `GET`

##### 响应格式示例

```json
{
  "message": "Advanced search features test completed",
  "message_zh": "高级搜索功能测试完成",
  "testResults": {
    "summary": {
      "total": 12,
      "passed": 12,
      "failed": 0,
      "successRate": "100.0%"
    },
    "tests": [
      {
        "name": "基础搜索功能",
        "status": "PASSED",
        "duration": 45,
        "resultCount": 10
      }
    ]
  }
}
```

##### 使用示例

```bash
curl "http://localhost:23120/test/advanced-search"
```

## 6. 版本更新说明

### v2.0 主要更新

- **🚀 高级搜索功能:**
  - 新增高级搜索参数 (`titleOperator`, `yearRange`, `dateRange`, `relevanceScoring`, `boostFields`)
  - 支持精确匹配、正则表达式、前缀匹配等多种搜索操作符
  - 引入相关性评分系统和字段权重提升功能
  - 新增年份范围和日期范围过滤功能
  - 支持灵活的排序和分页机制

- **📚 注释和笔记检索系统:**
  - 新增 `/annotations/search` API，支持跨笔记和注释的全文搜索
  - 新增 `/items/:itemKey/notes` API，获取特定文献的笔记内容
  - 新增 `/items/:itemKey/annotations` API，获取PDF中的注释和高亮
  - 支持按类型、颜色、评论、标签等多维度过滤
  - 自动按页面位置排序PDF注释，提供完整的阅读体验

- **🔧 测试和调试功能:**
  - 新增 `/test/advanced-search` 测试端点，包含12个测试用例
  - 新增 `/test/annotations` 测试端点，包含5个测试用例
  - 完整的错误处理和UTF-8编码支持
  - 详细的性能统计和执行时间记录

### 历史版本更新

- **功能增强:**
  - 新增 `/items/:itemKey/pdf-content` API，用于提取 PDF 附件的文本内容。
  - 新增 Collections API，用于查询和管理分类。
  - 新增高级 Tags 搜索功能 (`tagMode`, `tagMatch`)。
  - **逻辑简化:** 移除了 `detail` 参数。现在，当使用 `key` 进行精确搜索时，API 会自动返回详细信息；其他所有搜索（如全文、标题搜索）则默认返回核心信息。

- **性能优化:** 常规搜索默认返回核心信息，大幅提升了大规模查询的响应速度。
- **功能增强:**
  - 新增通过 `key` 进行精确查找的功能。
  - `title` 参数现在支持更灵活的模糊匹配。
- **数据扩展:** 当进行精确匹配 (`key`) 时，响应中会自动包含附件的本地文件路径 (`path`)。
- **Bug修复:** 修复了在处理某些关键词时可能出现的 UTF-8 编码问题，确保全球语言的兼容性。
