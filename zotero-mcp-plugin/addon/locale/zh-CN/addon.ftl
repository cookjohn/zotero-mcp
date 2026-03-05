startup-begin = 插件加载中
startup-finish = 插件已就绪
menuitem-label = Zotero MCP Plugin: 帮助工具样例
menupopup-label = Zotero MCP Plugin: 弹出菜单
menuitem-submenulabel = Zotero MCP Plugin：子菜单
menuitem-filemenulabel = Zotero MCP Plugin: 文件菜单
prefs-title = Zotero MCP Plugin
prefs-table-title = 标题
prefs-table-detail = 详情
tabpanel-lib-tab-label = 库标签
tabpanel-reader-tab-label = 阅读器标签

# 客户端配置说明
codex-cli-instructions =
    ══════════════════════════════════════════════════════════
      Codex CLI MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 方法 1：CLI 命令（推荐）
    ──────────────────────────────────────────────────────────
       codex mcp add zotero-mcp http://127.0.0.1:23120/mcp -t http

    ▶ 方法 2：TOML 配置文件
    ──────────────────────────────────────────────────────────
       1. 打开 ~/.codex/config.toml
       2. 将生成的 TOML 片段添加到 [mcp_servers] 下
       3. 保存后重启 Codex CLI 会话

    ▶ 验证
    ──────────────────────────────────────────────────────────
       1. 使用 `codex mcp list` 确认服务已注册
       2. 执行一次会调用 tools/list 或 Zotero 工具的请求

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ Zotero 正在运行
       ✓ MCP 插件服务已启用
       ✓ 127.0.0.1 端点可访问

    ══════════════════════════════════════════════════════════

claude-desktop-instructions =
    ══════════════════════════════════════════════════════════
      Claude Desktop MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置文件位置
    ──────────────────────────────────────────────────────────
       Windows: %APPDATA%\Claude\claude_desktop_config.json
       macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
       Linux: ~/.config/claude/claude_desktop_config.json

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 将生成的 JSON 配置复制到配置文件中
       2. 重启 Claude Desktop 应用
       3. 或在 设置 > 开发者 > MCP 服务器 中添加

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js (用于 npx mcp-remote)
       ✓ Zotero 必须正在运行
       ✓ MCP 服务器必须已启用

    ▶ 故障排除
    ──────────────────────────────────────────────────────────
       • 连接失败: 检查 Zotero 是否正在运行
       • npx 报错: 确保已安装 Node.js
       • 配置未生效: 重启 Claude Desktop

    ══════════════════════════════════════════════════════════

cline-vscode-instructions =
    ══════════════════════════════════════════════════════════
      Cline (VS Code) MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 方法 1: 通过界面配置
    ──────────────────────────────────────────────────────────
       1. 点击 Cline 面板底部的 'Configure MCP Servers'
       2. 或点击顶部导航栏的 'MCP Servers' 图标
       3. 选择 'Installed' 标签页
       4. 点击 'Advanced MCP Settings' 链接
       5. 将配置粘贴到 JSON 文件中

    ▶ 方法 2: 直接编辑配置文件
    ──────────────────────────────────────────────────────────
       配置文件位置: ~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js
       ✓ Zotero 必须正在运行
       ✓ alwaysAllow: ["*"] 可自动授权工具调用

    ══════════════════════════════════════════════════════════

continue-dev-instructions =
    ══════════════════════════════════════════════════════════
      Continue.dev MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置文件位置
    ──────────────────────────────────────────────────────────
       JSON: ~/.continue/config.json
       YAML: ~/.continue/config.yaml

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 将配置合并到 experimental.modelContextProtocolServers
       2. 保存配置文件
       3. 重新加载 Continue 扩展

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js
       ✓ Zotero 必须正在运行

    ══════════════════════════════════════════════════════════

cursor-instructions =
    ══════════════════════════════════════════════════════════
      Cursor MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置文件位置
    ──────────────────────────────────────────────────────────
       全局配置: ~/.cursor/mcp.json
       项目配置: .cursor/mcp.json (当前项目根目录)

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 将生成的 JSON 配置添加到 mcp.json
       2. 保存文件
       3. 重启 Cursor 编辑器

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js
       ✓ Zotero 必须正在运行

    ▶ 故障排除
    ──────────────────────────────────────────────────────────
       • 工具未显示: 尝试重启 Cursor
       • 连接超时: 检查 Zotero 是否运行

    ══════════════════════════════════════════════════════════

cherry-studio-instructions =
    ══════════════════════════════════════════════════════════
      Cherry Studio MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 打开 Cherry Studio 应用
       2. 进入 设置 > MCP Servers
       3. 点击 '添加服务器' 按钮
       4. 选择 '从 JSON 导入'
       5. 粘贴生成的配置
       6. 保存并返回对话页面

    ▶ 注意事项
    ──────────────────────────────────────────────────────────
       ✓ 使用 streamableHttp 传输类型
       ✓ 确保对话页面中 MCP 已启用
       ✓ Zotero 必须正在运行

    ══════════════════════════════════════════════════════════

gemini-cli-instructions =
    ══════════════════════════════════════════════════════════
      Gemini CLI MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置文件位置
    ──────────────────────────────────────────────────────────
       全局配置: ~/.gemini/settings.json
       项目配置: .gemini/settings.json

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 将生成的配置添加到 settings.json
       2. 使用 /mcp 命令验证服务器

    ▶ 配置说明
    ──────────────────────────────────────────────────────────
       • httpUrl: HTTP 端点地址
       • timeout: 请求超时时间 (毫秒)
       • trust: true 跳过工具确认提示

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ Zotero 必须正在运行
       ✓ 无需额外依赖

    ══════════════════════════════════════════════════════════

chatbox-instructions =
    ══════════════════════════════════════════════════════════
      Chatbox MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 打开 Chatbox 应用
       2. 进入 设置 > MCP 服务器配置
       3. 将生成的配置添加到 MCP 配置文件
       4. 确保 MCP 功能已启用
       5. 测试连接
       6. 保存设置并重启 Chatbox

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js
       ✓ Zotero 必须正在运行

    ══════════════════════════════════════════════════════════

trae-ai-instructions =
    ══════════════════════════════════════════════════════════
      Trae AI MCP 配置指南
    ══════════════════════════════════════════════════════════

    ▶ 配置步骤
    ──────────────────────────────────────────────────────────
       1. 按 Ctrl+U 打开 Agents 面板
       2. 点击齿轮图标 (AI Management)
       3. 选择 MCP > Configure Manually
       4. 粘贴生成的 JSON 配置
       5. 点击 Confirm 确认
       6. 重启 Trae 应用
       7. 从 Agents 列表选择 MCP 服务器

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ 需要安装 Node.js
       ✓ Zotero 必须正在运行

    ══════════════════════════════════════════════════════════

custom-http-instructions =
    ══════════════════════════════════════════════════════════
      通用 HTTP MCP 客户端配置
    ══════════════════════════════════════════════════════════

    ▶ 配置说明
    ──────────────────────────────────────────────────────────
       • transport.type: "http"
       • transport.endpoint: MCP 服务器地址
       • transport.method: "POST"

    ▶ 使用方法
    ──────────────────────────────────────────────────────────
       1. 根据客户端要求调整配置格式
       2. 确保客户端支持 HTTP MCP 传输
       3. 使用 curl POST 到 /mcp 端点验证连接

    ▶ 前提条件
    ──────────────────────────────────────────────────────────
       ✓ Zotero 必须正在运行
       ✓ 客户端必须支持 Streamable HTTP 传输

    ══════════════════════════════════════════════════════════

config-guide-header = # {$clientName} MCP 配置指南

config-guide-server-info = ## 服务器信息
config-guide-server-name = - **服务器名称**: {$serverName}
config-guide-server-port = - **端口**: {$port}
config-guide-server-endpoint = - **端点**: http://localhost:{$port}/mcp

config-guide-json-header = ## 配置片段
config-guide-steps-header = ## 配置步骤
config-guide-tools-header = ## 可用工具
config-guide-tools-list = 
    - search_library - 搜索 Zotero 文库
    - get_item_details - 获取文献详细信息
    - get_item_fulltext - 获取文献全文内容
    - search_fulltext - 全文搜索
    - get_collections - 获取收藏夹列表
    - search_annotations - 搜索注释和标注
    - 以及更多...

config-guide-troubleshooting-header = ## 故障排除
config-guide-troubleshooting-list = 
    1. 确保 Zotero 正在运行
    2. 确保 MCP 服务器已启用并在指定端口运行
    3. 检查防火墙设置
    4. 验证配置文件格式正确

config-guide-generated-time = 生成时间: {$time}

# 语义索引右键菜单
menu-semantic-index = 更新语义索引
menu-semantic-index-selected = 索引选中条目
menu-semantic-index-all = 索引所有条目
menu-semantic-clear-selected = 清除选中条目索引
menu-semantic-clear-selected-confirm = 确定要清除选中条目的语义索引吗？
menu-semantic-clear-selected-done = 已清除索引的条目数
menu-semantic-items = 条
menu-semantic-index-started = 语义索引已开始
menu-semantic-index-completed = 索引完成
menu-semantic-index-error = 语义索引失败
menu-semantic-index-no-collection = 请选择一个分类
menu-semantic-index-no-items = 没有可索引的条目

# 分类右键菜单
menu-collection-semantic-index = 语义索引
menu-collection-build-index = 构建索引
menu-collection-rebuild-index = 重建索引
menu-collection-clear-index = 清除索引
menu-collection-clear-confirm = 确定要清除该分类的语义索引吗？
menu-collection-index-cleared = 索引已清除
