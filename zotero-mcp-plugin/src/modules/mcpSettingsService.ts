/**
 * MCP Settings Service for Zotero MCP Plugin
 * Manages user preferences for AI client compatibility and content processing
 */

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export class MCPSettingsService {
  private static readonly PREF_PREFIX = 'extensions.zotero.zotero-mcp-plugin.';
  
  // Unified content processing modes - single, intuitive system
  private static readonly UNIFIED_MODES = {
    'minimal': {
      name: '最小模式 / Minimal',
      description: '最快速度，最少内容 (500字符)',
      maxContentLength: 500,
      maxAttachments: 2,
      maxNotes: 3,
      keywordCount: 2,
      smartTruncateLength: 100,
      searchItemLimit: 30,
      maxAnnotationsPerRequest: 15,
      includeWebpage: false,
      enableCompression: true
    },
    'preview': {
      name: '预览模式 / Preview',
      description: '适中内容，快速预览 (1.5K字符)',
      maxContentLength: 1500,
      maxAttachments: 5,
      maxNotes: 8,
      keywordCount: 3,
      smartTruncateLength: 150,
      searchItemLimit: 50,
      maxAnnotationsPerRequest: 20,
      includeWebpage: false,
      enableCompression: true
    },
    'standard': {
      name: '标准模式 / Standard',
      description: '平衡处理，智能内容 (3K字符)',
      maxContentLength: 3000,
      maxAttachments: 10,
      maxNotes: 15,
      keywordCount: 5,
      smartTruncateLength: 200,
      searchItemLimit: 100,
      maxAnnotationsPerRequest: 50,
      includeWebpage: true,
      enableCompression: true
    },
    'complete': {
      name: '完整模式 / Complete',
      description: '所有内容，无长度限制',
      maxContentLength: -1,
      maxAttachments: -1,
      maxNotes: -1,
      keywordCount: 20,
      smartTruncateLength: 1000,
      searchItemLimit: 1000,
      maxAnnotationsPerRequest: 200,
      includeWebpage: true,
      enableCompression: false
    }
  };

  // Simplified default settings with unified mode system
  private static readonly DEFAULTS: Record<string, any> = {
    'ai.maxTokens': 10000,
    'ui.includeMetadata': true,
    // Unified content mode (replaces the old preset + output mode system)
    'content.mode': 'standard', // minimal, preview, standard, complete, custom
    // Custom mode settings (only used when mode is 'custom')
    'custom.maxContentLength': 3000,
    'custom.maxAttachments': 10,
    'custom.maxNotes': 15,
    'custom.keywordCount': 5,
    'custom.smartTruncateLength': 200,
    'custom.searchItemLimit': 100,
    'custom.maxAnnotationsPerRequest': 50,
    'custom.includeWebpage': true,
    'custom.enableCompression': true,
    // Text formatting options
    'text.preserveFormatting': true,
    'text.preserveHeadings': true,
    'text.preserveLists': true,
    'text.preserveEmphasis': false
  };

  /**
   * Initialize default settings (called during plugin startup)
   */
  static initializeDefaults(): void {
    try {
      Object.entries(this.DEFAULTS).forEach(([key, value]) => {
        const prefKey = this.PREF_PREFIX + key;
        const currentValue = Zotero.Prefs.get(prefKey, true);
        if (currentValue === undefined || currentValue === null) {
          Zotero.Prefs.set(prefKey, value, true);
          ztoolkit.log(`[MCPSettings] Set default ${key} = ${value}`);
        }
      });
      
      ztoolkit.log(`[MCPSettings] Default settings initialized`);
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error initializing defaults: ${error}`, 'error');
    }
  }

  /**
   * Get a setting value
   */
  static get(key: string): any {
    try {
      const prefKey = this.PREF_PREFIX + key;
      const defaultValue = this.DEFAULTS[key];
      const value = Zotero.Prefs.get(prefKey, true);
      return value !== undefined && value !== null ? value : defaultValue;
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error getting setting ${key}: ${error}`, 'error');
      return this.DEFAULTS[key];
    }
  }

  /**
   * Set a setting value
   */
  static set(key: string, value: any): void {
    try {
      const prefKey = this.PREF_PREFIX + key;
      
      // Validate the value
      const validationResult = this.validateSetting(key, value);
      if (!validationResult.valid) {
        throw new Error(`Invalid value for ${key}: ${validationResult.error}`);
      }

      Zotero.Prefs.set(prefKey, value, true);
      ztoolkit.log(`[MCPSettings] Set ${key} = ${value}`);
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error setting ${key}: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Get all current settings
   */
  static getAllSettings(): any {
    const effectiveSettings = this.getEffectiveSettings();
    return {
      ai: {
        maxTokens: this.get('ai.maxTokens')
      },
      content: {
        mode: this.get('content.mode')
      },
      custom: {
        maxContentLength: this.get('custom.maxContentLength'),
        maxAttachments: this.get('custom.maxAttachments'),
        maxNotes: this.get('custom.maxNotes'),
        keywordCount: this.get('custom.keywordCount'),
        smartTruncateLength: this.get('custom.smartTruncateLength'),
        searchItemLimit: this.get('custom.searchItemLimit'),
        maxAnnotationsPerRequest: this.get('custom.maxAnnotationsPerRequest'),
        includeWebpage: this.get('custom.includeWebpage'),
        enableCompression: this.get('custom.enableCompression')
      },
      ui: {
        includeMetadata: this.get('ui.includeMetadata')
      },
      // Current effective values
      effective: effectiveSettings
    };
  }

  /**
   * Update multiple settings at once
   */
  static updateSettings(newSettings: any): void {
    try {
      if (newSettings.ai) {
        Object.entries(newSettings.ai).forEach(([key, value]) => {
          this.set(`ai.${key}`, value);
        });
      }

      if (newSettings.content) {
        Object.entries(newSettings.content).forEach(([key, value]) => {
          this.set(`content.${key}`, value);
        });
      }

      if (newSettings.custom) {
        Object.entries(newSettings.custom).forEach(([key, value]) => {
          this.set(`custom.${key}`, value);
        });
      }

      if (newSettings.ui) {
        Object.entries(newSettings.ui).forEach(([key, value]) => {
          this.set(`ui.${key}`, value);
        });
      }

      ztoolkit.log('[MCPSettings] Bulk settings update completed');
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error updating settings: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Reset all settings to defaults
   */
  static resetToDefaults(): void {
    try {
      Object.entries(this.DEFAULTS).forEach(([key, value]) => {
        const prefKey = this.PREF_PREFIX + key;
        Zotero.Prefs.set(prefKey, value, true);
      });
      
      ztoolkit.log('[MCPSettings] All settings reset to defaults');
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error resetting settings: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Check if a setting exists
   */
  static has(key: string): boolean {
    try {
      const prefKey = this.PREF_PREFIX + key;
      const value = Zotero.Prefs.get(prefKey, true);
      return value !== undefined && value !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a setting (reset to default)
   */
  static delete(key: string): void {
    try {
      const prefKey = this.PREF_PREFIX + key;
      const value = Zotero.Prefs.get(prefKey, true);
      if (value !== undefined && value !== null) {
        Zotero.Prefs.clear(prefKey);
        ztoolkit.log(`[MCPSettings] Cleared setting ${key}`);
      }
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error deleting setting ${key}: ${error}`, 'error');
    }
  }

  /**
   * Get the current effective settings (for tools to use)
   */
  static getEffectiveSettings(): {
    maxTokens: number;
    maxContentLength: number;
    maxAttachments: number;
    maxNotes: number;
    keywordCount: number;
    smartTruncateLength: number;
    searchItemLimit: number;
    maxAnnotationsPerRequest: number;
    includeWebpage: boolean;
    enableCompression: boolean;
    preserveFormatting: boolean;
    preserveHeadings: boolean;
    preserveLists: boolean;
    preserveEmphasis: boolean;
  } {
    const contentMode = this.get('content.mode');
    
    if (contentMode === 'custom') {
      // Use custom values
      return {
        maxTokens: this.get('ai.maxTokens'),
        maxContentLength: this.get('custom.maxContentLength'),
        maxAttachments: this.get('custom.maxAttachments'),
        maxNotes: this.get('custom.maxNotes'),
        keywordCount: this.get('custom.keywordCount'),
        smartTruncateLength: this.get('custom.smartTruncateLength'),
        searchItemLimit: this.get('custom.searchItemLimit'),
        maxAnnotationsPerRequest: this.get('custom.maxAnnotationsPerRequest'),
        includeWebpage: this.get('custom.includeWebpage'),
        enableCompression: this.get('custom.enableCompression'),
        preserveFormatting: this.get('text.preserveFormatting'),
        preserveHeadings: this.get('text.preserveHeadings'),
        preserveLists: this.get('text.preserveLists'),
        preserveEmphasis: this.get('text.preserveEmphasis')
      };
    } else {
      // Use unified mode values
      const mode = this.UNIFIED_MODES[contentMode as keyof typeof this.UNIFIED_MODES] || this.UNIFIED_MODES.standard;
      return {
        maxTokens: this.get('ai.maxTokens'),
        maxContentLength: mode.maxContentLength,
        maxAttachments: mode.maxAttachments,
        maxNotes: mode.maxNotes,
        keywordCount: mode.keywordCount,
        smartTruncateLength: mode.smartTruncateLength,
        searchItemLimit: mode.searchItemLimit,
        maxAnnotationsPerRequest: mode.maxAnnotationsPerRequest,
        includeWebpage: mode.includeWebpage,
        enableCompression: mode.enableCompression,
        preserveFormatting: this.get('text.preserveFormatting'),
        preserveHeadings: this.get('text.preserveHeadings'),
        preserveLists: this.get('text.preserveLists'),
        preserveEmphasis: this.get('text.preserveEmphasis')
      };
    }
  }

  /**
   * Apply a content mode configuration
   */
  static applyMode(modeName: string): void {
    try {
      if (modeName === 'custom') {
        this.set('content.mode', 'custom');
        ztoolkit.log(`[MCPSettings] Switched to custom mode`);
        return;
      }

      const mode = this.UNIFIED_MODES[modeName as keyof typeof this.UNIFIED_MODES];
      if (!mode) {
        throw new Error(`Unknown mode: ${modeName}`);
      }

      this.set('content.mode', modeName);
      ztoolkit.log(`[MCPSettings] Applied ${modeName} mode`);
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error applying mode ${modeName}: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Get available content modes info
   */
  static getModesInfo(): any {
    return {
      current: this.get('content.mode'),
      available: {
        minimal: {
          ...this.UNIFIED_MODES.minimal
        },
        preview: {
          ...this.UNIFIED_MODES.preview
        },
        standard: {
          ...this.UNIFIED_MODES.standard
        },
        complete: {
          ...this.UNIFIED_MODES.complete
        },
        custom: {
          name: '自定义模式 / Custom',
          description: '手动配置所有参数 / Manually configure all parameters',
          maxContentLength: this.get('custom.maxContentLength'),
          maxAttachments: this.get('custom.maxAttachments'),
          maxNotes: this.get('custom.maxNotes'),
          keywordCount: this.get('custom.keywordCount'),
          smartTruncateLength: this.get('custom.smartTruncateLength'),
          searchItemLimit: this.get('custom.searchItemLimit'),
          maxAnnotationsPerRequest: this.get('custom.maxAnnotationsPerRequest'),
          includeWebpage: this.get('custom.includeWebpage'),
          enableCompression: this.get('custom.enableCompression')
        }
      }
    };
  }

  /**
   * Validate a setting value
   */
  private static validateSetting(key: string, value: any): { valid: boolean; error?: string } {
    switch (key) {
      case 'ai.maxTokens':
        if (typeof value !== 'number' || value < 1000 || value > 100000) {
          return { valid: false, error: 'maxTokens must be a number between 1000 and 100000' };
        }
        break;

      case 'content.mode':
        if (!['minimal', 'preview', 'standard', 'complete', 'custom'].includes(value)) {
          return { valid: false, error: 'content mode must be one of: minimal, preview, standard, complete, custom' };
        }
        break;

      case 'custom.maxContentLength':
        if (typeof value !== 'number' || value < 100 || value > 50000) {
          return { valid: false, error: 'maxContentLength must be a number between 100 and 50000' };
        }
        break;

      case 'custom.maxAttachments':
        if (typeof value !== 'number' || value < 1 || value > 50) {
          return { valid: false, error: 'maxAttachments must be a number between 1 and 50' };
        }
        break;

      case 'custom.maxNotes':
        if (typeof value !== 'number' || value < 1 || value > 100) {
          return { valid: false, error: 'maxNotes must be a number between 1 and 100' };
        }
        break;

      case 'custom.smartTruncateLength':
        if (typeof value !== 'number' || value < 50 || value > 1000) {
          return { valid: false, error: 'smartTruncateLength must be a number between 50 and 1000' };
        }
        break;

      case 'custom.keywordCount':
        if (typeof value !== 'number' || value < 1 || value > 20) {
          return { valid: false, error: 'keywordCount must be a number between 1 and 20' };
        }
        break;

      case 'custom.searchItemLimit':
        if (typeof value !== 'number' || value < 10 || value > 1000) {
          return { valid: false, error: 'searchItemLimit must be a number between 10 and 1000' };
        }
        break;

      case 'custom.maxAnnotationsPerRequest':
        if (typeof value !== 'number' || value < 10 || value > 200) {
          return { valid: false, error: 'maxAnnotationsPerRequest must be a number between 10 and 200' };
        }
        break;

      case 'custom.includeWebpage':
      case 'custom.enableCompression':
      case 'ui.includeMetadata':
        if (typeof value !== 'boolean') {
          return { valid: false, error: 'Value must be a boolean' };
        }
        break;

      default:
        // For other settings, just check they're not null/undefined
        if (value === null || value === undefined) {
          return { valid: false, error: 'Value cannot be null or undefined' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Export settings to JSON (for backup/sharing)
   */
  static exportSettings(): string {
    const settings = this.getAllSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON
   */
  static importSettings(jsonSettings: string): void {
    try {
      const settings = JSON.parse(jsonSettings);
      this.updateSettings(settings);
      ztoolkit.log('[MCPSettings] Settings imported successfully');
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error importing settings: ${error}`, 'error');
      throw new Error('Invalid settings JSON format');
    }
  }

  /**
   * Get setting info for UI display
   */
  static getSettingInfo(): any {
    const effectiveSettings = this.getEffectiveSettings();
    return {
      ai: {
        maxTokens: {
          current: this.get('ai.maxTokens'),
          default: this.DEFAULTS['ai.maxTokens'],
          range: '1000-100000',
          description: 'Maximum tokens for AI processing'
        }
      },
      content: {
        mode: {
          current: this.get('content.mode'),
          default: this.DEFAULTS['content.mode'],
          options: ['minimal', 'preview', 'standard', 'complete', 'custom'],
          description: 'Unified content processing mode'
        }
      },
      effective: {
        maxContentLength: {
          current: effectiveSettings.maxContentLength,
          description: 'Current effective content length limit'
        },
        maxAttachments: {
          current: effectiveSettings.maxAttachments,
          description: 'Current effective max attachments'
        },
        maxNotes: {
          current: effectiveSettings.maxNotes,
          description: 'Current effective max notes'
        },
        keywordCount: {
          current: effectiveSettings.keywordCount,
          description: 'Current effective keyword count'
        },
        smartTruncateLength: {
          current: effectiveSettings.smartTruncateLength,
          description: 'Current effective truncate length'
        },
        searchItemLimit: {
          current: effectiveSettings.searchItemLimit,
          description: 'Current effective search limit'
        },
        maxAnnotationsPerRequest: {
          current: effectiveSettings.maxAnnotationsPerRequest,
          description: 'Current effective max annotations'
        },
        includeWebpage: {
          current: effectiveSettings.includeWebpage,
          description: 'Current effective webpage inclusion'
        },
        enableCompression: {
          current: effectiveSettings.enableCompression,
          description: 'Current effective compression setting'
        }
      }
    };
  }
}