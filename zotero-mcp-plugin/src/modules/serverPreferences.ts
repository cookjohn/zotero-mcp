const MCP_SERVER_PORT = 'mcp.server.port';
const MCP_SERVER_ENABLED = 'mcp.server.enabled';

type PreferenceObserver = (name: string) => void;

class ServerPreferences {
  private observers: PreferenceObserver[] = [];
  private observerID: symbol | null = null;

  constructor() {
    this.register();
  }

  public getPort(): number {
    const DEFAULT_PORT = 23120;
    try {
      const port = Zotero.Prefs.get(MCP_SERVER_PORT, true);
      
      // 添加调试日志
      if (typeof Zotero !== 'undefined' && Zotero.debug) {
        Zotero.debug(`[ServerPreferences] Raw port value from prefs: ${port} (type: ${typeof port})`);
      }
      
      // 确保返回有效的端口号
      if (port === undefined || port === null || isNaN(Number(port))) {
        if (typeof Zotero !== 'undefined' && Zotero.debug) {
          Zotero.debug(`[ServerPreferences] Port value invalid, using default: ${DEFAULT_PORT}`);
        }
        return DEFAULT_PORT;
      }
      
      return Number(port);
    } catch (error) {
      // 如果偏好设置系统还未初始化或发生错误，返回默认值
      if (typeof Zotero !== 'undefined' && Zotero.debug) {
        Zotero.debug(`[ServerPreferences] Error getting port: ${error}. Using default: ${DEFAULT_PORT}`);
      }
      return DEFAULT_PORT;
    }
  }

  public isServerEnabled(): boolean {
    const DEFAULT_ENABLED = true;
    try {
      const enabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
      
      // 添加调试日志
      if (typeof Zotero !== 'undefined' && Zotero.debug) {
        Zotero.debug(`[ServerPreferences] Server enabled value from prefs: ${enabled} (type: ${typeof enabled})`);
      }
      
      // 确保返回有效的布尔值
      if (enabled === undefined || enabled === null) {
        if (typeof Zotero !== 'undefined' && Zotero.debug) {
          Zotero.debug(`[ServerPreferences] Server enabled value invalid, using default: ${DEFAULT_ENABLED}`);
        }
        return DEFAULT_ENABLED;
      }
      
      return Boolean(enabled);
    } catch (error) {
      // 如果偏好设置系统还未初始化或发生错误，返回默认值
      if (typeof Zotero !== 'undefined' && Zotero.debug) {
        Zotero.debug(`[ServerPreferences] Error getting server enabled status: ${error}. Using default: ${DEFAULT_ENABLED}`);
      }
      return DEFAULT_ENABLED;
    }
  }

  public addObserver(observer: PreferenceObserver): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: PreferenceObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  private register(): void {
    this.observerID = Zotero.Prefs.registerObserver(
      MCP_SERVER_PORT,
      (name: string) => {
        this.observers.forEach((observer) => observer(name));
      }
    );
  }

  public unregister(): void {
    if (this.observerID) {
      Zotero.Prefs.unregisterObserver(this.observerID);
      this.observerID = null;
    }
    this.observers = [];
  }
}

export const serverPreferences = new ServerPreferences();