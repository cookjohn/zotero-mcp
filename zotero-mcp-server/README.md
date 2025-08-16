# Zotero MCP Server

A Model Context Protocol (MCP) server for interacting with the Zotero reference manager. This server allows AI agents and other MCP clients to access and manipulate your Zotero library programmatically.

## Prerequisites

- **Zotero**: The Zotero desktop application must be running.
- **HTTP Server**: The Zotero instance must have an active HTTP server. This is typically achieved by installing a Zotero plugin that provides this functionality, such as the `zotero-mcp-plugin`.

## Installation

To install the server as a command-line tool, use npm:

```bash
npm install -g zotero-mcp
```

## Usage

Once installed, you can run the server from your terminal:

```bash
zotero-mcp-server
```

The server will start and listen for connections from MCP clients. In your MCP client configuration, you will need to add this server, typically by providing the command used to launch it.

**Example Client Configuration:**

```json
{
  "servers": [
    {
      "name": "zotero",
      "command": ["zotero-mcp-server"]
    }
  ]
}
```

## Available Tools

The server provides the following tools to interact with Zotero:

- `ping`: Check the connection to the Zotero instance.
- `search`: Search for items in the Zotero library.
- `get_item_by_key`: Retrieve a specific item by its unique key.
- `get_collection_items`: List all items within a specific collection.
- `get_collections`: List all collections in the library.
- `get_pdf_text`: Extract text content from a PDF attachment of a Zotero item.

## License

This project is licensed under the [MIT License](LICENSE).