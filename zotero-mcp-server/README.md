# Zotero MCP 服务器

[![MCP](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-ISC-yellow)](LICENSE)

一个连接 Zotero 文献管理系统的 Model Context Protocol (MCP) 服务器，让 AI 助手能够智能搜索和管理您的学术文献库。

## 📚 项目概述

Zotero MCP 服务器是一个基于 Model Context Protocol 的工具服务器，它为 Claude Desktop 等 AI 应用提供了与 Zotero 文献管理系统的无缝集成。通过此服务器，AI 助手可以：

- 🔍 智能搜索您的 Zotero 文献库
- 📖 获取文献的详细信息
- 🏷️ 按标签、作者、年份等多维度筛选文献
- 🔗 通过 DOI、ISBN 等标识符精确定位文献

这使得 AI 助手能够帮助您进行文献综述、引用管理、研究辅助等学术工作。

## ✨ 功能特性

### 核心工具

1. **`search_library`** - 高级文献搜索
   - 支持全文快速搜索
   - 按标题、作者、年份精确筛选
   - 支持标签和文献类型过滤
   - 可按相关性、日期等多种方式排序
   - 支持分页和自定义返回字段

2. **`get_item_details`** - 获取文献详情
   - 通过文献 Key 获取完整信息
   - 包含摘要、DOI、标签等所有元数据
   - 返回 Zotero URL 用于快速定位

3. **`find_item_by_identifier`** - 标识符查找
   - 通过 DOI 查找期刊文章
   - 通过 ISBN 查找书籍
   - 快速精确定位单个文献

### 特色功能

- 🚀 **高性能搜索**：直接连接本地 Zotero API，响应迅速
- 🎯 **精确过滤**：支持多条件组合查询
- 📊 **灵活输出**：可自定义返回字段，减少数据传输
- 🔒 **安全可靠**：仅限本地访问，保护您的文献数据

## 🛠️ 前置要求

### 系统要求

- **Node.js** 18.0 或更高版本
- **npm** 或 **yarn** 包管理器
- **Zotero** 7.0 或更高版本
- **Zotero Better Notes** 插件（提供 API 服务）

### Zotero 配置

1. 安装并启用 [Better Notes for Zotero](https://github.com/windingwind/zotero-better-notes) 插件
2. 在 Better Notes 设置中启用 API 服务器
3. 确保 API 服务器端口设置为 `23120`（默认）
4. 验证 API 服务器正在运行：
   ```bash
   curl http://localhost:23120/ping
   ```

## 📦 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/zotero-mcp-server.git
cd zotero-mcp-server
```

### 2. 安装依赖

```bash
npm install
```

### 3. 构建项目

```bash
npm run build
```

### 4. 验证安装

```bash
# 测试服务器是否可以启动
npm start
```

如果看到 "Starting Zotero MCP server..." 消息，说明安装成功。

## ⚙️ 配置说明

### Claude Desktop 集成

1. 找到 Claude Desktop 配置文件：
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. 编辑配置文件，添加 Zotero MCP 服务器：

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["E:/plugin4zotero/zotero-mcp-server/build/index.js"],
      "env": {}
    }
  }
}
```

注意：将路径替换为您的实际安装路径。

3. 重启 Claude Desktop 应用

4. 验证连接：在 Claude 中输入：
   ```
   搜索我的 Zotero 文献库中关于 "machine learning" 的文章
   ```

### 其他 MCP 客户端

对于支持 stdio 传输的 MCP 客户端，使用以下命令启动服务器：

```bash
node /path/to/zotero-mcp-server/build/index.js
```

## 📖 使用示例

### 基础搜索

```text
用户：帮我找找 Zotero 中所有关于深度学习的文献

助手将使用 search_library 工具：
{
  "q": "深度学习"
}
```

### 高级搜索

```text
用户：查找 2020 年后 Hinton 发表的关于 transformer 的期刊文章

助手将使用 search_library 工具：
{
  "creator": "Hinton",
  "title": "transformer",
  "year": "2020-2024",
  "itemType": "journalArticle"
}
```

### 获取文献详情

```text
用户：给我 key 为 ABCD1234 的文献的完整信息

助手将使用 get_item_details 工具：
{
  "itemKey": "ABCD1234"
}
```

### 通过 DOI 查找

```text
用户：查找 DOI 为 10.1038/nature14539 的文献

助手将使用 find_item_by_identifier 工具：
{
  "doi": "10.1038/nature14539"
}
```

## 🔧 API 工具参考

### search_library

搜索 Zotero 文献库。

**参数：**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
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

**返回示例：**

```json
{
  "query": {
    "q": "machine learning",
    "limit": "10"
  },
  "pagination": {
    "total": 127,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  },
  "searchTime": "150ms",
  "results": [
    {
      "index": 1,
      "key": "QWERTYUI",
      "itemType": "journalArticle",
      "title": "Foundations of Machine Learning",
      "creators": "Doe J, Smith J",
      "year": "2022",
      "zoteroUrl": "zotero://select/library/items/QWERTYUI"
    }
  ]
}
```

### get_item_details

获取单个文献的完整信息。

**参数：**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `itemKey` | string | 是 | 文献的唯一 Key |

**返回示例：**

```json
{
  "key": "ABCDEFGH",
  "itemType": "journalArticle",
  "title": "The Art of Building Zotero Plugins",
  "creators": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "creatorType": "author"
    }
  ],
  "abstractNote": "An in-depth guide...",
  "date": "2024",
  "doi": "10.1000/xyz123",
  "tags": ["zotero", "development", "api"],
  "zoteroUrl": "zotero://select/library/items/ABCDEFGH"
}
```

### find_item_by_identifier

通过 DOI 或 ISBN 查找文献。

**参数：**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `doi` | string | 否* | 文献的 DOI |
| `isbn` | string | 否* | 书籍的 ISBN |

*至少需要提供 `doi` 或 `isbn` 中的一个。

## 🐛 故障排除

### 常见问题

#### 1. 连接被拒绝错误

**问题**：`Error: connect ECONNREFUSED 127.0.0.1:23120`

**解决方案**：
- 确保 Zotero 正在运行
- 检查 Better Notes 插件是否已安装并启用
- 验证 API 服务器端口是否为 23120
- 尝试访问 http://localhost:23120/ping 测试连接

#### 2. 服务器启动失败

**问题**：`Failed to start server`

**解决方案**：
- 检查 Node.js 版本是否 >= 18.0
- 确保已运行 `npm install` 安装依赖
- 确保已运行 `npm run build` 构建项目
- 检查是否有其他进程占用相同端口

#### 3. Claude Desktop 无法识别工具

**问题**：Claude 不显示 Zotero 相关工具

**解决方案**：
- 检查配置文件路径是否正确
- 确保 JSON 格式正确（使用 JSON 验证工具）
- 重启 Claude Desktop
- 查看 Claude Desktop 日志获取详细错误信息

#### 4. 搜索结果为空

**问题**：搜索总是返回空结果

**解决方案**：
- 确保 Zotero 库中有相关文献
- 检查搜索参数拼写是否正确
- 尝试使用更宽泛的搜索条件
- 验证 Better Notes API 设置中的默认返回字段

### 调试技巧

1. **启用详细日志**：
   ```bash
   DEBUG=* node build/index.js
   ```

2. **测试 Zotero API**：
   ```bash
   # 测试连接
   curl http://localhost:23120/ping
   
   # 测试搜索
   curl "http://localhost:23120/search?q=test"
   ```

3. **检查 MCP 连接**：
   在 Claude 中输入：
   ```
   显示当前可用的 MCP 工具
   ```

## 🏗️ 技术架构

### 技术栈

- **运行时**：Node.js 18+
- **语言**：TypeScript 5.4
- **MCP SDK**：@modelcontextprotocol/sdk
- **验证**：Zod schema validation
- **传输协议**：stdio (标准输入/输出)

### 工作原理

```
┌─────────────┐     MCP      ┌─────────────┐     HTTP      ┌─────────────┐
│   Claude    │<------------>│  MCP Server │<------------>│  Zotero API │
│   Desktop   │    stdio     │  (本项目)    │   localhost  │  (端口23120) │
└─────────────┘              └─────────────┘              └─────────────┘
```

1. **Claude Desktop** 通过 stdio 协议与 MCP 服务器通信
2. **MCP 服务器** 将工具调用转换为 HTTP 请求
3. **Zotero API** (Better Notes 提供) 处理请求并返回数据
4. 数据流向相反方向返回给用户

### 项目结构

```
zotero-mcp-server/
├── src/
│   └── index.ts         # 主服务器实现
├── build/
│   └── index.js         # 编译后的 JavaScript
├── package.json         # 项目配置
├── tsconfig.json        # TypeScript 配置
├── README.md           # 本文档
└── zotero_api.md       # Zotero API 详细文档
```

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建您的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 📄 许可证

本项目基于 ISC 许可证开源。查看 [LICENSE](LICENSE) 文件了解更多信息。

## 🙏 致谢

- [Zotero](https://www.zotero.org/) - 优秀的开源文献管理工具
- [Better Notes for Zotero](https://github.com/windingwind/zotero-better-notes) - 提供 API 服务支持
- [Model Context Protocol](https://modelcontextprotocol.org/) - 实现 AI 工具集成的协议
- [Anthropic](https://www.anthropic.com/) - Claude AI 的开发者

## 📮 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 [GitHub Issue](https://github.com/your-username/zotero-mcp-server/issues)
- 发送邮件至：your-email@example.com

---

**让 AI 成为您的学术研究助手！** 🎓✨