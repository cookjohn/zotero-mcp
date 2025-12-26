# Zotero MCP - Model Context Protocol Integration for Zotero

Zotero MCP is an open-source project designed to seamlessly integrate powerful AI capabilities with the leading reference management tool, Zotero, through the Model Context Protocol (MCP). This project consists of two core components: a Zotero plugin and an MCP server, which work together to provide AI assistants (like Claude) with the ability to interact with your local Zotero library.
_This README is also available in: [:cn: 简体中文](./README-zh.md) | :gb: English._
[![GitHub](https://img.shields.io/badge/GitHub-zotero--mcp-blue?logo=github)](https://github.com/cookjohn/zotero-mcp)
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![Version](https://img.shields.io/badge/Version-1.1.0-brightgreen)]()
[![EN doc](https://img.shields.io/badge/Document-English-blue.svg)](README.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue.svg)](README-zh.md)

---
## Fork us on Wechat
 | MP | Forum |
| :--- | :---: |
| ![Reading PDF](./IMG/MP.jpg) | ![Contact us](./IMG/微信图片_20251226192809_112_285.jpg) |
## 📚 Project Overview

The Zotero MCP server is a tool server based on the Model Context Protocol that provides seamless integration with the Zotero reference management system for AI applications like Claude Desktop. Through this server, AI assistants can:

- 🔍 Intelligently search your Zotero library
- 📖 Get detailed information about references
- 🏷️ Filter references by tags, creators, year, and more
- 🔗 Precisely locate references via identifiers like DOI and ISBN

This enables AI assistants to help you with academic tasks such as literature reviews, citation management, and research assistance.

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

-   **Integrated MCP Server**: Built-in MCP server using Streamable HTTP protocol
-   **Streamable HTTP Protocol**: Real-time bidirectional communication with AI clients
-   **Advanced Search Engine**: Full-text search with filtering by title, creator, year, tags, item type, etc.
-   **Collection Management**: Browse, search, and retrieve items from specific collections
-   **Tag Search System**: Powerful tag queries (`any`, `all`, `none` modes) with matching options (`exact`, `contains`, `startsWith`)
-   **PDF Processing**: Full-text extraction from PDF attachments with page-specific access
-   **Annotation Retrieval**: Extract highlights, notes, and annotations from PDFs
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


## 🔧 API Reference

The integrated MCP server provides the following tools:

### `search_library`

Searches the Zotero library. Supports parameters like `q`, `title`, `creator`, `year`, `tag`, `itemType`, `limit`, `sort`, etc.

### `get_item_details`

Retrieves full information for a single item.
-   **`itemKey`** (string, required): The unique key of the item.

### `find_item_by_identifier`

Finds an item by DOI or ISBN.
-   **`doi`** (string, optional)
-   **`isbn`** (string, optional)

*At least one identifier is required.*

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
![Contact us](./%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20250918120057_58_267.jpg) 
