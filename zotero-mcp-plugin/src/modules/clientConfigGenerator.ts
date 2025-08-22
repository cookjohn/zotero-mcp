/**
 * Client Configuration Generator for MCP Server
 * Generates JSON configurations for different AI clients
 */

declare let ztoolkit: ZToolkit;

export interface ClientConfig {
  name: string;
  displayName: string;
  description: string;
  configTemplate: (port: number, serverName?: string) => any;
  instructions: string[];
}

export class ClientConfigGenerator {
  private static readonly CLIENT_CONFIGS: ClientConfig[] = [
    {
      name: "claude-desktop",
      displayName: "Claude Desktop",
      description: "Anthropic's Claude Desktop application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "node",
            args: ["-e", `
              const http = require('http');
              const options = {
                hostname: 'localhost',
                port: ${port},
                path: '/mcp',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              };
              process.stdin.on('data', (data) => {
                const req = http.request(options, (res) => {
                  res.on('data', (chunk) => process.stdout.write(chunk));
                });
                req.write(data);
                req.end();
              });
            `]
          }
        }
      }),
      instructions: [
        "1. 打开 Claude Desktop 应用",
        "2. 找到配置文件路径：",
        "   - Windows: %APPDATA%\\Claude\\claude_desktop_config.json",
        "   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
        "   - Linux: ~/.config/claude/claude_desktop_config.json",
        "3. 将生成的配置添加到该文件中",
        "4. 重启 Claude Desktop 应用",
        "5. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "cline-vscode",
      displayName: "Cline (VS Code)",
      description: "Cline extension for Visual Studio Code",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            transport: {
              type: "http",
              host: "localhost",
              port: port,
              path: "/mcp"
            }
          }
        }
      }),
      instructions: [
        "1. 在 VS Code 中安装 Cline 扩展",
        "2. 打开 VS Code 设置 (Ctrl+,)",
        "3. 搜索 'Cline MCP'",
        "4. 找到 'MCP Servers' 设置",
        "5. 添加生成的配置",
        "6. 重启 VS Code 或重新加载 Cline",
        "7. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "continue-dev",
      displayName: "Continue.dev",
      description: "Continue coding assistant",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcp: {
          servers: {
            [serverName]: {
              transport: "http",
              endpoint: `http://localhost:${port}/mcp`,
              description: "Zotero research management and citation tools"
            }
          }
        }
      }),
      instructions: [
        "1. 在 VS Code 中安装 Continue 扩展",
        "2. 打开 Continue 配置文件 (~/.continue/config.json)",
        "3. 将生成的配置合并到现有配置中",
        "4. 保存配置文件",
        "5. 重新加载 Continue 扩展",
        "6. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "cursor",
      displayName: "Cursor",
      description: "AI-powered code editor",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcp: {
          servers: {
            [serverName]: {
              url: `http://localhost:${port}/mcp`,
              transport: "http"
            }
          }
        }
      }),
      instructions: [
        "1. 打开 Cursor 编辑器",
        "2. 进入设置 > Extensions > MCP",
        "3. 添加新的 MCP 服务器",
        "4. 使用生成的配置",
        "5. 保存设置",
        "6. 重启 Cursor",
        "7. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "cherry-studio",
      displayName: "Cherry Studio",
      description: "AI assistant desktop application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            type: "streamableHttp",
            url: `http://localhost:${port}/mcp`,
            headers: {
              "Content-Type": "application/json"
            }
          }
        }
      }),
      instructions: [
        "1. 打开 Cherry Studio 应用",
        "2. 进入设置 > MCP Servers",
        "3. 点击'添加服务器'按钮",
        "4. 选择 'streamableHttp' 类型",
        "5. 输入服务器URL和配置信息",
        "6. 将生成的JSON配置粘贴到配置文件中",
        "7. 保存配置",
        "8. 重启 Cherry Studio",
        "9. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "gemini-cli",
      displayName: "Gemini CLI",
      description: "Google Gemini command line interface",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcp: {
          servers: {
            [serverName]: {
              command: "curl",
              args: [
                "-X", "POST",
                "-H", "Content-Type: application/json",
                "-d", "@-",
                `http://localhost:${port}/mcp`
              ],
              description: "Zotero research management tools"
            }
          }
        }
      }),
      instructions: [
        "1. 安装 Gemini CLI 工具",
        "2. 找到配置文件位置：",
        "   - Linux/macOS: ~/.config/gemini/config.json",
        "   - Windows: %APPDATA%\\gemini\\config.json",
        "3. 将生成的配置添加到配置文件中",
        "4. 或者使用环境变量 GEMINI_MCP_CONFIG",
        "5. 重启 Gemini CLI",
        "6. 使用 gemini --mcp-server zotero-mcp 来调用",
        "7. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "chatbox",
      displayName: "Chatbox",
      description: "Desktop AI chat application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        plugins: {
          mcp: {
            enabled: true,
            servers: {
              [serverName]: {
                name: "Zotero MCP",
                description: "Access Zotero library and research tools",
                transport: "http",
                endpoint: `http://localhost:${port}/mcp`,
                autoConnect: true
              }
            }
          }
        }
      }),
      instructions: [
        "1. 打开 Chatbox 应用",
        "2. 进入设置 > 插件 > MCP",
        "3. 启用 MCP 插件支持",
        "4. 添加新的 MCP 服务器",
        "5. 输入生成的配置信息",
        "6. 测试连接",
        "7. 保存设置",
        "8. 重启 Chatbox",
        "9. 确保 Zotero MCP 服务器正在运行"
      ]
    },
    {
      name: "custom-http",
      displayName: "自定义 HTTP 客户端",
      description: "通用 HTTP MCP 客户端配置",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        name: serverName,
        description: "Zotero MCP Server - Research management and citation tools",
        transport: {
          type: "http",
          endpoint: `http://localhost:${port}/mcp`,
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        },
        capabilities: {
          tools: true,
          resources: false,
          prompts: false
        },
        connectionTest: `curl -X POST http://localhost:${port}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'`
      }),
      instructions: [
        "1. 使用此配置作为模板",
        "2. 根据你的客户端要求调整格式",
        "3. 确保客户端支持 HTTP MCP 传输",
        "4. 设置正确的端点 URL",
        "5. 测试连接命令可用于验证",
        "6. 确保 Zotero MCP 服务器正在运行"
      ]
    }
  ];

  static getAvailableClients(): ClientConfig[] {
    return this.CLIENT_CONFIGS;
  }

  static generateConfig(clientName: string, port: number, serverName?: string): string {
    const client = this.CLIENT_CONFIGS.find(c => c.name === clientName);
    if (!client) {
      throw new Error(`Unsupported client: ${clientName}`);
    }

    const config = client.configTemplate(port, serverName || "zotero-mcp");
    return JSON.stringify(config, null, 2);
  }

  static getInstructions(clientName: string): string[] {
    const client = this.CLIENT_CONFIGS.find(c => c.name === clientName);
    return client?.instructions || [];
  }

  static generateFullGuide(clientName: string, port: number, serverName?: string): string {
    const client = this.CLIENT_CONFIGS.find(c => c.name === clientName);
    if (!client) {
      throw new Error(`Unsupported client: ${clientName}`);
    }

    const config = this.generateConfig(clientName, port, serverName);
    const instructions = this.getInstructions(clientName);

    return `# ${client.displayName} MCP 配置指南

## 服务器信息
- **服务器名称**: ${serverName || "zotero-mcp"}
- **端口**: ${port}
- **端点**: http://localhost:${port}/mcp

## 配置 JSON
\`\`\`json
${config}
\`\`\`

## 配置步骤
${instructions.map(instruction => instruction).join('\n')}

## 可用工具
- search_library - 搜索 Zotero 文库
- get_item_details - 获取文献详细信息
- get_item_fulltext - 获取文献全文内容
- search_fulltext - 全文搜索
- get_collections - 获取收藏夹列表
- search_annotations - 搜索注释和标注
- 以及更多...

## 故障排除
1. 确保 Zotero 正在运行
2. 确保 MCP 服务器已启用并在指定端口运行
3. 检查防火墙设置
4. 验证配置文件格式正确

生成时间: ${new Date().toLocaleString()}
`;
  }

  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Try Zotero's built-in clipboard API first
      if (typeof Zotero !== 'undefined' && Zotero.Utilities && Zotero.Utilities.Internal && Zotero.Utilities.Internal.copyTextToClipboard) {
        Zotero.Utilities.Internal.copyTextToClipboard(text);
        return true;
      }
      
      // Try standard clipboard API
      const globalNav = (globalThis as any).navigator;
      if (globalNav && globalNav.clipboard) {
        await globalNav.clipboard.writeText(text);
        return true;
      }
      
      // Try with global document
      if (typeof ztoolkit !== 'undefined' && ztoolkit.getGlobal) {
        const globalWindow = ztoolkit.getGlobal('window');
        if (globalWindow && globalWindow.document) {
          const textArea = globalWindow.document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          globalWindow.document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const result = globalWindow.document.execCommand('copy');
          globalWindow.document.body.removeChild(textArea);
          return result;
        }
      }
      
      return false;
    } catch (error) {
      ztoolkit.log(`[ClientConfigGenerator] Failed to copy to clipboard: ${error}`, "error");
      return false;
    }
  }
}