startup-begin = Chargement de l'extension
startup-finish = L'extension est prete
menuitem-label = Plugin Zotero MCP : Exemples d'aide
menupopup-label = Plugin Zotero MCP : Menu contextuel
menuitem-submenulabel = Plugin Zotero MCP
menuitem-filemenulabel = Plugin Zotero MCP : Element du menu Fichier
prefs-title = Plugin Zotero MCP
prefs-table-title = Titre
prefs-table-detail = Detail
tabpanel-lib-tab-label = Onglet Bibliotheque
tabpanel-reader-tab-label = Onglet Lecteur

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

config-guide-header = # Guide de configuration MCP pour {$clientName}

config-guide-server-info = ## Informations du serveur
config-guide-server-name = - **Nom du serveur** : {$serverName}
config-guide-server-port = - **Port** : {$port}
config-guide-server-endpoint = - **Point d'acces** : http://localhost:{$port}/mcp

config-guide-json-header = ## Extrait de configuration
config-guide-steps-header = ## Etapes de configuration
config-guide-tools-header = ## Outils disponibles
config-guide-tools-list =
    - search_library - Rechercher dans la bibliotheque Zotero
    - get_item_details - Obtenir les details d'un element
    - get_item_fulltext - Obtenir le texte integral d'un element
    - search_fulltext - Recherche en texte integral
    - get_collections - Obtenir la liste des collections
    - search_annotations - Rechercher les annotations et surlignages
    - Et plus encore...

config-guide-troubleshooting-header = ## Depannage
config-guide-troubleshooting-list =
    1. Assurez-vous que Zotero est en cours d'execution
    2. Assurez-vous que le serveur MCP est active et fonctionne sur le port specifie
    3. Verifiez les parametres du pare-feu
    4. Verifiez que le format du fichier de configuration est correct

config-guide-generated-time = Genere le : {$time}

# Context menu for semantic indexing
menu-semantic-index = Mettre a jour l'index semantique
menu-semantic-index-selected = Indexer les elements selectionnes
menu-semantic-index-all = Indexer tous les elements
menu-semantic-clear-selected = Effacer l'index des elements selectionnes
menu-semantic-clear-selected-confirm = Etes-vous sur de vouloir effacer l'index semantique des elements selectionnes ?
menu-semantic-clear-selected-done = Index efface pour
menu-semantic-items = elements
menu-semantic-index-started = Indexation semantique demarree
menu-semantic-index-completed = Indexation terminee
menu-semantic-index-error = Echec de l'indexation semantique
menu-semantic-index-no-collection = Veuillez selectionner une collection
menu-semantic-index-no-items = Aucun element indexable

# Collection context menu
menu-collection-semantic-index = Index semantique
menu-collection-build-index = Construire l'index
menu-collection-rebuild-index = Reconstruire l'index
menu-collection-clear-index = Effacer l'index
menu-collection-clear-confirm = Etes-vous sur de vouloir effacer l'index semantique de cette collection ?
menu-collection-index-cleared = Index efface
