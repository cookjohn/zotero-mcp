# Zotero MCP - Model Context Protocol Integration for Zotero

Zotero MCP 是一个开源项目，旨在通过模型上下文协议（Model Context Protocol, MCP）将强大的 AI 功能与领先的文献管理工具 Zotero 无缝集成，为 AI 助手（如 Claude）提供与您本地 Zotero 文献库交互的能力。
_This README is also available in: [:gb: English](./README.md) | :cn: 简体中文._
[![GitHub](https://img.shields.io/badge/GitHub-zotero--mcp-blue?logo=github)](https://github.com/cookjohn/zotero-mcp)
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![Version](https://img.shields.io/badge/Version-1.4.1-brightgreen)]()
[![EN doc](https://img.shields.io/badge/Document-English-blue.svg)](README.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue.svg)](README-zh.md)

---
## 关注我们
 
 | 公众号 | 加入群聊 |
| :--- | :---: |
| ![Reading PDF](./IMG/MP.jpg) | ![Contact us](./IMG/0317.jpg) |
## 📚 项目概述

Zotero MCP 服务器是一个基于 Model Context Protocol 的工具服务器，它为 Claude Desktop 等 AI 应用提供了与 Zotero 文献管理系统的无缝集成。通过此服务器，AI 助手可以：

- 🔍 智能搜索您的 Zotero 文献库
- 📖 获取文献的详细信息
- 🏷️ 按标签、作者、年份等多维度筛选文献
- 🔗 通过 DOI、ISBN 等标识符精确定位文献

这使得 AI 助手能够帮助您进行文献综述、引用管理、研究辅助等学术工作。

## 🚀 项目结构

本项目采用了**统一架构**，将 MCP 服务器集成在插件内：

- **`zotero-mcp-plugin/`**: 一个集成了 **MCP 服务器功能**的 Zotero 插件，使用 Streamable HTTP 协议直接与 AI 客户端通信
- **`IMG/`**: 截图和说明文档图片
- **`README.md`** / **`README-zh.md`**: 项目说明文档

**统一架构：**
```
AI 客户端 ↔ Streamable HTTP ↔ Zotero 插件（集成 MCP 服务器）
```

这种设计消除了对单独 MCP 服务器进程的需求，提供了更加简化和高效的集成方式。

---

## 🚀 快速上手指南

本指南旨在帮助普通用户快速配置和使用 Zotero MCP，让您的 AI 助手能够与 Zotero 文献库无缝协作。

### 1. 快速使用教程（面向普通用户）

**Zotero MCP 是什么？**

简单来说，Zotero MCP 是一座桥梁，它连接了您的 AI 客户端（如 Cherry Studio, Gemini CLI, Claude Desktop 等）和本地的 Zotero 文献管理软件。通过它，AI 助手可以直接搜索、查询和引用您 Zotero 库中的文献，极大地提升学术研究和写作效率。

**两步快速开始：**

1.  **安装插件**：
    *   前往项目的 [Releases 页面](https://github.com/cookjohn/zotero-mcp/releases) 下载最新的 `zotero-mcp-plugin-x.x.x.xpi` 文件。
    *   在 Zotero 中，通过 `工具 -> 附加组件` 安装该 `.xpi` 文件。
    *   重启 Zotero。

2.  **配置插件**：
    *   在 Zotero 的 `首选项 -> Zotero MCP Plugin` 标签页中：
        - **启用服务器**：勾选此选项启动集成的 MCP 服务器
        - **端口设置**：默认为 `23120`（可根据需要修改）
        - **生成客户端配置**：点击此按钮获取适用于您 AI 客户端的配置代码
    *   将生成的配置代码复制到您的 AI 客户端配置文件中

配置完成后，您就可以在 AI 助手中通过自然语言与您的 Zotero 文献库进行交互了。

**配置示例（Claude Desktop）：**
```json
{
  "mcpServers": {
    "zotero": {
      "transport": "streamable_http",
      "url": "http://127.0.0.1:23120/mcp"
    }
  }
}
```

**使用示例:**

-   `"帮我查找一下我的 Zotero 库里所有关于"人工智能"的文献"`
-   `"获取去年由 Hinton 发表的关于 transformer 的期刊文章"`
-   `"查找 DOI 为 10.1038/nature14539 的文献"`

---

### 2. 连接 AI 客户端

**重要**：Zotero 插件现在包含了**集成的 MCP 服务器**，使用 Streamable HTTP 协议。无需安装单独的服务器。

#### Streamable HTTP 连接

插件使用 Streamable HTTP 协议，支持与 AI 客户端的实时双向通信：

1. 在 Zotero 插件设置中**启用服务器**
2. 点击**生成客户端配置**按钮
3. 将生成的配置**复制到您的 AI 客户端**

#### 支持的 AI 客户端

- **Claude Desktop**: Streamable HTTP MCP 支持
- **Cherry Studio**: Streamable HTTP 支持
- **Cursor IDE**: Streamable HTTP MCP 支持
- **自定义实现**: Streamable HTTP 协议

### 验证与故障排查

配置完成后，如何确认一切正常工作？

**1. 验证连接**

*   **查看客户端状态**：大多数 AI 客户端（如 ChatBox, Cherry Studio）的 MCP 配置界面会显示服务器的连接状态。如果显示为 "Connected" 或绿色指示灯，说明连接已成功建立。
*   **使用测试命令**：在 AI 助手的聊天框中，发送一个简单的测试命令，例如：
    `"使用 zotero 工具查找任何文献，返回一条即可"`
    如果 AI 能够调用 `zotero.search_library` 并返回结果，说明整个链路已通。

**2. 故障排查指南**

如果连接失败或工具不工作，请按以下步骤排查：

| 步骤 | 检查项 | 解决方案 |
| :--- | :--- | :--- |
| **1** | **Zotero 插件服务** | 确保 Zotero 正在运行，并且在 `首选项 -> Zotero MCP Plugin` 中，"Enable Server" 已被勾选。 |
| **2** | **路径配置** | 确认 AI 客户端中的 `command` 设置为 `node`，并且作为参数的 `index.js` **绝对路径**完全正确。路径错误是导致失败的最常见原因。 |
| **3** | **端口冲突** | 如果 Zotero 插件端口 `23119` 被占用，请在插件设置中更换端口，并在 `zotero-mcp-server` 目录下创建 `.env` 文件，内容为 `ZOTERO_API_PORT=新端口号`。 |
| **4** | **查看日志** | 大多数客户端都提供 MCP 服务器的日志输出功能。在 MCP 配置界面寻找 "Show Logs" 或类似的按钮。日志是定位问题的最有效工具，通常会明确指出是路径错误、命令失败还是其他问题。 |
| **5** | **防火墙/安全软件** | 确认您的防火墙或安全软件没有阻止 `node.exe` (Windows) 或 `node` (macOS/Linux) 的网络通信。 |
| **6** | **环境依赖** | 确保您的系统中已安装 Node.js (版本 18+)。您可以在终端中运行 `node -v` 来检查版本。 |

**3. 常见错误信息**

*   **`command not found` 或 `spawn ENOENT`**: 通常表示 `node` 命令不存在或路径错误。请检查 Node.js 是否已正确安装并加入了系统环境变量，或者检查客户端配置中的命令是否正确。
*   **`Error: connect ECONNREFUSED 127.0.0.1:23119`**: 表示 MCP 服务器无法连接到 Zotero 插件。请执行上述排查指南的第 1 步和第 3 步。
*   **JSON 格式错误**: 在手动编辑配置文件时，请确保您的 JSON 语法正确，没有遗漏逗号或括号。

如果以上步骤均无法解决问题，请前往 [GitHub Issues](https://github.com/cookjohn/zotero-mcp/issues) 页面，并附上您的操作系统、客户端版本和相关的日志信息，以便我们更好地帮助您。

---

## 🧩 插件功能特性

`zotero-mcp-plugin` 是一个集成了 MCP 服务器功能的 Zotero 插件，直接与 AI 客户端通信。

### 主要功能

-   **集成 MCP 服务器**: 内置 MCP 服务器，使用 Streamable HTTP 协议
-   **Streamable HTTP 协议**: 支持与 AI 客户端的实时双向通信
-   **高级搜索引擎**: 支持全文搜索，按标题、作者、年份、标签、文献类型等筛选
-   **文献集管理**: 浏览、搜索和检索指定文献集中的条目
-   **标签搜索系统**: 强大的标签查询功能（`any`、`all`、`none` 模式）及匹配选项
-   **PDF 处理**: 从 PDF 附件中提取全文，支持按页访问
-   **标注检索**: 提取 PDF 中的高亮、注释和笔记
-   **客户端配置生成器**: 自动为各种 AI 客户端生成配置
-   **安全性**: 仅本地操作，确保数据完全隐私
-   **用户友好**: 通过 Zotero 首选项界面轻松配置

---

## 效果展示

这里是一些展示 Zotero MCP 功能的截图：

| 功能 | 截图 |
| :--- | :---: |
| **功能说明** | ![功能说明](./IMG/功能说明.png) |
| **文献检索** | ![文献检索](./IMG/文献检索.png) |
| **元数据查看** | ![元数据查看](./IMG/元数据查看.png) |
| **全文读取 1** | ![全文读取 1](./IMG/全文读取1.png) |
| **全文读取 2** | ![全文读取 2](./IMG/全文读取2.png) |
| **附件检索 (Gemini CLI)** | ![附件检索](./IMG/geminicli-附件检索.png) |
| **PDF 读取 (Gemini CLI)** | ![PDF 读取](./IMG/geminicli-pdf读取.png) |

---

## 👨‍💻 开发者安装指南

### 前置要求

- **Zotero** 7.0 或更高版本
- **Node.js** 18.0 或更高版本（仅用于开发）
- **npm** 或 **yarn** 包管理器（仅用于开发）
- **Git**（仅用于开发）

### 步骤 1: 安装和配置 Zotero 插件

1. 前往项目的 [Releases 页面](https://github.com/cookjohn/zotero-mcp/releases) 下载最新的 `zotero-mcp-plugin-x.x.x.xpi` 文件
2. 在 Zotero 中，通过 `工具 -> 附加组件` 安装该 `.xpi` 文件
3. 在 Zotero 的 `首选项 -> Zotero MCP Plugin` 标签页中，配置服务器设置：
   - **启用服务器**：启动集成的 MCP 服务器
   - **端口设置**：默认为 `23120`
   - **生成客户端配置**：点击按钮获取适用于您 AI 客户端的配置

### 步骤 2: 开发环境设置（可选）

如果您想要修改或开发插件，可以按照以下步骤设置开发环境：

1. 克隆本仓库到本地：
   ```bash
   git clone https://github.com/cookjohn/zotero-mcp.git
   cd zotero-mcp
   ```

2. 设置插件开发环境：
   ```bash
   cd zotero-mcp-plugin
   npm install
   npm run build
   ```

3. 在 Zotero 中加载插件：
   ```bash
   # 开发模式（自动重载）
   npm run start
   
   # 或手动安装构建后的 .xpi 文件
   npm run build
   ```

### 步骤 3: 连接 AI 客户端

插件包含了集成的 MCP 服务器，使用 Streamable HTTP 协议：

**Streamable HTTP 连接示例（Claude Desktop）：**

1. 找到 Claude Desktop 配置文件：
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. 编辑配置文件：
   ```json
   {
     "mcpServers": {
       "zotero": {
         "transport": "streamable_http",
         "url": "http://127.0.0.1:23120/mcp"
       }
     }
   }
   ```

3. 重启 Claude Desktop 应用

### 步骤 4: 开始使用

配置完成后，您就可以在 AI 助手中通过自然语言与您的 Zotero 文献库进行交互了。

**示例:**

-   `"帮我查找一下我的 Zotero 库里所有关于“人工智能”的文献"`
-   `"获取去年由 Hinton 发表的关于 transformer 的期刊文章"`
-   `"查找 DOI 为 10.1038/nature14539 的文献"`

---

## 👨‍💻 开发者文档

### 技术架构

```
┌─────────────┐  Streamable HTTP  ┌──────────────────────────────┐
│ AI 客户端    │ <--------------> │ Zotero 插件（集成 MCP 服务器） │
│ (Claude, etc) │                   │ + 内置API + 数据访问        │
└─────────────┘                   └──────────────────────────────┘
```

1. **AI 客户端** 通过 Streamable HTTP 协议直接与插件通信
2. **Zotero 插件** 内置 MCP 服务器，处理 MCP 请求并调用 Zotero API
3. **数据处理** 在插件内部完成，无需额外进程
4. **响应返回** 直接发送给 AI 客户端

### 插件开发

1. 进入插件目录并安装依赖：
   ```bash
   cd zotero-mcp-plugin
   npm install
   ```
   
2. 启动开发模式：
   ```bash
   npm start
   ```
   这将启动 Zotero 并自动加载插件。代码更改时会自动重载。

3. 构建插件 `.xpi` 文件：
   ```bash
   npm run build
   ```

### MCP 服务器开发

MCP 服务器已集成在插件内，位于 `src/modules/streamableMCPServer.ts`。主要功能：

- Streamable HTTP 连接管理
- MCP 协议处理
- 工具调用路由
- 错误处理和日志记录

---

## 🔧 API 参考

`zotero-mcp-server` 提供了以下工具供 AI 助手调用：

### `search_library`

搜索 Zotero 文献库。

| 参数 | 类型 | 必需 | 描述 |
|---|---|---|---|
| `q` | string | 否 | 通用搜索关键词（标题、作者、年份） |
| `title` | string | 否 | 标题关键词 |
| `creator` | string | 否 | 作者姓名 |
| `year` | string | 否 | 年份或年份范围（如 "2020" 或 "2020-2024"） |
| `tag` | string | 否 | 标签，多个用逗号分隔 |
| `itemType` | string | 否 | 文献类型（如 "journalArticle", "book"） |
| `collectionKey` | string | 否 | 文献集 Key |
| `hasAttachment` | boolean | 否 | 是否有附件 |
| `hasNote` | boolean | 否 | 是否有笔记 |
| `limit` | number | 否 | 返回结果数量（最大 500，默认 100） |
| `offset` | number | 否 | 分页偏移量 |
| `sort` | string | 否 | 排序方式：relevance, title, creator, date, dateAdded, dateModified |
| `direction` | string | 否 | 排序方向：asc, desc |
| `fields` | string | 否 | 自定义返回字段，逗号分隔 |

### `get_item_details`

获取单个文献的完整信息。

| 参数 | 类型 | 必需 | 描述 |
|---|---|---|---|
| `itemKey` | string | 是 | 文献的唯一 Key |

### `find_item_by_identifier`

通过 DOI 或 ISBN 查找文献。

| 参数 | 类型 | 必需 | 描述 |
|---|---|---|---|
| `doi` | string | 否* | 文献的 DOI |
| `isbn` | string | 否* | 书籍的 ISBN |

*至少需要提供 `doi` 或 `isbn` 中的一个。

---

## 🐛 常见问题 (FAQ)

#### 1. 连接被拒绝错误

**问题**: `Error: connect ECONNREFUSED 127.0.0.1:PORT`
**解决方案**:
- 确保 Zotero 正在运行
- 检查 Zotero 插件是否已启用
- 在插件设置中检查服务器是否已启用
- 确认端口号（默认 23120）与 AI 客户端配置一致

#### 2. Streamable HTTP 连接失败

**问题**: `Streamable HTTP connection failed`
**解决方案**:
- 确保在插件设置中启用了服务器
- 检查防火墙设置，允许 Zotero 进行网络通信
- 确认 URL 格式正确：`http://127.0.0.1:23120/mcp`

#### 3. Claude Desktop 无法识别工具

**问题**: Claude 不显示 Zotero 相关工具
**解决方案**:
- 检查 `claude_desktop_config.json` 中的配置是否正确
- 确保使用了 `"transport": "streamable_http"` 配置
- 确保 JSON 格式正确
- 重启 Claude Desktop 应用

#### 4. 插件服务器无法启动

**问题**: 插件设置显示服务器启动失败
**解决方案**:
- 检查端口是否被占用，尝试更换端口
- 重启 Zotero 应用
- 查看 Zotero 错误控制台（`工具 -> 开发者 -> 错误控制台`）

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1.  Fork 本仓库。
2.  创建您的功能分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  开启一个 Pull Request。

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 授权。

## 🙏 致谢

- [Zotero](https://www.zotero.org/) - 优秀的开源文献管理工具。
- [Model Context Protocol](https://modelcontextprotocol.org/) - 实现 AI 工具集成的协议。
- [![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

