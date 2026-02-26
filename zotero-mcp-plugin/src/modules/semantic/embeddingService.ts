/**
 * Embedding Service for Semantic Search
 *
 * Uses OpenAI-compatible API for embedding generation.
 * Supports any API that follows the OpenAI embeddings format.
 */

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export interface EmbeddingResult {
  embedding: Float32Array;
  language: 'zh' | 'en';
  dimensions: number;
}

export interface BatchEmbeddingItem {
  id: string;
  text: string;
  language?: 'zh' | 'en';
}

export interface EmbeddingServiceStatus {
  initialized: boolean;
  apiConfigured: boolean;
  lastError?: string;
}

/**
 * Error types for embedding API calls
 */
export type EmbeddingErrorType =
  | 'network'         // Network connectivity issues (timeout, DNS, connection refused)
  | 'rate_limit'      // API rate limit exceeded (429)
  | 'auth'            // Authentication error (401, 403)
  | 'invalid_request' // Invalid request (400)
  | 'payload_too_large' // Payload too large (413)
  | 'server'          // Server error (5xx)
  | 'config'          // Configuration error (API not configured)
  | 'paused'          // Indexing was paused by user
  | 'unknown';        // Other errors

/**
 * Custom error class for embedding API errors
 * Provides detailed error information for user notification and retry logic
 */
export class EmbeddingAPIError extends Error {
  public readonly type: EmbeddingErrorType;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly originalError: any;

  constructor(
    message: string,
    type: EmbeddingErrorType,
    options: {
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      originalError?: any;
    } = {}
  ) {
    super(message);
    this.name = 'EmbeddingAPIError';
    this.type = type;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? (type === 'network' || type === 'rate_limit' || type === 'server' || type === 'payload_too_large');
    this.retryAfterMs = options.retryAfterMs;
    this.originalError = options.originalError;
  }

  /**
   * Get user-friendly error message (bilingual)
   */
  getUserMessage(): string {
    switch (this.type) {
      case 'network':
        return '网络连接失败，请检查网络后点击继续 / Network connection failed, please check network and click Resume';
      case 'rate_limit':
        const waitSec = this.retryAfterMs ? Math.ceil(this.retryAfterMs / 1000) : 60;
        return `API 频率超限，请等待 ${waitSec} 秒后点击继续 / Rate limit exceeded, please wait ${waitSec}s and click Resume`;
      case 'auth':
        if (this.statusCode === 403) {
          return 'API 访问被拒绝 (403)，可能原因：1) API Key 无效 2) 账户配额用尽 3) 账户余额不足。请检查 API 服务商后台 / Access denied (403): Invalid API Key, quota exceeded, or insufficient balance. Please check your API provider dashboard';
        }
        return 'API 认证失败 (401)，请检查 API Key 设置 / Authentication failed (401), please check API Key';
      case 'invalid_request':
        return 'API 请求无效，请检查配置 / Invalid API request, please check configuration';
      case 'payload_too_large':
        return '请求数据过大，正在自动减小批次重试 / Payload too large, auto-reducing batch size and retrying';
      case 'server':
        return 'API 服务器错误，请稍后重试 / API server error, please try again later';
      case 'config':
        return 'API 未配置，请先配置 Embedding API / API not configured, please configure Embedding API first';
      case 'paused':
        return '索引已暂停 / Indexing paused by user';
      default:
        return `API 调用失败: ${this.message} / API call failed: ${this.message}`;
    }
  }
}

/**
 * API Usage Statistics for cost tracking
 */
export interface ApiUsageStats {
  // Cumulative stats (persisted)
  totalTokens: number;           // Total tokens consumed
  totalRequests: number;         // Total API requests made
  totalTexts: number;            // Total texts embedded
  estimatedCostUsd: number;      // Estimated cost in USD
  lastResetAt: number;           // Timestamp of last reset

  // Session stats (memory only, reset on restart)
  sessionTokens: number;
  sessionRequests: number;
  sessionTexts: number;

  // Rate limit tracking
  currentRpm: number;            // Current requests per minute
  currentTpm: number;            // Current tokens per minute
  rateLimitHits: number;         // Times rate limit was hit

  updatedAt: number;             // Last update timestamp
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  rpm: number;                   // Max requests per minute (0 = unlimited)
  tpm: number;                   // Max tokens per minute (0 = unlimited)
  costPer1MTokens: number;       // Cost per 1M tokens in USD for estimation
  autoThrottle: boolean;         // Automatically slow down near limits
}

/**
 * API provider type for auto-detection
 */
export type ApiProviderType = 'auto' | 'openai' | 'dashscope' | 'ollama' | 'ollama-openai';

/**
 * Configuration for embedding API
 */
export interface EmbeddingConfig {
  apiBase: string;          // API base URL (e.g., https://api.openai.com/v1)
  apiKey: string;           // API key
  model: string;            // Model name (e.g., text-embedding-3-small)
  dimensions?: number;      // Output dimensions (if supported by model)
  maxBatchSize: number;     // Max texts per API call
  timeout: number;          // Request timeout in ms
  maxRetries: number;       // Max retry attempts
  apiProvider?: ApiProviderType;  // API provider (auto-detected if 'auto' or not set)
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'text-embedding-3-small',
  dimensions: 512,  // Smaller dimensions for efficiency
  maxBatchSize: 20,  // Conservative default to avoid 413 errors; will auto-reduce if needed
  timeout: 30000,
  maxRetries: 3,
  apiProvider: 'auto'
};

// Preference keys for storing API configuration
const PREF_API_BASE = 'extensions.zotero.zotero-mcp-plugin.embedding.apiBase';
const PREF_API_KEY = 'extensions.zotero.zotero-mcp-plugin.embedding.apiKey';
const PREF_MODEL = 'extensions.zotero.zotero-mcp-plugin.embedding.model';
const PREF_DIMENSIONS = 'extensions.zotero.zotero-mcp-plugin.embedding.dimensions';
const PREF_DETECTED_DIMENSIONS = 'extensions.zotero.zotero-mcp-plugin.embedding.detectedDimensions';

// Preference keys for rate limit and usage stats
const PREF_RPM = 'extensions.zotero.zotero-mcp-plugin.embedding.rpm';
const PREF_TPM = 'extensions.zotero.zotero-mcp-plugin.embedding.tpm';
const PREF_COST_PER_1M = 'extensions.zotero.zotero-mcp-plugin.embedding.costPer1M';
const PREF_USAGE_STATS = 'extensions.zotero.zotero-mcp-plugin.embedding.usageStats';

// Default rate limit config
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  rpm: 60,              // OpenAI free tier ~60 RPM
  tpm: 150000,          // OpenAI ~150K TPM
  costPer1MTokens: 0.02, // text-embedding-3-small pricing
  autoThrottle: true
};

export class EmbeddingService {
  private config: EmbeddingConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private status: EmbeddingServiceStatus = {
    initialized: false,
    apiConfigured: false
  };

  // Rate limiting and usage tracking
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT };
  private usageStats: ApiUsageStats = this.createEmptyStats();
  private requestWindow: Array<{ timestamp: number; tokens: number }> = [];
  private onRateLimitCallback?: (info: { type: string; waitMs: number; message: string }) => void;

  // Auto-detected dimensions from API response
  private detectedDimensions: number | null = null;

  // Auto-detected API provider type
  private detectedProvider: ApiProviderType | null = null;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Auto-detect API provider type from URL
   */
  private detectApiProvider(url: string): ApiProviderType {
    const lowerUrl = url.toLowerCase();

    ztoolkit.log(`[EmbeddingService] detectApiProvider: url=${lowerUrl}`);

    // Check for Ollama patterns - more robust detection
    const ollamaPatterns = [
      'ollama',           // Word 'ollama' in URL
      ':11434',           // Default Ollama port
      'localhost:11434',
      '127.0.0.1:11434',
      '/api/embed',       // Ollama native embedding endpoint
    ];

    const isOllama = ollamaPatterns.some(pattern => lowerUrl.includes(pattern));

    if (isOllama) {
      // Check if using OpenAI-compatible endpoint
      if (lowerUrl.includes('/v1')) {
        ztoolkit.log(`[EmbeddingService] detectApiProvider: detected ollama-openai`);
        return 'ollama-openai';
      }
      ztoolkit.log(`[EmbeddingService] detectApiProvider: detected ollama`);
      return 'ollama';
    }

    // Check for DashScope (Alibaba Cloud) patterns
    if (lowerUrl.includes('dashscope.aliyuncs.com')) {
      ztoolkit.log(`[EmbeddingService] detectApiProvider: detected dashscope`);
      return 'dashscope';
    }

    // Check for OpenAI patterns
    if (lowerUrl.includes('openai.com') || lowerUrl.includes('/v1')) {
      ztoolkit.log(`[EmbeddingService] detectApiProvider: detected openai`);
      return 'openai';
    }

    // Default to OpenAI-compatible format
    ztoolkit.log(`[EmbeddingService] detectApiProvider: defaulting to openai`);
    return 'openai';
  }

  /**
   * Get the effective API provider (configured or detected)
   */
  getEffectiveProvider(): ApiProviderType {
    if (this.config.apiProvider && this.config.apiProvider !== 'auto') {
      return this.config.apiProvider;
    }
    if (this.detectedProvider) {
      return this.detectedProvider;
    }
    return this.detectApiProvider(this.config.apiBase);
  }

  /**
   * Get the embedding API endpoint URL based on provider
   */
  private getEmbeddingEndpoint(): string {
    const provider = this.getEffectiveProvider();
    const baseUrl = this.config.apiBase.replace(/\/$/, ''); // Remove trailing slash

    let endpoint: string;

    switch (provider) {
      case 'ollama':
        // Ollama native API: /api/embed (recommended, supports batch input)
        // Remove /v1 if present
        const ollamaBase = baseUrl.replace(/\/v1$/, '');
        endpoint = `${ollamaBase}/api/embed`;
        break;

      case 'ollama-openai':
        // Ollama OpenAI-compatible: /v1/embeddings
        if (baseUrl.endsWith('/v1')) {
          endpoint = `${baseUrl}/embeddings`;
        } else {
          endpoint = `${baseUrl}/v1/embeddings`;
        }
        break;

      case 'dashscope':
        // DashScope (Alibaba Cloud) OpenAI-compatible endpoint
        if (baseUrl.endsWith('/v1')) {
          endpoint = `${baseUrl}/embeddings`;
        } else if (baseUrl.includes('/compatible-mode')) {
          endpoint = `${baseUrl}/v1/embeddings`;
        } else {
          endpoint = `${baseUrl}/compatible-mode/v1/embeddings`;
        }
        break;

      case 'openai':
      default:
        // OpenAI format: /v1/embeddings or /embeddings
        if (baseUrl.endsWith('/v1')) {
          endpoint = `${baseUrl}/embeddings`;
        } else {
          endpoint = `${baseUrl}/embeddings`;
        }
        break;
    }

    ztoolkit.log(`[EmbeddingService] getEmbeddingEndpoint: provider=${provider}, baseUrl=${baseUrl}, endpoint=${endpoint}`);
    return endpoint;
  }

  /**
   * Create empty usage stats
   */
  private createEmptyStats(): ApiUsageStats {
    return {
      totalTokens: 0,
      totalRequests: 0,
      totalTexts: 0,
      estimatedCostUsd: 0,
      lastResetAt: Date.now(),
      sessionTokens: 0,
      sessionRequests: 0,
      sessionTexts: 0,
      currentRpm: 0,
      currentTpm: 0,
      rateLimitHits: 0,
      updatedAt: Date.now()
    };
  }

  /**
   * Initialize the embedding service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    ztoolkit.log('[EmbeddingService] Initializing API-based embedding service...');

    try {
      // Load configuration from Zotero preferences
      this.loadConfigFromPrefs();

      // Load rate limit config and usage stats
      this.loadRateLimitConfig();
      this.loadUsageStats();

      // Validate configuration - check apiBase and model (apiKey is optional for local models)
      if (!this.config.apiBase || !this.config.model) {
        ztoolkit.log('[EmbeddingService] Warning: API base or model not configured', 'warn');
        this.status.apiConfigured = false;
      } else {
        this.status.apiConfigured = true;
        ztoolkit.log(`[EmbeddingService] API configured: apiBase=${this.config.apiBase}, model=${this.config.model}, apiKey=${this.config.apiKey ? 'yes' : 'no'}, maxBatchSize=${this.config.maxBatchSize}, timeout=${this.config.timeout}ms`);
      }

      this.initialized = true;
      this.status.initialized = true;
      ztoolkit.log('[EmbeddingService] Initialized successfully');

    } catch (error) {
      this.status.lastError = String(error);
      ztoolkit.log(`[EmbeddingService] Initialization failed: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Load configuration from Zotero preferences
   */
  private loadConfigFromPrefs(): void {
    try {
      const apiBase = Zotero.Prefs.get(PREF_API_BASE, true);
      const apiKey = Zotero.Prefs.get(PREF_API_KEY, true);
      const model = Zotero.Prefs.get(PREF_MODEL, true);
      const dimensions = Zotero.Prefs.get(PREF_DIMENSIONS, true);
      const detectedDims = Zotero.Prefs.get(PREF_DETECTED_DIMENSIONS, true);

      if (apiBase) this.config.apiBase = apiBase;
      if (apiKey) this.config.apiKey = apiKey;
      if (model) this.config.model = model;
      if (dimensions) this.config.dimensions = parseInt(dimensions, 10);
      if (detectedDims) this.detectedDimensions = parseInt(String(detectedDims), 10);

      ztoolkit.log(`[EmbeddingService] Loaded config from prefs: apiBase=${this.config.apiBase}, model=${this.config.model}, configDims=${this.config.dimensions}, detectedDims=${this.detectedDimensions}`);
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to load prefs: ${e}`, 'warn');
    }
  }

  /**
   * Save configuration to Zotero preferences
   */
  saveConfigToPrefs(): void {
    try {
      Zotero.Prefs.set(PREF_API_BASE, this.config.apiBase, true);
      Zotero.Prefs.set(PREF_API_KEY, this.config.apiKey, true);
      Zotero.Prefs.set(PREF_MODEL, this.config.model, true);
      if (this.config.dimensions) {
        Zotero.Prefs.set(PREF_DIMENSIONS, String(this.config.dimensions), true);
      }
      ztoolkit.log('[EmbeddingService] Config saved to prefs');
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to save prefs: ${e}`, 'warn');
    }
  }

  /**
   * Save detected dimensions to preferences
   */
  private saveDetectedDimensions(dims: number): void {
    try {
      Zotero.Prefs.set(PREF_DETECTED_DIMENSIONS, dims, true);
      ztoolkit.log(`[EmbeddingService] Saved detected dimensions: ${dims}`);
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to save detected dimensions: ${e}`, 'warn');
    }
  }

  /**
   * Get the actual dimensions that will be used for embeddings
   * Returns detected dimensions if available, otherwise configured dimensions
   */
  getActualDimensions(): number | null {
    return this.detectedDimensions || this.config.dimensions || null;
  }

  /**
   * Get the detected dimensions from API (null if not yet detected)
   */
  getDetectedDimensions(): number | null {
    return this.detectedDimensions;
  }

  /**
   * Check if the model supports custom dimensions parameter
   */
  supportsCustomDimensions(): boolean {
    const model = this.config.model.toLowerCase();
    // OpenAI text-embedding-3-* models
    if (model.includes('text-embedding-3')) return true;
    // DashScope text-embedding-v3/v4 models
    if (model.includes('text-embedding-v3') || model.includes('text-embedding-v4')) return true;
    return false;
  }

  /**
   * Get provider-specific max batch size
   */
  private getProviderMaxBatchSize(): number {
    const provider = this.getEffectiveProvider();
    switch (provider) {
      case 'dashscope':
        return 10;  // DashScope limit: max 10 texts per request
      case 'ollama':
      case 'ollama-openai':
        return 50;  // Ollama is local, can handle larger batches
      case 'openai':
      default:
        return 2048; // OpenAI supports up to 2048
    }
  }

  /**
   * Clear detected dimensions (useful when changing models)
   */
  clearDetectedDimensions(): void {
    this.detectedDimensions = null;
    try {
      Zotero.Prefs.clear(PREF_DETECTED_DIMENSIONS, true);
      ztoolkit.log('[EmbeddingService] Cleared detected dimensions');
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Load rate limit configuration from preferences
   */
  private loadRateLimitConfig(): void {
    try {
      const rpm = Zotero.Prefs.get(PREF_RPM, true);
      const tpm = Zotero.Prefs.get(PREF_TPM, true);
      const costPer1M = Zotero.Prefs.get(PREF_COST_PER_1M, true);

      if (rpm !== undefined) this.rateLimitConfig.rpm = parseInt(String(rpm), 10) || 0;
      if (tpm !== undefined) this.rateLimitConfig.tpm = parseInt(String(tpm), 10) || 0;
      if (costPer1M !== undefined) this.rateLimitConfig.costPer1MTokens = parseFloat(String(costPer1M)) || 0.02;

      ztoolkit.log(`[EmbeddingService] Rate limit config: RPM=${this.rateLimitConfig.rpm}, TPM=${this.rateLimitConfig.tpm}`);
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to load rate limit config: ${e}`, 'warn');
    }
  }

  /**
   * Save rate limit configuration to preferences
   */
  saveRateLimitConfig(): void {
    try {
      Zotero.Prefs.set(PREF_RPM, String(this.rateLimitConfig.rpm), true);
      Zotero.Prefs.set(PREF_TPM, String(this.rateLimitConfig.tpm), true);
      Zotero.Prefs.set(PREF_COST_PER_1M, String(this.rateLimitConfig.costPer1MTokens), true);
      ztoolkit.log('[EmbeddingService] Rate limit config saved');
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to save rate limit config: ${e}`, 'warn');
    }
  }

  /**
   * Load usage stats from preferences
   */
  private loadUsageStats(): void {
    try {
      const statsJson = Zotero.Prefs.get(PREF_USAGE_STATS, true);
      if (statsJson) {
        const saved = JSON.parse(String(statsJson));
        // Restore cumulative stats, reset session stats
        this.usageStats = {
          ...this.createEmptyStats(),
          totalTokens: saved.totalTokens || 0,
          totalRequests: saved.totalRequests || 0,
          totalTexts: saved.totalTexts || 0,
          estimatedCostUsd: saved.estimatedCostUsd || 0,
          lastResetAt: saved.lastResetAt || Date.now(),
          rateLimitHits: saved.rateLimitHits || 0
        };
        ztoolkit.log(`[EmbeddingService] Loaded usage stats: ${this.usageStats.totalTokens} tokens, ${this.usageStats.totalRequests} requests`);
      }
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to load usage stats: ${e}`, 'warn');
    }
  }

  /**
   * Save usage stats to preferences
   */
  private saveUsageStats(): void {
    try {
      const toSave = {
        totalTokens: this.usageStats.totalTokens,
        totalRequests: this.usageStats.totalRequests,
        totalTexts: this.usageStats.totalTexts,
        estimatedCostUsd: this.usageStats.estimatedCostUsd,
        lastResetAt: this.usageStats.lastResetAt,
        rateLimitHits: this.usageStats.rateLimitHits
      };
      Zotero.Prefs.set(PREF_USAGE_STATS, JSON.stringify(toSave), true);
    } catch (e) {
      ztoolkit.log(`[EmbeddingService] Failed to save usage stats: ${e}`, 'warn');
    }
  }

  /**
   * Update the sliding window for rate tracking
   * Removes entries older than 60 seconds
   */
  private updateRateWindow(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old entries
    this.requestWindow = this.requestWindow.filter(entry => entry.timestamp > oneMinuteAgo);

    // Calculate current rates
    this.usageStats.currentRpm = this.requestWindow.length;
    this.usageStats.currentTpm = this.requestWindow.reduce((sum, entry) => sum + entry.tokens, 0);
    this.usageStats.updatedAt = now;
  }

  /**
   * Check if rate limits allow a new request
   * @param estimatedTokens - Estimated tokens for the request
   * @returns Object with canProceed flag and waitMs if need to wait
   */
  private checkRateLimit(estimatedTokens: number): { canProceed: boolean; waitMs: number; reason?: string } {
    this.updateRateWindow();

    const { rpm, tpm, autoThrottle } = this.rateLimitConfig;

    // Check RPM limit
    if (rpm > 0 && this.usageStats.currentRpm >= rpm) {
      const oldestEntry = this.requestWindow[0];
      const waitMs = oldestEntry ? (oldestEntry.timestamp + 60000 - Date.now()) : 60000;
      return { canProceed: false, waitMs: Math.max(waitMs, 1000), reason: 'RPM limit reached' };
    }

    // Check TPM limit
    if (tpm > 0 && this.usageStats.currentTpm + estimatedTokens > tpm) {
      const oldestEntry = this.requestWindow[0];
      const waitMs = oldestEntry ? (oldestEntry.timestamp + 60000 - Date.now()) : 60000;
      return { canProceed: false, waitMs: Math.max(waitMs, 1000), reason: 'TPM limit reached' };
    }

    // Auto-throttle when approaching limits (>80%)
    if (autoThrottle) {
      if (rpm > 0 && this.usageStats.currentRpm >= rpm * 0.8) {
        ztoolkit.log(`[EmbeddingService] Approaching RPM limit (${this.usageStats.currentRpm}/${rpm})`, 'warn');
      }
      if (tpm > 0 && this.usageStats.currentTpm >= tpm * 0.8) {
        ztoolkit.log(`[EmbeddingService] Approaching TPM limit (${this.usageStats.currentTpm}/${tpm})`, 'warn');
      }
    }

    return { canProceed: true, waitMs: 0 };
  }

  /**
   * Wait for rate limit to clear
   * @param waitMs - Milliseconds to wait
   * @param reason - Reason for waiting
   */
  private async waitForRateLimit(waitMs: number, reason: string): Promise<void> {
    this.usageStats.rateLimitHits++;
    this.saveUsageStats();

    ztoolkit.log(`[EmbeddingService] Rate limit: ${reason}. Waiting ${Math.ceil(waitMs / 1000)}s...`, 'warn');

    // Notify callback if registered
    if (this.onRateLimitCallback) {
      this.onRateLimitCallback({
        type: 'rate_limit',
        waitMs,
        message: reason
      });
    }

    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * Record a request in usage stats
   * @param tokens - Number of tokens used
   * @param texts - Number of texts embedded
   */
  private recordRequest(tokens: number, texts: number): void {
    const now = Date.now();

    // Update sliding window
    this.requestWindow.push({ timestamp: now, tokens });

    // Update session stats
    this.usageStats.sessionTokens += tokens;
    this.usageStats.sessionRequests += 1;
    this.usageStats.sessionTexts += texts;

    // Update cumulative stats
    this.usageStats.totalTokens += tokens;
    this.usageStats.totalRequests += 1;
    this.usageStats.totalTexts += texts;

    // Calculate estimated cost
    this.usageStats.estimatedCostUsd = (this.usageStats.totalTokens / 1000000) * this.rateLimitConfig.costPer1MTokens;

    this.usageStats.updatedAt = now;
    this.updateRateWindow();

    // Save stats on every request to prevent data loss on restart
    this.saveUsageStats();
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): ApiUsageStats {
    this.updateRateWindow();
    return { ...this.usageStats };
  }

  /**
   * Get current rate limit configuration
   */
  getRateLimitConfig(): RateLimitConfig {
    return { ...this.rateLimitConfig };
  }

  /**
   * Update rate limit configuration
   */
  setRateLimitConfig(config: Partial<RateLimitConfig>): void {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
    this.saveRateLimitConfig();
    ztoolkit.log(`[EmbeddingService] Rate limit updated: RPM=${this.rateLimitConfig.rpm}, TPM=${this.rateLimitConfig.tpm}`);
  }

  /**
   * Reset usage statistics
   * @param cumulative - If true, also resets cumulative stats
   */
  resetUsageStats(cumulative: boolean = false): void {
    if (cumulative) {
      this.usageStats = this.createEmptyStats();
      ztoolkit.log('[EmbeddingService] Reset all usage stats');
    } else {
      // Only reset session stats
      this.usageStats.sessionTokens = 0;
      this.usageStats.sessionRequests = 0;
      this.usageStats.sessionTexts = 0;
      ztoolkit.log('[EmbeddingService] Reset session stats');
    }
    this.requestWindow = [];
    this.saveUsageStats();
  }

  /**
   * Set callback for rate limit events
   */
  setRateLimitCallback(callback: (info: { type: string; waitMs: number; message: string }) => void): void {
    this.onRateLimitCallback = callback;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.status.apiConfigured = !!this.config.apiBase && !!this.config.model;
    this.saveConfigToPrefs();
    ztoolkit.log(`[EmbeddingService] Config updated: apiBase=${this.config.apiBase}, model=${this.config.model}, apiKey=${this.config.apiKey ? 'yes' : 'no'}`);
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<EmbeddingConfig, 'apiKey'> & { apiKeyConfigured: boolean } {
    return {
      apiBase: this.config.apiBase,
      model: this.config.model,
      dimensions: this.config.dimensions,
      maxBatchSize: this.config.maxBatchSize,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      apiKeyConfigured: !!this.config.apiKey
    };
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Text to embed
   * @param language - Language hint ('zh', 'en', or 'auto') - used for tracking
   * @param isQuery - Not used for API-based embedding, kept for interface compatibility
   * @throws {EmbeddingAPIError} When API call fails
   */
  async embed(text: string, language?: 'zh' | 'en' | 'auto', _isQuery: boolean = false): Promise<EmbeddingResult> {
    const startTime = Date.now();
    await this.initialize();

    // Detect language for tracking (API doesn't need language-specific models)
    const detectedLang = language === 'auto' || !language
      ? this.detectLanguage(text)
      : language;

    const textPreview = text.substring(0, 50).replace(/\n/g, ' ');
    ztoolkit.log(`[EmbeddingService] embed() start: lang=${detectedLang}, len=${text.length}, text="${textPreview}..."`);

    // Check API configuration
    if (!this.config.apiBase || !this.config.model) {
      const error = new EmbeddingAPIError(
        'API not configured',
        'config',
        { retryable: false }
      );
      ztoolkit.log(`[EmbeddingService] ${error.getUserMessage()}`, 'error');
      this.status.lastError = error.message;
      throw error;
    }

    try {
      const embeddings = await this.callEmbeddingAPI([text]);
      const embedding = embeddings[0];

      const elapsed = Date.now() - startTime;
      ztoolkit.log(`[EmbeddingService] embed() completed: dims=${embedding.length}, time=${elapsed}ms`);

      return {
        embedding: new Float32Array(embedding),
        language: detectedLang,
        dimensions: embedding.length
      };
    } catch (error) {
      // Re-throw if already an EmbeddingAPIError
      if (error instanceof EmbeddingAPIError) {
        this.status.lastError = error.message;
        throw error;
      }
      // Wrap unknown errors
      const wrappedError = new EmbeddingAPIError(
        String(error),
        'unknown',
        { originalError: error }
      );
      ztoolkit.log(`[EmbeddingService] API call failed: ${wrappedError.getUserMessage()}`, 'error');
      this.status.lastError = wrappedError.message;
      throw wrappedError;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param items - Items to embed
   * @param options - Optional settings including pause check callback
   * @throws {EmbeddingAPIError} When API call fails
   */
  async embedBatch(
    items: BatchEmbeddingItem[],
    options?: {
      onPauseCheck?: () => boolean;  // Returns true if should pause/cancel
    }
  ): Promise<Map<string, EmbeddingResult>> {
    const startTime = Date.now();
    await this.initialize();

    ztoolkit.log(`[EmbeddingService] embedBatch() start: ${items.length} items`);

    const results = new Map<string, EmbeddingResult>();
    const pauseCheck = options?.onPauseCheck;

    // Check API configuration
    if (!this.config.apiBase || !this.config.model) {
      const error = new EmbeddingAPIError(
        'API not configured',
        'config',
        { retryable: false }
      );
      ztoolkit.log(`[EmbeddingService] ${error.getUserMessage()}`, 'error');
      this.status.lastError = error.message;
      throw error;
    }

    // Adaptive batch size - start with provider-specific limit, reduce on errors
    const providerMaxBatch = this.getProviderMaxBatchSize();
    let currentBatchSize = Math.min(this.config.maxBatchSize, providerMaxBatch);
    let itemIndex = 0;

    while (itemIndex < items.length) {
      // Check for pause/cancel before each batch
      if (pauseCheck && pauseCheck()) {
        ztoolkit.log(`[EmbeddingService] embedBatch() paused at ${itemIndex}/${items.length}`, 'warn');
        throw new EmbeddingAPIError(
          '索引已暂停 / Indexing paused',
          'paused',
          { retryable: false }  // Not retryable in the normal sense - handled specially
        );
      }

      // Create batch with current batch size
      const batch = items.slice(itemIndex, itemIndex + currentBatchSize);
      const texts = batch.map(item => item.text);

      ztoolkit.log(`[EmbeddingService] Processing batch: items ${itemIndex + 1}-${itemIndex + batch.length}/${items.length} (batchSize=${currentBatchSize})`);

      try {
        // Call API
        const embeddings = await this.callEmbeddingAPI(texts);

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const embedding = embeddings[i];
          const lang = item.language || this.detectLanguage(item.text);

          results.set(item.id, {
            embedding: new Float32Array(embedding),
            language: lang,
            dimensions: embedding.length
          });
        }

        // Move to next batch
        itemIndex += batch.length;

      } catch (error) {
        // Handle payload_too_large by reducing batch size
        if (error instanceof EmbeddingAPIError && error.type === 'payload_too_large') {
          if (currentBatchSize > 1) {
            // Reduce batch size by half, minimum 1
            const newBatchSize = Math.max(1, Math.floor(currentBatchSize / 2));
            ztoolkit.log(`[EmbeddingService] Payload too large, reducing batch size from ${currentBatchSize} to ${newBatchSize}`, 'warn');
            currentBatchSize = newBatchSize;
            // Retry with smaller batch (don't advance itemIndex)
            continue;
          } else {
            // Already at batch size 1, the single item is too large
            ztoolkit.log(`[EmbeddingService] Single item too large to process: ${batch[0]?.id}`, 'error');
            throw new EmbeddingAPIError(
              `单个文本过大无法处理 / Single text too large to process: ${batch[0]?.text.substring(0, 50)}...`,
              'payload_too_large',
              { retryable: false, statusCode: 413 }
            );
          }
        }
        // Re-throw other errors
        throw error;
      }
    }

    const elapsed = Date.now() - startTime;
    ztoolkit.log(`[EmbeddingService] embedBatch() completed: ${results.size}/${items.length} embeddings in ${elapsed}ms`);

    return results;
  }

  /**
   * Estimate token count for texts (rough approximation)
   * OpenAI uses ~4 chars per token for English, ~2 chars per token for CJK
   */
  private estimateTokens(texts: string[]): number {
    let total = 0;
    for (const text of texts) {
      // Check for Chinese/Japanese/Korean characters
      const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
      const otherChars = text.length - cjkChars;
      // CJK: ~1.5 tokens per char, Other: ~0.25 tokens per char
      total += Math.ceil(cjkChars * 1.5 + otherChars * 0.25);
    }
    return total;
  }

  /**
   * Detect error type from error object
   */
  private detectErrorType(error: any): { type: EmbeddingErrorType; retryAfterMs?: number } {
    const errorMsg = String(error.message || error).toLowerCase();
    const statusCode = error.status || error.statusCode || error.xmlhttp?.status;

    // Network errors - check error message patterns
    const networkErrorPatterns = [
      'network', 'timeout', 'econnrefused', 'enotfound', 'econnreset',
      'etimedout', 'ehostunreach', 'enetunreach', 'socket',
      'ns_error_net', 'connection refused', 'dns', 'getaddrinfo',
      'unable to connect', 'fetch failed', 'aborted'
    ];

    for (const pattern of networkErrorPatterns) {
      if (errorMsg.includes(pattern)) {
        return { type: 'network' };
      }
    }

    // HTTP status code based detection
    if (statusCode) {
      if (statusCode === 429) {
        let retryAfterMs = 60000; // default 60s
        if (error.headers?.['retry-after']) {
          retryAfterMs = parseInt(error.headers['retry-after'], 10) * 1000;
        }
        return { type: 'rate_limit', retryAfterMs };
      }
      if (statusCode === 413) {
        return { type: 'payload_too_large' };
      }
      if (statusCode === 401 || statusCode === 403) {
        return { type: 'auth' };
      }
      if (statusCode === 400) {
        return { type: 'invalid_request' };
      }
      if (statusCode >= 500) {
        return { type: 'server' };
      }
    }

    // Check for auth-related messages
    if (errorMsg.includes('unauthorized') || errorMsg.includes('invalid api key') ||
        errorMsg.includes('authentication') || errorMsg.includes('forbidden')) {
      return { type: 'auth' };
    }

    // Check for payload too large patterns
    if (errorMsg.includes('413') || errorMsg.includes('payload too large') ||
        errorMsg.includes('request entity too large') || errorMsg.includes('content too large')) {
      return { type: 'payload_too_large' };
    }

    return { type: 'unknown' };
  }

  /**
   * Call the embedding API using Zotero.HTTP
   * @throws {EmbeddingAPIError} When API call fails after all retries
   */
  private async callEmbeddingAPI(texts: string[]): Promise<number[][]> {
    // Validate and clean input texts
    const cleanTexts = texts.map(t => t.trim()).filter(t => t.length > 0);
    if (cleanTexts.length === 0) {
      throw new EmbeddingAPIError(
        'No valid texts to embed (all empty after trimming)',
        'invalid_request',
        { retryable: false }
      );
    }
    if (cleanTexts.length !== texts.length) {
      ztoolkit.log(`[EmbeddingService] Filtered ${texts.length - cleanTexts.length} empty texts, ${cleanTexts.length} remaining`, 'warn');
    }
    texts = cleanTexts;

    const provider = this.getEffectiveProvider();
    const url = this.getEmbeddingEndpoint();

    ztoolkit.log(`[EmbeddingService] API call: provider=${provider}, url=${url}`);

    // Estimate tokens for rate limit check
    const estimatedTokens = this.estimateTokens(texts);

    // Check rate limits before making request
    const rateCheck = this.checkRateLimit(estimatedTokens);
    if (!rateCheck.canProceed) {
      await this.waitForRateLimit(rateCheck.waitMs, rateCheck.reason || 'Rate limit');
    }

    // Build request body based on provider
    let requestBody: any;

    if (provider === 'ollama') {
      // Ollama native API format (/api/embed) - supports batch input
      requestBody = {
        model: this.config.model,
        input: texts.length === 1 ? texts[0] : texts  // Single string or array
      };
    } else {
      // OpenAI-compatible format (OpenAI, ollama-openai, etc.)
      requestBody = {
        model: this.config.model,
        input: texts
      };

      // Add dimensions if supported by the model
      if (this.config.dimensions && this.supportsCustomDimensions()) {
        requestBody.dimensions = this.config.dimensions;
      }
    }

    let lastError: EmbeddingAPIError | null = null;

    // Calculate request body size for logging
    const requestBodyStr = JSON.stringify(requestBody);
    const requestBodySize = requestBodyStr.length;
    const totalTextLength = texts.reduce((sum, t) => sum + t.length, 0);

    ztoolkit.log(`[EmbeddingService] Request details: texts=${texts.length}, totalTextChars=${totalTextLength}, bodySize=${requestBodySize}, model=${this.config.model}`);

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        // Add Authorization header if API key is provided
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        ztoolkit.log(`[EmbeddingService] Sending request attempt ${attempt + 1}/${this.config.maxRetries} to ${url}`);

        // Use Zotero.HTTP.request which is available in Zotero environment
        const response = await Zotero.HTTP.request('POST', url, {
          headers,
          body: requestBodyStr,
          timeout: this.config.timeout,
          responseType: 'json'
        });

        ztoolkit.log(`[EmbeddingService] Response received: status=${response.status}`);

        const data = response.response;

        // Parse response based on provider
        let embeddings: number[][];
        let tokensUsed = estimatedTokens; // fallback to estimate

        if (provider === 'ollama') {
          // Ollama /api/embed response format: { embeddings: [[...], [...]] } for batch
          // or { embedding: [...] } for single (older format)
          if (!data) {
            throw new EmbeddingAPIError(
              `Invalid Ollama response: empty response`,
              'invalid_request',
              { retryable: false }
            );
          }
          if (data.embeddings && Array.isArray(data.embeddings)) {
            // New /api/embed format with batch support
            embeddings = data.embeddings;
          } else if (data.embedding && Array.isArray(data.embedding)) {
            // Single embedding response (legacy or single input)
            embeddings = [data.embedding];
          } else {
            throw new EmbeddingAPIError(
              `Invalid Ollama response: ${JSON.stringify(data).substring(0, 200)}`,
              'invalid_request',
              { retryable: false }
            );
          }
          // Ollama doesn't return token usage in native API
        } else {
          // OpenAI-compatible response format: { data: [{ embedding: [...], index: 0 }] }
          if (!data || !data.data) {
            throw new EmbeddingAPIError(
              `Invalid API response: ${JSON.stringify(data).substring(0, 200)}`,
              'invalid_request',
              { retryable: false }
            );
          }

          // Extract token usage from response
          if (data.usage && typeof data.usage.total_tokens === 'number') {
            tokensUsed = data.usage.total_tokens;
          } else if (data.usage && typeof data.usage.prompt_tokens === 'number') {
            tokensUsed = data.usage.prompt_tokens;
          }

          // Sort by index to ensure correct order
          const sortedData = data.data.sort((a: any, b: any) => a.index - b.index);
          embeddings = sortedData.map((item: any) => item.embedding);
        }

        // Record the request in usage stats
        this.recordRequest(tokensUsed, texts.length);

        ztoolkit.log(`[EmbeddingService] Success: received ${embeddings.length} embeddings, dims=${embeddings[0]?.length}, tokens=${tokensUsed}`);

        // Auto-detect and save actual dimensions from first embedding
        if (embeddings.length > 0 && embeddings[0].length > 0) {
          const actualDims = embeddings[0].length;
          if (this.detectedDimensions !== actualDims) {
            this.detectedDimensions = actualDims;
            this.saveDetectedDimensions(actualDims);
            ztoolkit.log(`[EmbeddingService] Auto-detected dimensions: ${actualDims}, provider: ${provider}`);
          }
        }

        // Store detected provider for future requests
        if (!this.detectedProvider) {
          this.detectedProvider = provider;
          ztoolkit.log(`[EmbeddingService] Auto-detected provider: ${provider}`);
        }

        return embeddings;

      } catch (error: any) {
        // Log raw error details for debugging
        let responseBody = '';
        try {
          // Zotero.HTTP errors have xmlhttp property with the full XMLHttpRequest object
          if (error.xmlhttp?.responseText) {
            responseBody = error.xmlhttp.responseText.substring(0, 1000);
          } else if (error.responseText) {
            responseBody = error.responseText.substring(0, 1000);
          } else if (error.response) {
            responseBody = typeof error.response === 'string'
              ? error.response.substring(0, 1000)
              : JSON.stringify(error.response).substring(0, 1000);
          }
        } catch (e) {
          responseBody = '[Unable to parse response body]';
        }

        const statusCode = error.status || error.statusCode || error.xmlhttp?.status;

        ztoolkit.log(`[EmbeddingService] Raw error details:`, 'error');
        ztoolkit.log(`[EmbeddingService]   - message: ${error.message}`, 'error');
        ztoolkit.log(`[EmbeddingService]   - status: ${statusCode}`, 'error');
        ztoolkit.log(`[EmbeddingService]   - name: ${error.name}`, 'error');
        if (responseBody) {
          ztoolkit.log(`[EmbeddingService]   - responseBody: ${responseBody}`, 'error');
        }

        // If already an EmbeddingAPIError, use it directly
        if (error instanceof EmbeddingAPIError) {
          lastError = error;
        } else {
          // Detect error type and create EmbeddingAPIError
          const { type, retryAfterMs } = this.detectErrorType(error);

          // Try to extract error details from response body
          let errorDetails = '';
          if (responseBody) {
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.error?.message) {
                errorDetails = ` (${parsed.error.message})`;
              } else if (parsed.message) {
                errorDetails = ` (${parsed.message})`;
              } else if (parsed.detail) {
                errorDetails = ` (${parsed.detail})`;
              }
            } catch {
              // Not JSON, use first 100 chars of response
              if (responseBody.length > 0 && responseBody.length < 200) {
                errorDetails = ` (${responseBody})`;
              }
            }
          }

          lastError = new EmbeddingAPIError(
            (error.message || String(error)) + errorDetails,
            type,
            {
              statusCode,
              retryAfterMs,
              originalError: error
            }
          );
        }

        ztoolkit.log(`[EmbeddingService] API attempt ${attempt + 1}/${this.config.maxRetries} failed: ${lastError.type} (status=${lastError.statusCode}) - ${lastError.message}`, 'warn');

        // For non-retryable errors or payload_too_large (handled by embedBatch), throw immediately
        if (!lastError.retryable || lastError.type === 'payload_too_large') {
          ztoolkit.log(`[EmbeddingService] Non-retryable error or payload_too_large (${lastError.type}), stopping retries`, 'error');
          throw lastError;
        }

        // Handle rate limit - wait the specified time
        if (lastError.type === 'rate_limit') {
          this.usageStats.rateLimitHits++;
          const waitMs = lastError.retryAfterMs || 60000;
          await this.waitForRateLimit(waitMs, 'API returned 429 rate limit');
          continue; // retry immediately after waiting
        }

        // Wait before retry (exponential backoff) for retryable errors
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          ztoolkit.log(`[EmbeddingService] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      ztoolkit.log(`[EmbeddingService] All ${this.config.maxRetries} retries failed: ${lastError.getUserMessage()}`, 'error');
      throw lastError;
    }

    throw new EmbeddingAPIError('API call failed after all retries', 'unknown');
  }

  /**
   * Simple language detection
   */
  detectLanguage(text: string): 'zh' | 'en' {
    const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
    const chineseChars = (text.match(chineseRegex) || []).length;
    const totalChars = text.replace(/\s/g, '').length;

    return totalChars > 0 && chineseChars / totalChars > 0.3 ? 'zh' : 'en';
  }


  /**
   * Check if service is ready
   */
  async isReady(): Promise<boolean> {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch {
        return false;
      }
    }
    return this.status.apiConfigured;
  }

  /**
   * Get service status
   */
  getStatus(): EmbeddingServiceStatus {
    return { ...this.status };
  }

  /**
   * Check if using fallback mode (API not configured)
   */
  isFallbackMode(): boolean {
    return !this.config.apiBase || !this.config.model;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; dimensions?: number; provider?: string }> {
    if (!this.config.apiBase || !this.config.model) {
      return { success: false, message: 'API base or model not configured' };
    }

    // Clear detected provider to force re-detection
    this.detectedProvider = null;

    try {
      const result = await this.embed('test', 'en');
      const provider = this.getEffectiveProvider();
      const providerLabel = this.getProviderLabel(provider);

      return {
        success: true,
        message: `Connection successful. Provider: ${providerLabel}, Model: ${this.config.model}`,
        dimensions: result.dimensions,
        provider: provider
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Get human-readable label for provider type
   */
  private getProviderLabel(provider: ApiProviderType): string {
    switch (provider) {
      case 'ollama': return 'Ollama (Native API)';
      case 'ollama-openai': return 'Ollama (OpenAI Compatible)';
      case 'openai': return 'OpenAI Compatible';
      default: return provider;
    }
  }

  /**
   * Get detected provider (null if not yet detected)
   */
  getDetectedProvider(): ApiProviderType | null {
    return this.detectedProvider;
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.initialized = false;
    this.initPromise = null;
    this.status = {
      initialized: false,
      apiConfigured: false
    };
    ztoolkit.log('[EmbeddingService] Destroyed');
  }
}

// Singleton instance
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService(config);
  }
  return embeddingServiceInstance;
}

/**
 * Reset the singleton instance (for shutdown cleanup)
 */
export function resetEmbeddingService(): void {
  if (embeddingServiceInstance) {
    embeddingServiceInstance.destroy();
    embeddingServiceInstance = null;
  }
}
