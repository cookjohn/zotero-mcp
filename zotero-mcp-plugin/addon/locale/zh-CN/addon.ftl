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
claude-desktop-instructions = 
    1. 打开 Claude Desktop 应用
    2. 找到配置文件路径：
       - Windows: %APPDATA%\Claude\claude_desktop_config.json
       - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
       - Linux: ~/.config/claude/claude_desktop_config.json
    3. 将生成的配置添加到该文件中
    4. 重启 Claude Desktop 应用
    5. 或者在设置 > 连接器中添加远程服务器
    6. 确保 Zotero MCP 服务器正在运行

cline-vscode-instructions = 
    1. 在 VS Code 中安装 Cline 扩展
    2. 点击 Cline 面板底部的 'Configure MCP Servers' 按钮
    3. 或点击顶部导航栏的 'MCP Servers' 图标
    4. 选择 'Installed' 标签页，点击 'Advanced MCP Settings' 链接
    5. 将生成的配置添加到 JSON 文件中
    6. 保存配置文件
    7. 确保 Zotero MCP 服务器正在运行

continue-dev-instructions = 
    1. 在 VS Code 中安装 Continue 扩展
    2. 打开 Continue 配置文件 (~/.continue/config.json)
    3. 将生成的配置合并到现有配置的 experimental 部分
    4. 或者使用 YAML 格式 (~/.continue/config.yaml):
       mcpServers:
       - name: zotero-mcp
         command: npx
         args: ["mcp-remote", "http://localhost:{port}/mcp"]
    5. 保存配置文件
    6. 重新加载 Continue 扩展
    7. 确保 Zotero MCP 服务器正在运行

cursor-instructions = 
    1. 打开 Cursor 编辑器
    2. 找到配置文件路径：
       - 全局: ~/.cursor/mcp.json
       - 项目: .cursor/mcp.json
    3. 将生成的配置添加到 mcp.json 文件中
    4. 保存设置
    5. 重启 Cursor
    6. 确保 Zotero MCP 服务器正在运行

cherry-studio-instructions = 
    1. 打开 Cherry Studio 应用
    2. 进入设置 > MCP Servers
    3. 点击'添加服务器'按钮
    4. 选择'从JSON导入'
    5. 将生成的JSON配置粘贴到配置框中
    6. 保存配置
    7. 返回对话页面，确保对话页面中MCP启用

gemini-cli-instructions = 
    1. 安装 Gemini CLI 工具
    2. 找到配置文件位置：
       - 全局配置: ~/.gemini/settings.json
       - 项目配置: .gemini/settings.json
    3. 将生成的配置添加到 settings.json 文件中
    4. 配置会自动使用 StreamableHTTPClientTransport
    5. 使用 /mcp 命令查看已配置的服务器
    6. 确保 Zotero MCP 服务器正在运行

chatbox-instructions = 
    1. 打开 Chatbox 应用
    2. 进入设置 > MCP 服务器配置
    3. 将生成的配置添加到 MCP 配置文件中
    4. 确保 MCP 功能已启用
    5. 测试连接
    6. 保存设置
    7. 重启 Chatbox
    8. 确保 Zotero MCP 服务器正在运行

trae-ai-instructions = 
    1. 打开 Trae AI 应用
    2. 按 Ctrl+U 打开 Agents 面板
    3. 点击齿轮图标 (AI Management) ➜ MCP ➜ Configure Manually
    4. 将生成的 JSON 配置粘贴到手动配置窗口中
    5. 点击 Confirm 确认配置
    6. 重启 Trae 应用
    7. 从 Agents 列表中选择新的 MCP 服务器
    8. 确保 Zotero MCP 服务器正在运行

custom-http-instructions = 
    1. 使用此配置作为模板
    2. 根据你的客户端要求调整格式
    3. 确保客户端支持 HTTP MCP 传输
    4. 设置正确的端点 URL
    5. 测试连接命令可用于验证
    6. 确保 Zotero MCP 服务器正在运行

config-guide-header = # {$clientName} MCP 配置指南

config-guide-server-info = ## 服务器信息
config-guide-server-name = - **服务器名称**: {$serverName}
config-guide-server-port = - **端口**: {$port}
config-guide-server-endpoint = - **端点**: http://localhost:{$port}/mcp

config-guide-json-header = ## 配置 JSON
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