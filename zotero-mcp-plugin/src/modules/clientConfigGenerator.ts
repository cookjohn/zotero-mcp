/**
 * Client Configuration Generator for MCP Server
 * Generates JSON configurations for different AI clients
 */

declare let ztoolkit: ZToolkit;
import { getString } from "../utils/locale";

export interface ClientConfig {
  name: string;
  displayName: string;
  description: string;
  configTemplate: (port: number, serverName?: string) => any;
  getInstructions?: (port?: number) => string[];
}

export class ClientConfigGenerator {
  private static readonly CLIENT_CONFIGS: ClientConfig[] = [
    {
      name: "claude-code",
      displayName: "Claude Code",
      description: "Anthropic's Claude Code CLI tool",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            serverUrl: `http://127.0.0.1:${port}/mcp`,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Claude-Code-MCP-Client"
            }
          }
        }
      }),
      getInstructions: (port: number = 23120) => [
        "1. Use Claude Code's built-in command to add the MCP server:",
        `   claude mcp add zotero-mcp http://127.0.0.1:${port}/mcp -t http`,
        "",
        "2. Alternatively, add with custom headers:",
        `   claude mcp add zotero-mcp http://127.0.0.1:${port}/mcp -t http \\`,
        "     -H 'Content-Type: application/json' \\",
        "     -H 'User-Agent: Claude-Code-MCP-Client'",
        "",
        "3. Verify the server was added and connected:",
        "   claude mcp list",
        "",
        "4. Available MCP tools in Claude Code:",
        "   - search_library: Search your Zotero library",
        "   - get_annotations: Get annotations and notes",
        "   - get_content: Extract full content from PDFs",
        "   - get_collections: Browse your collections",
        "   - search_fulltext: Search full document content",
        "   - And 6 more research tools!",
        "",
        "5. Start using the tools immediately - no restart required!",
        "",
        "Note: Ensure Zotero is running and the MCP plugin server is enabled",
        "",
        "Troubleshooting for Proxy Users:",
        "- If using VPN/proxy with TUN mode, add 127.0.0.1 to bypass list",
        "- Or temporarily disable TUN mode for local development",
        "- Configuration uses 127.0.0.1 instead of localhost for better proxy compatibility"
      ]
    },
    {
      name: "claude-desktop",
      displayName: "Claude Desktop",
      description: "Anthropic's Claude Desktop application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {}
          }
        }
      }),
      getInstructions: () => getString("claude-desktop-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "cline-vscode",
      displayName: "Cline (VS Code)",
      description: "Cline extension for Visual Studio Code",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {},
            alwaysAllow: ["*"],
            disabled: false
          }
        }
      }),
      getInstructions: () => getString("cline-vscode-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "continue-dev",
      displayName: "Continue.dev",
      description: "Continue coding assistant",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        experimental: {
          modelContextProtocolServers: [
            {
              name: serverName,
              transport: {
                type: "stdio",
                command: "npx",
                args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`]
              }
            }
          ]
        }
      }),
      getInstructions: () => getString("continue-dev-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "cursor",
      displayName: "Cursor",
      description: "AI-powered code editor",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {}
          }
        }
      }),
      getInstructions: () => getString("cursor-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "cherry-studio",
      displayName: "Cherry Studio",
      description: "AI assistant desktop application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            type: "streamableHttp",
            url: `http://127.0.0.1:${port}/mcp`,
            headers: {
              "Content-Type": "application/json"
            }
          }
        }
      }),
      getInstructions: () => getString("cherry-studio-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "gemini-cli",
      displayName: "Gemini CLI",
      description: "Google Gemini command line interface",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            httpUrl: `http://127.0.0.1:${port}/mcp`,
            headers: {
              "Content-Type": "application/json"
            },
            timeout: 60000,
            trust: true
          }
        }
      }),
      getInstructions: () => getString("gemini-cli-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "chatbox",
      displayName: "Chatbox",
      description: "Desktop AI chat application",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {}
          }
        }
      }),
      getInstructions: () => getString("chatbox-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "trae-ai",
      displayName: "Trae AI",
      description: "AI-powered development assistant",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {}
          }
        }
      }),
      getInstructions: () => getString("trae-ai-instructions").split("\n").filter(s => s.trim())
    },
    {
      name: "qwen-code",
      displayName: "Qwen Code",
      description: "Qwen Code CLI - AI-powered coding assistant",
      configTemplate: (port: number, serverName = "zotero-mcp") => ({
        mcpServers: {
          [serverName]: {
            command: "npx",
            args: ["mcp-remote", `http://127.0.0.1:${port}/mcp`],
            env: {}
          }
        }
      }),
      getInstructions: (port: number = 23120) => [
        "1. Use Qwen Code's MCP add command:",
        `   qwen mcp add zotero-mcp http://127.0.0.1:${port}/mcp -t http`,
        "",
        "2. Alternatively, add with custom headers and options:",
        `   qwen mcp add zotero-mcp http://127.0.0.1:${port}/mcp \\`,
        "     -t http \\",
        "     -H 'Content-Type: application/json' \\",
        "     -H 'User-Agent: Qwen-Code-MCP-Client' \\",
        "     --trust",
        "",
        "3. Verify the server was added:",
        "   qwen mcp list",
        "",
        "4. Available MCP tools in Qwen Code:",
        "   - search_library: Search your Zotero library",
        "   - get_annotations: Get annotations and notes",
        "   - get_content: Extract full content from PDFs",
        "   - get_collections: Browse your collections",
        "   - search_fulltext: Search full document content",
        "   - And 6 more research tools!",
        "",
        "5. Start using the tools with @ syntax:",
        "   Example: /analyze @zotero:search_library term:\"machine learning\"",
        "",
        "6. Use /mcp command to verify MCP server is active",
        "",
        "Note: Ensure Zotero is running and the MCP plugin server is enabled",
        "",
        "Configuration file location: ~/.qwen/settings.json or .qwen/settings.json",
        "",
        "Troubleshooting:",
        "- If connection fails, check server status with 'qwen mcp list'",
        "- Use --trust flag to bypass tool call confirmation prompts",
        "- Configuration uses 127.0.0.1 instead of localhost for better compatibility"
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
          endpoint: `http://127.0.0.1:${port}/mcp`,
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
        connectionTest: `curl -X POST http://127.0.0.1:${port}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'`
      }),
      getInstructions: () => getString("custom-http-instructions").split("\n").filter(s => s.trim())
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

  static getInstructions(clientName: string, port?: number): string[] {
    const client = this.CLIENT_CONFIGS.find(c => c.name === clientName);
    return client?.getInstructions?.(port) || [];
  }

  static generateFullGuide(clientName: string, port: number, serverName?: string): string {
    const client = this.CLIENT_CONFIGS.find(c => c.name === clientName);
    if (!client) {
      throw new Error(`Unsupported client: ${clientName}`);
    }

    const config = this.generateConfig(clientName, port, serverName);
    const instructions = this.getInstructions(clientName, port);
    const actualServerName = serverName || "zotero-mcp";

    return `${getString("config-guide-header", { args: { clientName: client.displayName } })}

${getString("config-guide-server-info")}
${getString("config-guide-server-name", { args: { serverName: actualServerName } })}
${getString("config-guide-server-port", { args: { port: port.toString() } })}
${getString("config-guide-server-endpoint", { args: { port: port.toString() } })}

${getString("config-guide-json-header")}
\`\`\`json
${config}
\`\`\`

${getString("config-guide-steps-header")}
${instructions.map(instruction => instruction).join('\n')}

${getString("config-guide-tools-header")}
${getString("config-guide-tools-list")}

${getString("config-guide-troubleshooting-header")}
${getString("config-guide-troubleshooting-list")}

${getString("config-guide-generated-time", { args: { time: new Date().toLocaleString() } })}
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