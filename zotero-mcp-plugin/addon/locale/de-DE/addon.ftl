startup-begin = Addon wird geladen
startup-finish = Addon ist bereit
menuitem-label = Zotero MCP Plugin: Hilfsbeispiele
menupopup-label = Zotero MCP Plugin: Menüpopup
menuitem-submenulabel = Zotero MCP Plugin
menuitem-filemenulabel = Zotero MCP Plugin: Datei-Menüeintrag
prefs-title = Zotero MCP Plugin
prefs-table-title = Titel
prefs-table-detail = Details
tabpanel-lib-tab-label = Bibliothek-Tab
tabpanel-reader-tab-label = Reader-Tab

# Client Configuration Instructions
codex-cli-instructions =
    ══════════════════════════════════════════════════════════
      Codex CLI MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Method 1: CLI Command (Recommended)
    ──────────────────────────────────────────────────────────
       codex mcp add zotero-mcp http://127.0.0.1:23120/mcp -t http

    ▶ Method 2: TOML Configuration File
    ──────────────────────────────────────────────────────────
       1. Open ~/.codex/config.toml
       2. Add the generated TOML snippet under [mcp_servers]
       3. Keep the headers block:
          [mcp_servers."zotero-mcp".headers]
          "Content-Type" = "application/json"
       4. Save and restart Codex CLI session

    ▶ Method 3: Unified config with Claude Code / cc-switch
    ──────────────────────────────────────────────────────────
       1. Keep the same HTTP endpoint and Content-Type header
       2. Claude Code style JSON with headers is also compatible
       3. Use one shared zotero-mcp server definition across clients

    ▶ Verification
    ──────────────────────────────────────────────────────────
       1. Use 'codex mcp list' to confirm the server is registered
       2. Run a prompt that calls tools/list or a Zotero tool

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Zotero must be running
       ✓ MCP plugin server must be enabled
       ✓ Endpoint should be reachable at 127.0.0.1

    ══════════════════════════════════════════════════════════

claude-desktop-instructions =
    ══════════════════════════════════════════════════════════
      Claude Desktop MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration File Location
    ──────────────────────────────────────────────────────────
       Windows: %APPDATA%\Claude\claude_desktop_config.json
       macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
       Linux: ~/.config/claude/claude_desktop_config.json

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Copy the generated JSON config to config file
       2. Restart Claude Desktop application
       3. Or add in Settings > Developer > MCP Servers

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required (for npx mcp-remote)
       ✓ Zotero must be running
       ✓ MCP server must be enabled

    ▶ Troubleshooting
    ──────────────────────────────────────────────────────────
       • Connection failed: Check if Zotero is running
       • npx error: Ensure Node.js is installed
       • Config not applied: Restart Claude Desktop

    ══════════════════════════════════════════════════════════

cline-vscode-instructions =
    ══════════════════════════════════════════════════════════
      Cline (VS Code) MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Method 1: Via UI
    ──────────────────────────────────────────────────────────
       1. Click 'Configure MCP Servers' at bottom of Cline panel
       2. Or click 'MCP Servers' icon in top navigation
       3. Select 'Installed' tab
       4. Click 'Advanced MCP Settings' link
       5. Paste config into JSON file

    ▶ Method 2: Direct Config Edit
    ──────────────────────────────────────────────────────────
       Config location: ~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required
       ✓ Zotero must be running
       ✓ alwaysAllow: ["*"] auto-approves tool calls

    ══════════════════════════════════════════════════════════

continue-dev-instructions =
    ══════════════════════════════════════════════════════════
      Continue.dev MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration File Location
    ──────────────────────────────────────────────────────────
       JSON: ~/.continue/config.json
       YAML: ~/.continue/config.yaml

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Merge config into experimental.modelContextProtocolServers
       2. Save configuration file
       3. Reload Continue extension

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required
       ✓ Zotero must be running

    ══════════════════════════════════════════════════════════

cursor-instructions =
    ══════════════════════════════════════════════════════════
      Cursor MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration File Location
    ──────────────────────────────────────────────────────────
       Global config: ~/.cursor/mcp.json
       Project config: .cursor/mcp.json (in project root)

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Add generated JSON config to mcp.json
       2. Save file
       3. Restart Cursor editor

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required
       ✓ Zotero must be running

    ▶ Troubleshooting
    ──────────────────────────────────────────────────────────
       • Tools not showing: Try restarting Cursor
       • Connection timeout: Check if Zotero is running

    ══════════════════════════════════════════════════════════

cherry-studio-instructions =
    ══════════════════════════════════════════════════════════
      Cherry Studio MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Open Cherry Studio application
       2. Go to Settings > MCP Servers
       3. Click 'Add Server' button
       4. Select 'Import from JSON'
       5. Paste generated configuration
       6. Save and return to chat page

    ▶ Notes
    ──────────────────────────────────────────────────────────
       ✓ Uses streamableHttp transport type
       ✓ Ensure MCP is enabled in chat page
       ✓ Zotero must be running

    ══════════════════════════════════════════════════════════

gemini-cli-instructions =
    ══════════════════════════════════════════════════════════
      Gemini CLI MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration File Location
    ──────────────────────────────────────────────────────────
       Global config: ~/.gemini/settings.json
       Project config: .gemini/settings.json

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Add generated config to settings.json
       2. Use /mcp command to verify server

    ▶ Configuration Options
    ──────────────────────────────────────────────────────────
       • httpUrl: HTTP endpoint address
       • timeout: Request timeout in milliseconds
       • trust: true to skip tool confirmation prompts

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Zotero must be running
       ✓ No additional dependencies required

    ══════════════════════════════════════════════════════════

chatbox-instructions =
    ══════════════════════════════════════════════════════════
      Chatbox MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Open Chatbox application
       2. Go to Settings > MCP Server Configuration
       3. Add generated config to MCP config file
       4. Ensure MCP functionality is enabled
       5. Test connection
       6. Save settings and restart Chatbox

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required
       ✓ Zotero must be running

    ══════════════════════════════════════════════════════════

trae-ai-instructions =
    ══════════════════════════════════════════════════════════
      Trae AI MCP Configuration Guide
    ══════════════════════════════════════════════════════════

    ▶ Configuration Steps
    ──────────────────────────────────────────────────────────
       1. Press Ctrl+U to open Agents panel
       2. Click gear icon (AI Management)
       3. Select MCP > Configure Manually
       4. Paste generated JSON configuration
       5. Click Confirm
       6. Restart Trae application
       7. Select MCP server from Agents list

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Node.js required
       ✓ Zotero must be running

    ══════════════════════════════════════════════════════════

custom-http-instructions =
    ══════════════════════════════════════════════════════════
      Generic HTTP MCP Client Configuration
    ══════════════════════════════════════════════════════════

    ▶ Configuration Options
    ──────────────────────────────────────────────────────────
       • transport.type: "http"
       • transport.endpoint: MCP server address
       • transport.method: "POST"

    ▶ Usage
    ──────────────────────────────────────────────────────────
       1. Adjust config format per client requirements
       2. Ensure client supports HTTP MCP transport
       3. Use curl POST to /mcp endpoint to verify connection

    ▶ Prerequisites
    ──────────────────────────────────────────────────────────
       ✓ Zotero must be running
       ✓ Client must support Streamable HTTP transport

    ══════════════════════════════════════════════════════════

config-guide-header = # {$clientName} MCP-Konfigurationsanleitung

config-guide-server-info = ## Serverinformationen
config-guide-server-name = - **Servername**: {$serverName}
config-guide-server-port = - **Port**: {$port}
config-guide-server-endpoint = - **Endpunkt**: http://localhost:{$port}/mcp

config-guide-json-header = ## Konfigurationsausschnitt
config-guide-steps-header = ## Konfigurationsschritte
config-guide-tools-header = ## Verfügbare Tools
config-guide-tools-list =
    - search_library - Zotero-Bibliothek durchsuchen
    - get_item_details - Elementdetails abrufen
    - get_item_fulltext - Volltext des Elements abrufen
    - search_fulltext - Volltextsuche
    - get_collections - Sammlungsliste abrufen
    - search_annotations - Annotationen und Markierungen durchsuchen
    - Und mehr...

config-guide-troubleshooting-header = ## Fehlerbehebung
config-guide-troubleshooting-list =
    1. Stellen Sie sicher, dass Zotero läuft
    2. Stellen Sie sicher, dass der MCP-Server aktiviert ist und auf dem angegebenen Port läuft
    3. Überprüfen Sie die Firewall-Einstellungen
    4. Überprüfen Sie, ob das Format der Konfigurationsdatei korrekt ist

config-guide-generated-time = Generiert am: {$time}

# Kontextmenü für semantische Indizierung
menu-semantic-index = Semantischen Index aktualisieren
menu-semantic-index-selected = Ausgewählte Elemente indizieren
menu-semantic-index-all = Alle Elemente indizieren
menu-semantic-clear-selected = Index ausgewählter Elemente löschen
menu-semantic-clear-selected-confirm = Möchten Sie wirklich den semantischen Index für die ausgewählten Elemente löschen?
menu-semantic-clear-selected-done = Index gelöscht für
menu-semantic-items = Elemente
menu-semantic-index-started = Semantische Indizierung gestartet
menu-semantic-index-completed = Indizierung abgeschlossen
menu-semantic-index-error = Semantische Indizierung fehlgeschlagen
menu-semantic-index-no-collection = Bitte wählen Sie eine Sammlung aus
menu-semantic-index-no-items = Keine indizierbaren Elemente vorhanden

# Sammlungs-Kontextmenü
menu-collection-semantic-index = Semantischer Index
menu-collection-build-index = Index aufbauen
menu-collection-rebuild-index = Index neu aufbauen
menu-collection-clear-index = Index löschen
menu-collection-clear-confirm = Möchten Sie wirklich den semantischen Index für diese Sammlung löschen?
menu-collection-index-cleared = Index gelöscht
