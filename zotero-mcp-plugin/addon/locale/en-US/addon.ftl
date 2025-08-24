startup-begin = Addon is loading
startup-finish = Addon is ready
menuitem-label = Zotero MCP Plugin: Helper Examples
menupopup-label = Zotero MCP Plugin: Menupopup
menuitem-submenulabel = Zotero MCP Plugin
menuitem-filemenulabel = Zotero MCP Plugin: File Menuitem
prefs-title = Zotero MCP Plugin
prefs-table-title = Title
prefs-table-detail = Detail
tabpanel-lib-tab-label = Lib Tab
tabpanel-reader-tab-label = Reader Tab

# Client Configuration Instructions
claude-desktop-instructions = 
    1. Open Claude Desktop application
    2. Find configuration file path:
       - Windows: %APPDATA%\Claude\claude_desktop_config.json
       - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
       - Linux: ~/.config/claude/claude_desktop_config.json
    3. Add generated configuration to the file
    4. Restart Claude Desktop application
    5. Or add remote server in Settings > Connectors
    6. Ensure Zotero MCP server is running

cline-vscode-instructions = 
    1. Install Cline extension in VS Code
    2. Click 'Configure MCP Servers' button at bottom of Cline panel
    3. Or click 'MCP Servers' icon in top navigation
    4. Select 'Installed' tab, click 'Advanced MCP Settings' link
    5. Add generated configuration to JSON file
    6. Save configuration file
    7. Ensure Zotero MCP server is running

continue-dev-instructions = 
    1. Install Continue extension in VS Code
    2. Open Continue config file (~/.continue/config.json)
    3. Merge generated config into existing config's experimental section
    4. Or use YAML format (~/.continue/config.yaml):
       mcpServers:
       - name: zotero-mcp
         command: npx
         args: ["mcp-remote", "http://localhost:{port}/mcp"]
    5. Save configuration file
    6. Reload Continue extension
    7. Ensure Zotero MCP server is running

cursor-instructions = 
    1. Open Cursor editor
    2. Find configuration file path:
       - Global: ~/.cursor/mcp.json
       - Project: .cursor/mcp.json
    3. Add generated configuration to mcp.json file
    4. Save settings
    5. Restart Cursor
    6. Ensure Zotero MCP server is running

cherry-studio-instructions = 
    1. Open Cherry Studio application
    2. Go to Settings > MCP Servers
    3. Click 'Add Server' button
    4. Select 'Import from JSON'
    5. Paste generated JSON configuration into config box
    6. Save configuration
    7. Return to chat page, ensure MCP is enabled in chat page

gemini-cli-instructions = 
    1. Install Gemini CLI tool
    2. Find configuration file location:
       - Global config: ~/.gemini/settings.json
       - Project config: .gemini/settings.json
    3. Add generated configuration to settings.json file
    4. Configuration will automatically use StreamableHTTPClientTransport
    5. Use /mcp command to view configured servers
    6. Ensure Zotero MCP server is running

chatbox-instructions = 
    1. Open Chatbox application
    2. Go to Settings > MCP Server Configuration
    3. Add generated configuration to MCP config file
    4. Ensure MCP functionality is enabled
    5. Test connection
    6. Save settings
    7. Restart Chatbox
    8. Ensure Zotero MCP server is running

trae-ai-instructions = 
    1. Open Trae AI application
    2. Press Ctrl+U to open Agents panel
    3. Click gear icon (AI Management) ➜ MCP ➜ Configure Manually
    4. Paste generated JSON configuration into manual config window
    5. Click Confirm to confirm configuration
    6. Restart Trae application
    7. Select new MCP server from Agents list
    8. Ensure Zotero MCP server is running

custom-http-instructions = 
    1. Use this configuration as a template
    2. Adjust format according to your client requirements
    3. Ensure client supports HTTP MCP transport
    4. Set correct endpoint URL
    5. Test connection command can be used for verification
    6. Ensure Zotero MCP server is running

config-guide-header = # {$clientName} MCP Configuration Guide

config-guide-server-info = ## Server Information
config-guide-server-name = - **Server Name**: {$serverName}
config-guide-server-port = - **Port**: {$port}
config-guide-server-endpoint = - **Endpoint**: http://localhost:{$port}/mcp

config-guide-json-header = ## Configuration JSON
config-guide-steps-header = ## Configuration Steps
config-guide-tools-header = ## Available Tools
config-guide-tools-list = 
    - search_library - Search Zotero library
    - get_item_details - Get item details
    - get_item_fulltext - Get item full text content
    - search_fulltext - Full text search
    - get_collections - Get collections list
    - search_annotations - Search annotations and highlights
    - And more...

config-guide-troubleshooting-header = ## Troubleshooting
config-guide-troubleshooting-list = 
    1. Ensure Zotero is running
    2. Ensure MCP server is enabled and running on specified port
    3. Check firewall settings
    4. Verify configuration file format is correct

config-guide-generated-time = Generated at: {$time}