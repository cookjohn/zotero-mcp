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
    // Diagnostic logging for environment detection
    this.logDiagnosticInfo();
    
    // Set default values if not defined
    const currentPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
    const currentEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
    
    if (typeof ztoolkit !== 'undefined') {
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Initial prefs - port: ${currentPort} (type: ${typeof currentPort}), enabled: ${currentEnabled} (type: ${typeof currentEnabled})`);
    }
    
    // Always set port if not set
    if (currentPort === undefined || currentPort === null) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Setting default port: 23120`);
      }
      Zotero.Prefs.set(MCP_SERVER_PORT, 23120, true);
      
      // Immediate verification
      const immediatePortCheck = Zotero.Prefs.get(MCP_SERVER_PORT, true);
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Port set, immediate check: ${immediatePortCheck}`);
      }
    }
    
    // Enhanced enabled state tracking
    if (typeof ztoolkit !== 'undefined') {
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] About to check/set enabled state...`);
    }
    
    if (currentEnabled === undefined || currentEnabled === null) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Setting default enabled state to true (was undefined/null)`);
      }
      
      // Try setting and immediately verify
      Zotero.Prefs.set(MCP_SERVER_ENABLED, true, true);
      const immediateEnabledCheck = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
      
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Enabled set, immediate check: ${immediateEnabledCheck} (type: ${typeof immediateEnabledCheck})`);
      }
    } else if (currentEnabled === false) {
      if (typeof ztoolkit !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Found enabled=false, investigating why...`);
        // Log stack trace to see who might have set it to false
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Stack trace: ${new Error().stack}`);
      }
    }
    
    // Verify the values were set correctly
    const verifyPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
    const verifyEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
    if (typeof ztoolkit !== 'undefined') {
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] After initialization - port: ${verifyPort}, enabled: ${verifyEnabled}`);
    }
    
    // Set up monitoring timer to track changes
    this.startPreferenceMonitoring();
  }

  private logDiagnosticInfo(): void {
    if (typeof ztoolkit === 'undefined') return;
    
    try {
      // Log Zotero version and environment
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Zotero version: ${Zotero.version || 'unknown'}`);
      try {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Platform: ${(globalThis as any).navigator?.platform || 'unknown'}`);
      } catch (e) {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Platform info unavailable`);
      }
      
      // Check if we're in test mode or special environment
      if (typeof (Zotero as any).test !== 'undefined') {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Running in test mode`);
      }
      
      // Check preference system availability
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Zotero.Prefs available: ${typeof Zotero.Prefs !== 'undefined'}`);
      if (typeof Services !== 'undefined' && Services.prefs) {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Services.prefs available: true`);
      } else {
        ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Services.prefs available: false`);
      }
      
      // Check for addon-specific environment indicators
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] addon.data available: ${typeof addon !== 'undefined' && typeof addon.data !== 'undefined'}`);
      
    } catch (error) {
      ztoolkit.log(`[ServerPreferences] [DIAGNOSTIC] Error in diagnostic logging: ${error}`, 'error');
    }
  }

  private startPreferenceMonitoring(): void {
    if (typeof ztoolkit === 'undefined') return;
    
    // Monitor preference changes every 5 seconds for the first minute
    let monitorCount = 0;
    const maxMonitors = 12; // 12 * 5 seconds = 1 minute
    
    const monitorInterval = setInterval(() => {
      monitorCount++;
      
      const currentEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
      const currentPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
      
      ztoolkit.log(`[ServerPreferences] [MONITOR-${monitorCount}] enabled: ${currentEnabled}, port: ${currentPort}`);
      
      if (currentEnabled === false) {
        ztoolkit.log(`[ServerPreferences] [MONITOR-${monitorCount}] WARNING: Server disabled! Investigating...`);
        
        // Try to detect what changed it
        try {
          const allPrefs: string[] = [];
          const prefService = typeof Services !== 'undefined' && Services.prefs;
          if (prefService) {
            const prefKeys = prefService.getChildList(PREFS_PREFIX);
            prefKeys.forEach(key => {
              const value = prefService.getPrefType(key) === prefService.PREF_BOOL ? 
                            prefService.getBoolPref(key) : 
                            prefService.getCharPref(key, 'unknown');
              allPrefs.push(`${key}: ${value}`);
            });
            ztoolkit.log(`[ServerPreferences] [MONITOR-${monitorCount}] All plugin prefs: ${allPrefs.join(', ')}`);
          }
        } catch (error) {
          ztoolkit.log(`[ServerPreferences] [MONITOR-${monitorCount}] Error reading all prefs: ${error}`, 'error');
        }
      }
      
      if (monitorCount >= maxMonitors) {
        clearInterval(monitorInterval);
        ztoolkit.log(`[ServerPreferences] [MONITOR] Monitoring completed after ${monitorCount} checks`);
      }
    }, 5000);
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
