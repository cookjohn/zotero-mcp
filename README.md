# Zotero MCP - Model Context Protocol Integration for Zotero

Zotero MCP is an open-source project designed to seamlessly integrate powerful AI capabilities with the leading reference management tool, Zotero, through the Model Context Protocol (MCP). This project consists of two core components: a Zotero plugin and an MCP server, which work together to provide AI assistants (like Claude) with the ability to interact with your local Zotero library.
_This README is also available in: [:cn: 简体中文](./README-zh.md) | :gb: English._
[![GitHub](https://img.shields.io/badge/GitHub-zotero--mcp-blue?logo=github)](https://github.com/cookjohn/zotero-mcp)
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![Version](https://img.shields.io/badge/Version-1.4.3-brightgreen)]()
[![EN doc](https://img.shields.io/badge/Document-English-blue.svg)](README.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue.svg)](README-zh.md)

---
## Fork us on Wechat
 | MP | Forum |
| :--- | :---: |
| ![Reading PDF](./IMG/MP.jpg) | ![Contact us](./IMG/0317.jpg) |
## 📚 Project Overview

The Zotero MCP server is a tool server based on the Model Context Protocol that provides seamless integration with the Zotero reference management system for AI applications like Claude Desktop. Through this server, AI assistants can:

- 🔍 **Smart Search**: Multi-dimensional library search (title/creator/year/tags/fulltext/semantic) with boolean operators and relevance scoring
- 📖 **Content Extraction**: Extract PDF full-text, notes, abstracts, webpage snapshots with fine-grained mode control
- 📝 **Annotation Analysis**: Search and analyze PDF highlights and annotations by color, tags, and keywords
- 📂 **Collection Browsing**: Browse and search collection hierarchies, retrieve items within collections
- 🧠 **Semantic Search**: AI-powered concept matching via embedding vectors, discover related literature across languages
- ✏️ **Write Operations**: Create notes, manage tags, update metadata, create new items and attach PDFs
- 💾 **Full-text Database**: Access and search cached PDF full-text content

This enables AI assistants to help you with literature reviews, citation management, content analysis, annotation organization, knowledge base management, and more.

## 🚀 Project Structure

This project now features a **unified architecture** with an integrated MCP server:

- **`zotero-mcp-plugin/`**: A Zotero plugin with **integrated MCP server** that communicates directly with AI clients via Streamable HTTP protocol
- **`IMG/`**: Screenshots and documentation images
- **`README.md`** / **`README-zh.md`**: Documentation files

**Unified Architecture:**
```
AI Client ↔ Streamable HTTP ↔ Zotero Plugin (with integrated MCP server)
```

This eliminates the need for a separate MCP server process, providing a more streamlined and efficient integration.

---

## 🚀 Quick Start Guide

This guide is intended to help general users quickly configure and use Zotero MCP, enabling your AI assistant to work seamlessly with your Zotero library.

### 1. Installation (For General Users)

**What is Zotero MCP?**

Simply put, Zotero MCP is a bridge connecting your AI client (like Cherry Studio, Gemini CLI, Claude Desktop, etc.) and your local Zotero reference management software. It allows your AI assistant to directly search, query, and cite references from your Zotero library, greatly enhancing academic research and writing efficiency.

**Two-Step Quick Start:**

1.  **Install the Plugin**:
    *   Go to the project's [Releases Page](https://github.com/cookjohn/zotero-mcp/releases) to download the latest `zotero-mcp-plugin-x.x.x.xpi` file.
    *   In Zotero, install the `.xpi` file via `Tools -> Add-ons`.
    *   Restart Zotero.

2.  **Configure the Plugin**:
    *   In Zotero's `Preferences -> Zotero MCP Plugin` tab, configure your connection settings:
        - **Enable Server**: Start the integrated MCP server
        - **Port**: Default is `23120` (you can change this if needed)
        - **Generate Client Configuration**: Click this button to get configuration for your AI client

---

### 2. Connect to AI Clients

**Important**: The Zotero plugin now includes an **integrated MCP server** that uses the Streamable HTTP protocol. No separate server installation is needed.

#### Streamable HTTP Connection

The plugin uses Streamable HTTP, which enables real-time bidirectional communication with AI clients:

1. **Enable Server** in the Zotero plugin preferences
2. **Generate Client Configuration** by clicking the button in plugin preferences
3. **Copy the generated configuration** to your AI client

#### Supported AI Clients

- **Claude Desktop**: Streamable HTTP MCP support
- **Cherry Studio**: Streamable HTTP support
- **Cursor IDE**: Streamable HTTP MCP support
- **Custom implementations**: Streamable HTTP protocol

For detailed client-specific configuration instructions, see the [Chinese README](./README-zh.md).

---

## 👨‍💻 Developer Guide

### Prerequisites

- **Zotero** 7.0 or higher
- **Node.js** 18.0 or higher
- **npm** or **yarn**
- **Git**

### Step 1: Install and Configure the Zotero Plugin

1.  Download the latest `zotero-mcp-plugin.xpi` from the [Releases Page](https://github.com/cookjohn/zotero-mcp/releases).
2.  Install it in Zotero via `Tools -> Add-ons`.
3.  Enable the server in `Preferences -> Zotero MCP Plugin`.

### Step 2: Development Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/cookjohn/zotero-mcp.git
    cd zotero-mcp
    ```
    
2.  Set up the plugin development environment:
    ```bash
    cd zotero-mcp-plugin
    npm install
    npm run build
    ```
    
3.  Load the plugin in Zotero:
    ```bash
    # For development with auto-reload
    npm run start
    
    # Or install the built .xpi file manually
    npm run build
    ```

### Step 3: Connect AI Clients (Development)

The plugin includes an integrated MCP server that uses Streamable HTTP:

1.  **Enable the server** in Zotero plugin preferences
2.  **Generate client configuration** using the plugin's built-in generator
3.  **Configure your AI client** with the generated Streamable HTTP configuration

Example configuration for Claude Desktop:
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

---

## 🧩 Features

### `zotero-mcp-plugin` Features

-   **Integrated MCP Server**: Built-in MCP server using Streamable HTTP protocol, no separate process needed
-   **Advanced Search Engine**: Full-text search with boolean operators, relevance scoring, filtering by title, creator, year, tags, item type, and more
-   **Unified Content Extraction**: Extract content from PDFs, attachments, notes, abstracts, webpage snapshots with four modes (minimal/preview/standard/complete)
-   **Smart Annotation System**: Search and retrieve PDF highlights, annotations, and notes by color, tags, and keywords with intelligent ranking
-   **Collection Management**: Browse, search collection hierarchies, get collection details, subcollections, and item lists
-   **Semantic Search**: AI-powered semantic search using embedding vectors
    - Supports OpenAI and Ollama embedding APIs (auto-detection)
    - Vector indexing with SQLite-vec storage
    - Index status column in main library view
    - Collection/item context menu for index management
-   **Write Operations**: Create/modify notes, manage tags, update metadata fields, create new items and reparent standalone PDFs
-   **Full-text Database**: Cached PDF full-text database with list, search, get, and stats operations
-   **Standalone Attachment Management**: Search and manage standalone PDF items without parent metadata
-   **Client Configuration Generator**: Automatically generates configuration for various AI clients
-   **Security**: Local-only operation ensuring complete data privacy
-   **User-Friendly**: Easy configuration through Zotero preferences interface

---
## 📸 Screenshots

Here are some screenshots demonstrating the functionality of Zotero MCP:

| Feature | Screenshot |
| :--- | :---: |
| **Feature Demonstration** | ![Feature Demonstration](./IMG/功能说明.png) |
| **Literature Search** | ![Literature Search](./IMG/文献检索.png) |
| **Viewing Metadata** | ![Viewing Metadata](./IMG/元数据查看.png) |
| **Full-text Reading 1** | ![Full-text Reading 1](./IMG/全文读取1.png) |
| **Full-text Reading 2** | ![Full-text Reading 2](./IMG/全文读取2.png) |
| **Searching Attachments (Gemini CLI)** | ![Searching Attachments](./IMG/geminicli-附件检索.png) |
| **Reading PDF (Gemini CLI)** | ![Reading PDF](./IMG/geminicli-pdf读取.png) |

---


## 🔧 API Reference (MCP Tools)

The integrated MCP server provides **20 tools** in 5 categories:

### 1. Search & Query (7 tools)

#### `search_library`
Advanced library search with multi-dimensional filtering, boolean operators, relevance scoring, and intelligent mode control.
- `q`, `title`, `titleOperator`, `yearRange`, `fulltext`, `fulltextMode`, `itemType`, `includeAttachments`, `mode` (minimal/preview/standard/complete), `relevanceScoring`, `sort`, `limit`, `offset`

#### `search_annotations`
Search annotations by query, colors, or tags with intelligent ranking.
- `q`, `itemKeys`, `types` (note/highlight/annotation/ink/text/image), `colors`, `tags`, `mode`, `limit`, `offset`

#### `search_fulltext`
Full-text search across all document content with context snippets.
- `q` (required), `itemKeys`, `mode`, `contextLength`, `caseSensitive`

#### `search_collections`
Search collections by name. Params: `q`, `limit`.

#### `get_item_details`
Get complete metadata for a single item. Params: `itemKey` (required), `mode`.

#### `get_item_abstract`
Get item abstract/summary. Params: `itemKey` (required), `format` (json/text).

#### `get_content`
Unified content extraction: PDF full-text, notes, abstracts, webpage snapshots from items or specific attachments.
- `itemKey`, `attachmentKey`, `mode`, `include` (pdf/attachments/notes/abstract/webpage), `contentControl`, `format` (json/text)

### 2. Collection Management (4 tools)

#### `get_collections`
Get all collections. Params: `mode`, `limit`, `offset`.

#### `get_collection_details`
Get details of a specific collection. Params: `collectionKey` (required).

#### `get_collection_items`
Get items in a collection. Params: `collectionKey` (required), `limit`, `offset`.

#### `get_subcollections`
Get subcollections. Params: `collectionKey` (required), `limit`, `offset`, `recursive`.

### 3. Semantic Search (3 tools, can be disabled in preferences)

#### `semantic_search`
AI-powered semantic search using embedding vectors. Finds conceptually related content even without exact keyword matches.
- `query` (required), `topK`, `minScore`, `language` (zh/en/all)

#### `find_similar`
Find items semantically similar to a given item.
- `itemKey` (required), `topK`, `minScore`

#### `semantic_status`
Get semantic search service status and index statistics. No parameters required.

### 4. Full-text Database (1 tool)

#### `fulltext_database`
Access cached full-text content database (read-only).
- `action` (required: list/search/get/stats), `query`, `itemKeys`, `limit`

### 5. Write Operations (4 tools, can be disabled in preferences)

#### `write_note`
Create or modify Zotero notes. Supports Markdown auto-conversion to HTML.
- `action` (required: create/update/append), `parentKey`, `noteKey`, `content` (required), `tags`

#### `write_tag`
Add, remove, or replace tags on items.
- `action` (required: add/remove/set), `itemKey` (required), `tags` (required)

#### `write_metadata`
Update metadata fields on items (title, abstract, date, DOI, creators, etc.).
- `itemKey` (required), `fields`, `creators`

#### `write_item`
Create new items or reparent existing attachments.
- `action` (required: create/reparent), `itemType`, `fields`, `creators`, `tags`, `attachmentKeys`, `parentKey`

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests, report issues, or suggest enhancements.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

## 🙏 Acknowledgements

-   [Zotero](https://www.zotero.org/) - An excellent open-source reference management tool.
-   [Model Context Protocol](https://modelcontextprotocol.org/) - The protocol for AI tool integration.
-   [![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
Contact us 
![Contact us](./IMG/0317.jpg) 
