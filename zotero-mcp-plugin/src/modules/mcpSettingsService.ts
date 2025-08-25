/**
 * MCP Settings Service for Zotero MCP Plugin
 * Manages user preferences for AI client compatibility and content processing
 */

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export class MCPSettingsService {
  private static readonly PREF_PREFIX = 'extensions.zotero.zotero-mcp-plugin.';
  
  // Configuration presets for different use cases
  private static readonly PRESETS = {
    'conservative': {
      keywordCount: 3,
      smartTruncateLength: 150,
      searchItemLimit: 50,
      maxAnnotationsPerRequest: 20,
      defaultOutputMode: 'preview'
    },
    'balanced': {
      keywordCount: 5,
      smartTruncateLength: 200,
      searchItemLimit: 100,
      maxAnnotationsPerRequest: 50,
      defaultOutputMode: 'smart'
    },
    'comprehensive': {
      keywordCount: 20,     // 最大值
      smartTruncateLength: 1000,  // 最大值
      searchItemLimit: 1000,      // 最大值
      maxAnnotationsPerRequest: 200,  // 最大值
      defaultOutputMode: 'full'
    },
    'performance': {
      keywordCount: 2,
      smartTruncateLength: 100,
      searchItemLimit: 30,
      maxAnnotationsPerRequest: 15,
      defaultOutputMode: 'minimal'
    }
  };

  // Default settings with new maxTokens default of 10000
  private static readonly DEFAULTS: Record<string, any> = {
    'ai.maxTokens': 10000,
    'ui.includeMetadata': true,
    // Preset mode settings
    'preset.mode': 'balanced', // conservative, balanced, comprehensive, performance, custom
    'preset.custom.keywordCount': 5,
    'preset.custom.smartTruncateLength': 200,
    'preset.custom.searchItemLimit': 100,
    'preset.custom.maxAnnotationsPerRequest': 50,
    'preset.custom.defaultOutputMode': 'smart'
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
        maxTokens: effectiveSettings.maxTokens
      },
      preset: {
        mode: this.get('preset.mode'),
        custom: {
          defaultOutputMode: this.get('preset.custom.defaultOutputMode'),
          smartTruncateLength: this.get('preset.custom.smartTruncateLength'),
          keywordCount: this.get('preset.custom.keywordCount'),
          searchItemLimit: this.get('preset.custom.searchItemLimit'),
          maxAnnotationsPerRequest: this.get('preset.custom.maxAnnotationsPerRequest')
        }
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

      if (newSettings.preset) {
        if (newSettings.preset.mode) {
          this.set('preset.mode', newSettings.preset.mode);
        }
        if (newSettings.preset.custom) {
          Object.entries(newSettings.preset.custom).forEach(([key, value]) => {
            this.set(`preset.custom.${key}`, value);
          });
        }
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
    defaultOutputMode: string;
    smartTruncateLength: number;
    keywordCount: number;
    searchItemLimit: number;
    maxAnnotationsPerRequest: number;
  } {
    const presetMode = this.get('preset.mode');
    
    if (presetMode === 'custom') {
      // Use custom values
      return {
        maxTokens: this.get('ai.maxTokens'),
        defaultOutputMode: this.get('preset.custom.defaultOutputMode'),
        smartTruncateLength: this.get('preset.custom.smartTruncateLength'),
        keywordCount: this.get('preset.custom.keywordCount'),
        searchItemLimit: this.get('preset.custom.searchItemLimit'),
        maxAnnotationsPerRequest: this.get('preset.custom.maxAnnotationsPerRequest')
      };
    } else {
      // Use preset values
      const preset = this.PRESETS[presetMode as keyof typeof this.PRESETS] || this.PRESETS.balanced;
      return {
        maxTokens: this.get('ai.maxTokens'),
        defaultOutputMode: preset.defaultOutputMode,
        smartTruncateLength: preset.smartTruncateLength,
        keywordCount: preset.keywordCount,
        searchItemLimit: preset.searchItemLimit,
        maxAnnotationsPerRequest: preset.maxAnnotationsPerRequest
      };
    }
  }

  /**
   * Apply a preset configuration
   */
  static applyPreset(presetName: string): void {
    try {
      if (presetName === 'custom') {
        this.set('preset.mode', 'custom');
        ztoolkit.log(`[MCPSettings] Switched to custom mode`);
        return;
      }

      const preset = this.PRESETS[presetName as keyof typeof this.PRESETS];
      if (!preset) {
        throw new Error(`Unknown preset: ${presetName}`);
      }

      this.set('preset.mode', presetName);
      ztoolkit.log(`[MCPSettings] Applied ${presetName} preset`);
    } catch (error) {
      ztoolkit.log(`[MCPSettings] Error applying preset ${presetName}: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Get available presets info
   */
  static getPresetsInfo(): any {
    return {
      current: this.get('preset.mode'),
      available: {
        conservative: {
          name: '保守模式 / Conservative',
          description: '最小化内容处理，适合低性能设备 / Minimal processing for low-end devices',
          ...this.PRESETS.conservative
        },
        balanced: {
          name: '平衡模式 / Balanced',
          description: '平衡性能和内容质量 / Balance between performance and content quality',
          ...this.PRESETS.balanced
        },
        comprehensive: {
          name: '完整模式 / Comprehensive',
          description: '完整内容处理，不限制输出 / Full content processing, no limits',
          ...this.PRESETS.comprehensive
        },
        performance: {
          name: '性能模式 / Performance',
          description: '最快处理速度，最小内容 / Fastest processing with minimal content',
          ...this.PRESETS.performance
        },
        custom: {
          name: '自定义模式 / Custom',
          description: '手动配置所有参数 / Manually configure all parameters',
          keywordCount: this.get('preset.custom.keywordCount'),
          smartTruncateLength: this.get('preset.custom.smartTruncateLength'),
          searchItemLimit: this.get('preset.custom.searchItemLimit'),
          maxAnnotationsPerRequest: this.get('preset.custom.maxAnnotationsPerRequest'),
          defaultOutputMode: this.get('preset.custom.defaultOutputMode')
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

      case 'preset.mode':
        if (!['conservative', 'balanced', 'comprehensive', 'performance', 'custom'].includes(value)) {
          return { valid: false, error: 'preset mode must be one of: conservative, balanced, comprehensive, performance, custom' };
        }
        break;

      case 'preset.custom.defaultOutputMode':
        if (!['smart', 'preview', 'full', 'minimal'].includes(value)) {
          return { valid: false, error: 'defaultOutputMode must be one of: smart, preview, full, minimal' };
        }
        break;

      case 'preset.custom.smartTruncateLength':
        if (typeof value !== 'number' || value < 50 || value > 1000) {
          return { valid: false, error: 'smartTruncateLength must be a number between 50 and 1000' };
        }
        break;

      case 'preset.custom.keywordCount':
        if (typeof value !== 'number' || value < 1 || value > 20) {
          return { valid: false, error: 'keywordCount must be a number between 1 and 20' };
        }
        break;

      case 'preset.custom.searchItemLimit':
        if (typeof value !== 'number' || value < 10 || value > 1000) {
          return { valid: false, error: 'searchItemLimit must be a number between 10 and 1000' };
        }
        break;

      case 'preset.custom.maxAnnotationsPerRequest':
        if (typeof value !== 'number' || value < 10 || value > 200) {
          return { valid: false, error: 'maxAnnotationsPerRequest must be a number between 10 and 200' };
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
      preset: {
        mode: {
          current: this.get('preset.mode'),
          default: this.DEFAULTS['preset.mode'],
          options: ['conservative', 'balanced', 'comprehensive', 'performance', 'custom'],
          description: 'Processing mode configuration'
        }
      },
      effective: {
        defaultOutputMode: {
          current: effectiveSettings.defaultOutputMode,
          description: 'Current effective output mode'
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
        }
      }
    };
  }
}