# Zotero MCP Plugin

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)

This plugin provides a Model Context Protocol (MCP) server for Zotero, allowing external tools to interact with Zotero data.

## Features

- Starts an HTTP server to handle MCP requests.
- Allows external tools to access and manipulate Zotero data.
- Configurable server port and enable/disable settings.

## Quick Start

1.  **Install the Plugin**: Download the latest `.xpi` file from the [releases page](https://github.com/your-github-name/repo-name/releases) and install it in Zotero.
2.  **Configure the Plugin**: Go to Zotero's preferences, find the "Zotero MCP Plugin" tab, and configure the server settings.
3.  **Enable the Server**: Check the "Enable Server" checkbox to start the MCP server.

## Development

This plugin is built using the [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template).

### Requirements

- [Zotero 7 Beta](https://www.zotero.org/support/beta_builds)
- [Node.js](https://nodejs.org/) (LTS version)
- [Git](https://git-scm.com/)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-github-name/repo-name.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm start
    ```

This will build the plugin and start Zotero with the plugin loaded. The plugin will automatically reload when you make changes to the source code.

### Build

To build the plugin for production, run:

```bash
npm run build
```

The packaged `.xpi` file will be in the `build/` directory.

## License

This plugin is licensed under the AGPL.
