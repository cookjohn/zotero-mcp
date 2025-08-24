import { config } from "../../package.json";

declare let ztoolkit: ZToolkit;

const PREFS_PREFIX = config.prefsPrefix;
const MCP_SERVER_PORT = `${PREFS_PREFIX}.mcp.server.port`;
const MCP_SERVER_ENABLED = `${PREFS_PREFIX}.mcp.server.enabled`;

type PreferenceObserver = (name: string) => void;

class ServerPreferences {
  private observers: PreferenceObserver[] = [];
  private observerID: symbol | null = null;

  constructor() {
    this.initializeDefaults();
    this.register();
  }

  private initializeDefaults(): void {
    // Set default values if not defined
    const currentPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
    const currentEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
    
    if (typeof ztoolkit !== 'undefined') {
      ztoolkit.log(`[ServerPreferences] Current prefs - port: ${currentPort}, enabled: ${currentEnabled}`);
    }
    
    // Always set port if not set
    if (currentPort === undefined || currentPort === null) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] Setting default port: 23120`);
      }
      Zotero.Prefs.set(MCP_SERVER_PORT, 23120, true);
    }
    
    // Set default enabled state if not defined
    if (currentEnabled === undefined || currentEnabled === null) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] Setting default enabled state to true`);
      }
      Zotero.Prefs.set(MCP_SERVER_ENABLED, true, true);
    }
    
    // Verify the values were set correctly
    const verifyPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
    const verifyEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
    if (typeof ztoolkit !== 'undefined') {
      ztoolkit.log(`[ServerPreferences] After initialization - port: ${verifyPort}, enabled: ${verifyEnabled}`);
    }
  }

  public getPort(): number {
    const DEFAULT_PORT = 23120;
    try {
      const port = Zotero.Prefs.get(MCP_SERVER_PORT, true);

      // 添加调试日志
      if (typeof Zotero !== "undefined" && Zotero.debug) {
        Zotero.debug(
          `[ServerPreferences] Raw port value from prefs: ${port} (type: ${typeof port})`,
        );
      }

      // 确保返回有效的端口号
      if (port === undefined || port === null || isNaN(Number(port))) {
        if (typeof Zotero !== "undefined" && Zotero.debug) {
          Zotero.debug(
            `[ServerPreferences] Port value invalid, using default: ${DEFAULT_PORT}`,
          );
        }
        return DEFAULT_PORT;
      }

      return Number(port);
    } catch (error) {
      // 如果偏好设置系统还未初始化或发生错误，返回默认值
      if (typeof Zotero !== "undefined" && Zotero.debug) {
        Zotero.debug(
          `[ServerPreferences] Error getting port: ${error}. Using default: ${DEFAULT_PORT}`,
        );
      }
      return DEFAULT_PORT;
    }
  }

  public isServerEnabled(): boolean {
    const DEFAULT_ENABLED = true;
    try {
      const enabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);

      ztoolkit.log(`[ServerPreferences] Reading ${MCP_SERVER_ENABLED}: ${enabled} (type: ${typeof enabled})`);

      // 确保返回有效的布尔值
      if (enabled === undefined || enabled === null) {
        ztoolkit.log(`[ServerPreferences] Server enabled value invalid, using default: ${DEFAULT_ENABLED}`);
        return DEFAULT_ENABLED;
      }

      const result = Boolean(enabled);
      ztoolkit.log(`[ServerPreferences] isServerEnabled returning: ${result}`);
      return result;
    } catch (error) {
      ztoolkit.log(`[ServerPreferences] Error getting server enabled status: ${error}. Using default: ${DEFAULT_ENABLED}`);
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
    try {
      // Register observer for the enabled preference only
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] Registering observer for: ${MCP_SERVER_ENABLED}`);
      }
      
      this.observerID = Zotero.Prefs.registerObserver(
        MCP_SERVER_ENABLED,
        (name: string) => {
          if (typeof ztoolkit !== 'undefined') {
            ztoolkit.log(`[ServerPreferences] Observer triggered for: ${name}`);
          }
          this.observers.forEach((observer) => observer(name));
        },
      );
      
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] Observer registered with ID: ${this.observerID?.toString()}`);
      }
    } catch (error) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] Error registering observer: ${error}`, 'error');
      }
    }
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
