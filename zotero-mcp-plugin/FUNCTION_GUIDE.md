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

#### 查询参数

| 参数    | 类型   | 是否可选 | 描述                                                  |
| :------ | :----- | :------- | :---------------------------------------------------- |
| `q`     | string | 可选     | 通用搜索关键词，在所有可搜索字段中进行模糊匹配。      |
| `title` | string | 可选     | 按标题搜索，支持模糊匹配。                            |
| `key`   | string | 可选     | 通过条目 `key` 进行精确匹配，返回单个条目的详细信息。 |

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

**1. 通用搜索**
在所有字段中搜索包含“机器学习”的条目。

```bash
curl "http://localhost:23120/search?q=机器学习"
```

**2. 按标题搜索**
搜索标题中包含“价值共创”的条目。

```bash
curl "http://localhost:23120/search?title=价值共创"
```

**3. 按 Key 精确查询**
获取 Key 为 `ABC123` 的条目的详细信息。

```bash
curl "http://localhost:23120/search?key=ABC123"
```

## 6. 版本更新说明

- **逻辑简化:** 移除了 `detail` 参数。现在，当使用 `key` 进行精确搜索时，API 会自动返回详细信息；其他所有搜索（如全文、标题搜索）则默认返回核心信息。
- **性能优化:** 常规搜索默认返回核心信息，大幅提升了大规模查询的响应速度。
- **功能增强:**
  - 新增通过 `key` 进行精确查找的功能。
  - `title` 参数现在支持更灵活的模糊匹配。
- **数据扩展:** 当进行精确匹配 (`key`) 时，响应中会自动包含附件的本地文件路径 (`path`)。
- **Bug修复:** 修复了在处理某些关键词时可能出现的 UTF-8 编码问题，确保全球语言的兼容性。
