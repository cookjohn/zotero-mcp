# Zotero MCP - Model Context Protocol Integration for Zotero

Zotero MCP is an open-source project designed to seamlessly integrate powerful AI capabilities with the leading reference management tool, Zotero, through the Model Context Protocol (MCP). This project consists of two core components: a Zotero plugin and an MCP server, which work together to provide AI assistants (like Claude) with the ability to interact with your local Zotero library.
_This README is also available in: [:cn: 简体中文](./README-zh.md) | :gb: English._
[![GitHub](https://img.shields.io/badge/GitHub-zotero--mcp-blue?logo=github)](https://github.com/cookjohn/zotero-mcp)
[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![Version](https://img.shields.io/badge/Version-1.0.0-brightgreen)]()
[![EN doc](https://img.shields.io/badge/Document-English-blue.svg)](README.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue.svg)](README-zh.md)

---

## 📚 Project Overview

The Zotero MCP server is a tool server based on the Model Context Protocol that provides seamless integration with the Zotero reference management system for AI applications like Claude Desktop. Through this server, AI assistants can:

- 🔍 Intelligently search your Zotero library
- 📖 Get detailed information about references
- 🏷️ Filter references by tags, creators, year, and more
- 🔗 Precisely locate references via identifiers like DOI and ISBN

This enables AI assistants to help you with academic tasks such as literature reviews, citation management, and research assistance.

## 🚀 Project Structure

This project is a monorepo containing the following two sub-projects:

1.  **`zotero-mcp-plugin`**: A Zotero plugin that runs an HTTP server within the Zotero client to expose APIs for interacting with the library.
2.  **`zotero-mcp-server`**: A standalone MCP server that acts as a bridge between the AI assistant and the `zotero-mcp-plugin`, converting MCP tool calls into requests to the Zotero plugin's API.

---

## 🚀 Quick Start Guide

This guide is intended to help general users quickly configure and use Zotero MCP, enabling your AI assistant to work seamlessly with your Zotero library.

### 1. Installation (For General Users)

**What is Zotero MCP?**

Simply put, Zotero MCP is a bridge connecting your AI client (like Cherry Studio, Gemini CLI, Claude Desktop, etc.) and your local Zotero reference management software. It allows your AI assistant to directly search, query, and cite references from your Zotero library, greatly enhancing academic research and writing efficiency.

**Three-Step Quick Start:**

1.  **Install the Plugin**:
    *   Go to the project's [Releases Page](https://github.com/cookjohn/zotero-mcp/releases) to download the latest `zotero-mcp-plugin.xpi` file.
    *   In Zotero, install the `.xpi` file via `Tools -> Add-ons`.
    *   Restart Zotero.

2.  **Start the Service**:
    *   In Zotero's `Preferences -> Zotero MCP Plugin` tab, check "Enable Server" to start the plugin's built-in HTTP server.
    *   Typically, you can keep the default port `23120`.

3.  **Connect Your AI Client**:
    *   Follow the guide below to configure the MCP server based on your AI client. You only need to download the `zotero-mcp-server` folder; no `npm install` or `build` operations are required for general users.

---

### 2. Configure the MCP Server

The easiest and most recommended way is to install the Zotero MCP Server globally via npm.

1.  **Install the Server**:
    *   Open your terminal (Terminal, Command Prompt, or PowerShell).
    *   Run the following command for global installation:
        ```bash
        npm install -g zotero-mcp
        ```
    *   NPM Package Page: [https://www.npmjs.com/package/zotero-mcp](https://www.npmjs.com/package/zotero-mcp)

2.  **Get the Server Script Path**:
    *   After installation, you need to find the full path to the `index.js` main script file of the `zotero-mcp` package.
    *   First, run the following command to find the npm global modules installation directory:
        ```bash
        npm root -g
        ```
    *   This command will output a path, for example, `C:\Users\YourUser\AppData\Roaming\npm\node_modules` (Windows) or `/home/user/.nvm/versions/node/v20.11.1/lib/node_modules` (macOS/Linux).
    *   Append `/zotero-mcp/build/index.js` to this path to get the full script path you need.
    *   **Final Path Example**: `C:\Users\YourUser\AppData\Roaming\npm\node_modules\zotero-mcp\build\index.js`

---

### 3. Connect to AI Clients

**Important**: The Zotero MCP Server is **automatically started** by your AI client when needed. You do **not** need to run any commands manually.

You need to configure `node` in your AI client to execute the **full script path** obtained in the previous step.

#### a) Cherry Studio Configuration

1.  **Open Settings**: Go to `Settings -> Advanced -> MCP Servers`.
2.  **Click "Import from JSON"** and paste the following:
    ```json
    {
      "zotero": {
        "command": "node",
        "args": ["/path/to/your/zotero-mcp/build/index.js"]
      }
    }
    ```
    **Important**:
    *   Replace `/path/to/your/zotero-mcp/build/index.js` with the **full script path** you obtained in **Step 2**.
    *   For Windows paths in JSON, use double backslashes `\\` for escaping (e.g., `C:\\Users\\...\\index.js`).

3.  **Save Configuration**.

#### b) Other Clients (Gemini CLI, Claude Desktop, etc.)

Configuration for other clients follows a similar pattern. Please refer to the [Chinese README](./README-zh.md) for detailed instructions for Gemini CLI, Claude Desktop, Cursor IDE, and ChatBox.

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

### Step 2: Install and Configure the MCP Server

**Option 1: Run from Source (Recommended for Development)**

1.  Clone the repository:
    ```bash
    git clone https://github.com/cookjohn/zotero-mcp.git
    cd zotero-mcp
    ```
2.  Install dependencies and build the server:
    ```bash
    cd zotero-mcp-server
    npm install
    npm run build
    ```
3.  Run the development server:
    ```bash
    npm start
    # Or run the built file directly
    node build/index.js
    ```

**Option 2: Use the Published NPM Package**

```bash
npm install -g zotero-mcp
# Then start with the 'zotero-mcp' command
```

### Step 3: Integrate with an AI Assistant (e.g., Claude Desktop)

1.  Locate the Claude Desktop configuration file (e.g., `%APPDATA%\Claude\claude_desktop_config.json` on Windows).
2.  Add the Zotero MCP server path:
    ```json
    {
      "mcpServers": {
        "zotero": {
          "command": "node",
          "args": ["/path/to/your/zotero-mcp/zotero-mcp-server/build/index.js"],
          "env": {}
        }
      }
    }
    ```
    **Note**: Replace `/path/to/your/zotero-mcp/` with your actual project path.
3.  Restart the Claude Desktop application.

---

## 🧩 Features

### `zotero-mcp-plugin` (Zotero Plugin)

-   **Built-in HTTP Server**: Runs a lightweight server inside Zotero.
-   **Data Access API**: Provides endpoints for secure access to Zotero data.
-   **Collection Management**: Browse, search, and retrieve items from specific collections.
-   **Advanced Tag Search**: Supports powerful tag queries (`any`, `all`, `none` modes) with matching options (`exact`, `contains`, `startsWith`).
-   **PDF Text Extraction**: Extracts full text or text from specific pages of PDF attachments.
-   **Configurability**: Easily configure server port and enable/disable the service in Zotero preferences.

### `zotero-mcp-server` (MCP Server)

-   **MCP Toolset**: Provides standardized tools (`search_library`, `get_item_details`) for AI assistants.
-   **Smart Search**: Supports full-text search and filtering by title, creator, year, tags, item type, etc.
-   **Identifier Lookup**: Quickly finds items by DOI, ISBN, etc.
-   **Protocol Conversion**: Translates MCP requests into HTTP API calls to the plugin.
-   **Local Operation**: Runs as a local process, ensuring data privacy.

---

## 🔧 API Reference

The `zotero-mcp-server` provides the following tools:

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
