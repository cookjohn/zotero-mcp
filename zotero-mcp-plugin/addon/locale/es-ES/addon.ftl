startup-begin = El complemento se está cargando
startup-finish = El complemento está listo
menuitem-label = Plugin Zotero MCP: Ejemplos de ayuda
menupopup-label = Plugin Zotero MCP: Menú emergente
menuitem-submenulabel = Plugin Zotero MCP
menuitem-filemenulabel = Plugin Zotero MCP: Elemento de menú Archivo
prefs-title = Plugin Zotero MCP
prefs-table-title = Título
prefs-table-detail = Detalle
tabpanel-lib-tab-label = Pestaña de biblioteca
tabpanel-reader-tab-label = Pestaña de lector

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

config-guide-header = # Guía de configuración MCP de {$clientName}

config-guide-server-info = ## Información del servidor
config-guide-server-name = - **Nombre del servidor**: {$serverName}
config-guide-server-port = - **Puerto**: {$port}
config-guide-server-endpoint = - **Endpoint**: http://localhost:{$port}/mcp

config-guide-json-header = ## Fragmento de configuración
config-guide-steps-header = ## Pasos de configuración
config-guide-tools-header = ## Herramientas disponibles
config-guide-tools-list =
    - search_library - Buscar en la biblioteca de Zotero
    - get_item_details - Obtener detalles del elemento
    - get_item_fulltext - Obtener texto completo del elemento
    - search_fulltext - Búsqueda de texto completo
    - get_collections - Obtener lista de colecciones
    - search_annotations - Buscar anotaciones y resaltados
    - Y más...

config-guide-troubleshooting-header = ## Solución de problemas
config-guide-troubleshooting-list =
    1. Asegúrate de que Zotero esté ejecutándose
    2. Asegúrate de que el servidor MCP esté activado y ejecutándose en el puerto especificado
    3. Verifica la configuración del firewall
    4. Verifica que el formato del archivo de configuración sea correcto

config-guide-generated-time = Generado el: {$time}

# Menú contextual para indexación semántica
menu-semantic-index = Actualizar índice semántico
menu-semantic-index-selected = Indexar elementos seleccionados
menu-semantic-index-all = Indexar todos los elementos
menu-semantic-clear-selected = Limpiar índice de elementos seleccionados
menu-semantic-clear-selected-confirm = ¿Estás seguro de que deseas limpiar el índice semántico de los elementos seleccionados?
menu-semantic-clear-selected-done = Índice limpiado para
menu-semantic-items = elementos
menu-semantic-index-started = Indexación semántica iniciada
menu-semantic-index-completed = Indexación completada
menu-semantic-index-error = La indexación semántica falló
menu-semantic-index-no-collection = Por favor, selecciona una colección
menu-semantic-index-no-items = No hay elementos indexables

# Menú contextual de colección
menu-collection-semantic-index = Índice semántico
menu-collection-build-index = Construir índice
menu-collection-rebuild-index = Reconstruir índice
menu-collection-clear-index = Limpiar índice
menu-collection-clear-confirm = ¿Estás seguro de que deseas limpiar el índice semántico de esta colección?
menu-collection-index-cleared = Índice limpiado
