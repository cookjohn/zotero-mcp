startup-begin = アドオンを読み込んでいます
startup-finish = アドオンの準備が完了しました
menuitem-label = Zotero MCP Plugin: ヘルパーサンプル
menupopup-label = Zotero MCP Plugin: メニューポップアップ
menuitem-submenulabel = Zotero MCP Plugin
menuitem-filemenulabel = Zotero MCP Plugin: ファイルメニュー項目
prefs-title = Zotero MCP Plugin
prefs-table-title = タイトル
prefs-table-detail = 詳細
tabpanel-lib-tab-label = ライブラリタブ
tabpanel-reader-tab-label = リーダータブ

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

config-guide-header = # {$clientName} MCP 設定ガイド

config-guide-server-info = ## サーバー情報
config-guide-server-name = - **サーバー名**: {$serverName}
config-guide-server-port = - **ポート**: {$port}
config-guide-server-endpoint = - **エンドポイント**: http://localhost:{$port}/mcp

config-guide-json-header = ## 設定スニペット
config-guide-steps-header = ## 設定手順
config-guide-tools-header = ## 利用可能なツール
config-guide-tools-list =
    - search_library - Zoteroライブラリを検索
    - get_item_details - アイテムの詳細を取得
    - get_item_fulltext - アイテムの全文コンテンツを取得
    - search_fulltext - 全文検索
    - get_collections - コレクション一覧を取得
    - search_annotations - 注釈とハイライトを検索
    - その他...

config-guide-troubleshooting-header = ## トラブルシューティング
config-guide-troubleshooting-list =
    1. Zoteroが起動していることを確認してください
    2. MCPサーバーが有効で、指定ポートで稼働していることを確認してください
    3. ファイアウォールの設定を確認してください
    4. 設定ファイルの形式が正しいことを確認してください

config-guide-generated-time = 生成日時: {$time}

# Context menu for semantic indexing
menu-semantic-index = セマンティックインデックスを更新
menu-semantic-index-selected = 選択したアイテムをインデックス
menu-semantic-index-all = すべてのアイテムをインデックス
menu-semantic-clear-selected = 選択したアイテムのインデックスをクリア
menu-semantic-clear-selected-confirm = 選択したアイテムのセマンティックインデックスをクリアしますか？
menu-semantic-clear-selected-done = インデックスをクリアしました:
menu-semantic-items = 件のアイテム
menu-semantic-index-started = セマンティックインデックスを開始しました
menu-semantic-index-completed = インデックス作成が完了しました
menu-semantic-index-error = セマンティックインデックスに失敗しました
menu-semantic-index-no-collection = コレクションを選択してください
menu-semantic-index-no-items = インデックス可能なアイテムがありません

# Collection context menu
menu-collection-semantic-index = セマンティックインデックス
menu-collection-build-index = インデックスを構築
menu-collection-rebuild-index = インデックスを再構築
menu-collection-clear-index = インデックスをクリア
menu-collection-clear-confirm = このコレクションのセマンティックインデックスをクリアしますか？
menu-collection-index-cleared = インデックスをクリアしました
