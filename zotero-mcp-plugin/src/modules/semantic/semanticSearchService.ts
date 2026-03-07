/**
 * Semantic Search Service for Zotero MCP Plugin
 *
 * Main service that orchestrates:
 * - Embedding generation (EmbeddingService)
 * - Vector storage and search (VectorStore)
 * - Text processing (TextChunker)
 * - Integration with existing Zotero services
 */

import { getEmbeddingService, EmbeddingService, EmbeddingAPIError, EmbeddingErrorType } from './embeddingService';
import { getVectorStore, VectorStore } from './vectorStore';
import { getTextChunker, TextChunker } from './textChunker';
import { TextFormatter } from '../textFormatter';
import { PDFProcessor } from '../pdfProcessor';

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

// Preference key for persisting index progress
const PREF_INDEX_PROGRESS = 'extensions.zotero.zotero-mcp-plugin.semantic.indexProgress';

// ============ Interfaces ============

export interface SemanticSearchOptions {
  topK?: number;              // Number of results
  minScore?: number;          // Minimum similarity threshold
  language?: 'zh' | 'en' | 'all';  // Language filter
  itemKeys?: string[];        // Limit to specific items
}

export interface SemanticSearchResult {
  itemKey: string;
  parentKey?: string;
  title: string;
  creators?: string;
  year?: number;
  itemType?: string;
  score: number;
  matchedChunks: Array<{
    chunkId: number;
    text: string;
    score: number;
  }>;
}

export interface IndexProgress {
  total: number;
  processed: number;
  currentItem?: string;
  status: 'idle' | 'indexing' | 'paused' | 'completed' | 'error' | 'aborted';
  error?: string;
  errorType?: EmbeddingErrorType;  // Type of error for UI display
  errorRetryable?: boolean;        // Whether the error can be retried
  startTime?: number;
  estimatedRemaining?: number;
  failedCount?: number;            // Number of failed items
}

export interface SemanticServiceStats {
  indexStats: {
    totalVectors: number;
    totalItems: number;
    zhVectors: number;
    enVectors: number;
    cachedContentItems?: number;
    cachedContentSizeBytes?: number;
    dbSizeBytes?: number;
  };
  serviceStatus: {
    initialized: boolean;
    embeddingReady: boolean;
    fallbackMode: boolean;
  };
  indexProgress: IndexProgress;
}

// ============ Service Implementation ============

export class SemanticSearchService {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private textChunker: TextChunker;

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private indexProgress: IndexProgress = {
    total: 0,
    processed: 0,
    status: 'idle',
    failedCount: 0
  };

  // Pause/Resume control flags
  private _paused = false;
  private _aborted = false;
  private _pauseResolve: (() => void) | null = null;

  // Error handling
  private _onErrorCallback?: (error: EmbeddingAPIError) => void;
  private _failedItems: Map<string, { error: string; errorType: EmbeddingErrorType; timestamp: number }> = new Map();

  constructor() {
    ztoolkit.log(`[SemanticSearch] Constructor called`);
    this.embeddingService = getEmbeddingService();
    this.vectorStore = getVectorStore();
    this.textChunker = getTextChunker();
    ztoolkit.log(`[SemanticSearch] Obtained VectorStore instance`);
  }

  /**
   * Initialize the semantic search service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const startTime = Date.now();
    ztoolkit.log('[SemanticSearch] Initializing...');

    try {
      // Load persisted index progress (for resuming after restart)
      this.loadIndexProgress();

      // Initialize vector store first (faster)
      await this.vectorStore.initialize();

      // Initialize embedding service (may take longer due to model loading)
      await this.embeddingService.initialize();

      this.initialized = true;
      const elapsed = Date.now() - startTime;
      ztoolkit.log(`[SemanticSearch] Initialized in ${elapsed}ms`);

    } catch (error) {
      ztoolkit.log(`[SemanticSearch] Initialization failed: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Load persisted index progress from preferences
   */
  private loadIndexProgress(): void {
    try {
      const progressJson = Zotero.Prefs.get(PREF_INDEX_PROGRESS, true);
      if (progressJson) {
        const saved = JSON.parse(String(progressJson));
        // Only restore if it was paused or indexing (not completed/idle)
        if (saved.status === 'paused' || saved.status === 'indexing') {
          this.indexProgress = {
            total: saved.total || 0,
            processed: saved.processed || 0,
            status: 'paused',  // Always show as paused after restart
            currentItem: saved.currentItem,
            startTime: saved.startTime,
            estimatedRemaining: saved.estimatedRemaining
          };
          this._paused = true;  // Mark as paused so it can be resumed
          ztoolkit.log(`[SemanticSearch] Restored paused index progress: ${this.indexProgress.processed}/${this.indexProgress.total}`);
        }
      }
    } catch (e) {
      ztoolkit.log(`[SemanticSearch] Failed to load index progress: ${e}`, 'warn');
    }
  }

  /**
   * Save index progress to preferences
   */
  private saveIndexProgress(): void {
    try {
      const toSave = {
        total: this.indexProgress.total,
        processed: this.indexProgress.processed,
        status: this.indexProgress.status,
        currentItem: this.indexProgress.currentItem,
        startTime: this.indexProgress.startTime,
        estimatedRemaining: this.indexProgress.estimatedRemaining
      };
      Zotero.Prefs.set(PREF_INDEX_PROGRESS, JSON.stringify(toSave), true);
    } catch (e) {
      ztoolkit.log(`[SemanticSearch] Failed to save index progress: ${e}`, 'warn');
    }
  }

  /**
   * Clear persisted index progress
   */
  private clearSavedIndexProgress(): void {
    try {
      Zotero.Prefs.clear(PREF_INDEX_PROGRESS, true);
    } catch (e) {
      // Ignore errors
    }
  }

  // ============ Search Methods ============

  /**
   * Semantic search
   */
  async search(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    await this.initialize();

    const {
      topK = 10,
      minScore = 0.1,  // Lowered from 0.3 to allow more results through
      language = 'all',
      itemKeys
    } = options;

    const startTime = Date.now();
    ztoolkit.log(`[SemanticSearch] Searching: "${query.substring(0, 50)}..."`);

    try {
      // 1. Generate query embedding (isQuery=true for BGE instruction prefix)
      ztoolkit.log(`[SemanticSearch] Step 1: Generating query embedding...`);
      const queryEmbedding = await this.embeddingService.embed(query, 'auto', true);
      ztoolkit.log(`[SemanticSearch] Query embedding: lang=${queryEmbedding.language}, dims=${queryEmbedding.dimensions}`);

      // 2. Vector search - use detected language when language option is 'all' for better performance
      // This significantly reduces search space (up to 50% reduction)
      const searchLanguage = language === 'all' ? queryEmbedding.language : language;
      ztoolkit.log(`[SemanticSearch] Step 2: Vector search (topK=${topK * 3}, minScore=${minScore}, lang=${searchLanguage})...`);
      const vectorResults = await this.vectorStore.search(queryEmbedding.embedding, {
        topK: topK * 3,  // Get more for deduplication
        language: searchLanguage,
        itemKeys,
        minScore
      });
      ztoolkit.log(`[SemanticSearch] Vector search returned ${vectorResults.length} results`);

      // 3. Aggregate by item
      const itemResultsMap = new Map<string, {
        itemKey: string;
        chunks: Array<{ chunkId: number; text: string; score: number }>;
        maxScore: number;
      }>();

      for (const result of vectorResults) {
        const existing = itemResultsMap.get(result.itemKey);
        if (existing) {
          existing.chunks.push({
            chunkId: result.chunkId,
            text: result.chunkText,
            score: result.score
          });
          existing.maxScore = Math.max(existing.maxScore, result.score);
        } else {
          itemResultsMap.set(result.itemKey, {
            itemKey: result.itemKey,
            chunks: [{
              chunkId: result.chunkId,
              text: result.chunkText,
              score: result.score
            }],
            maxScore: result.score
          });
        }
      }

      // 4. Pure semantic search (no hybrid)
      ztoolkit.log(`[SemanticSearch] Step 3: Aggregated into ${itemResultsMap.size} unique items`);

      const finalResults: SemanticSearchResult[] = Array.from(itemResultsMap.values())
        .sort((a, b) => b.maxScore - a.maxScore)
        .slice(0, topK)
        .map(r => ({
          itemKey: r.itemKey,
          title: '',
          score: r.maxScore,
          matchedChunks: r.chunks.sort((a, b) => b.score - a.score).slice(0, 3)
        }));

      // 5. Fill in item metadata
      await this.fillItemMetadata(finalResults);

      const searchTime = Date.now() - startTime;
      ztoolkit.log(`[SemanticSearch] Found ${finalResults.length} results in ${searchTime}ms`);

      return finalResults.slice(0, topK);

    } catch (error) {
      ztoolkit.log(`[SemanticSearch] Search error: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Find similar items
   */
  async findSimilar(
    itemKey: string,
    options: { topK?: number; minScore?: number } = {}
  ): Promise<SemanticSearchResult[]> {
    await this.initialize();

    const { topK = 5, minScore = 0.3 } = options;  // Lowered from 0.5

    try {
      // Get item's vectors
      const itemVectors = await this.vectorStore.getItemVectors(itemKey);

      if (itemVectors.length === 0) {
        ztoolkit.log(`[SemanticSearch] Item ${itemKey} not indexed`);
        return [];
      }

      // Use first chunk vector as query (or could average all)
      const queryVector = itemVectors[0].vector;

      // Search for similar
      const results = await this.vectorStore.search(queryVector, {
        topK: topK + 1,
        minScore
      });

      // Filter out the source item and map results
      const filteredResults = results
        .filter(r => r.itemKey !== itemKey)
        .slice(0, topK)
        .map(r => ({
          itemKey: r.itemKey,
          title: '',
          score: r.score,
          matchedChunks: [{
            chunkId: r.chunkId,
            text: r.chunkText,
            score: r.score
          }]
        }));

      // Fill metadata
      await this.fillItemMetadata(filteredResults);

      return filteredResults;

    } catch (error) {
      ztoolkit.log(`[SemanticSearch] findSimilar error: ${error}`, 'error');
      throw error;
    }
  }

  // ============ Indexing Methods ============

  /**
   * Build or update the semantic index
   */
  async buildIndex(options: {
    itemKeys?: string[];
    rebuild?: boolean;
    onProgress?: (progress: IndexProgress) => void;
  } = {}): Promise<IndexProgress> {
    await this.initialize();

    const { itemKeys, rebuild = false, onProgress } = options;

    try {
      // Reset control flags
      this._paused = false;
      this._aborted = false;
      this._pauseResolve = null;

      this.indexProgress = {
        total: 0,
        processed: 0,
        status: 'indexing',
        startTime: Date.now()
      };

      // Check for dimension mismatch before indexing (unless rebuild)
      if (!rebuild) {
        const dimensionCheck = await this.checkDimensionCompatibility();
        if (!dimensionCheck.compatible) {
          ztoolkit.log(`[SemanticSearch] Dimension mismatch detected: stored=${dimensionCheck.storedDimensions}, current=${dimensionCheck.currentDimensions}`, 'warn');
          this.indexProgress.status = 'error';
          this.indexProgress.error = dimensionCheck.message;
          this.indexProgress.errorType = 'config';
          this.indexProgress.errorRetryable = false;
          onProgress?.(this.indexProgress);
          return this.indexProgress;
        }
      }

      // Get items to index
      let items: any[];
      if (itemKeys && itemKeys.length > 0) {
        items = await this.getItemsByKeys(itemKeys);
      } else {
        items = await this.getItemsWithContent();
      }

      // Filter already indexed items (unless rebuild)
      if (!rebuild) {
        const indexedItems = await this.vectorStore.getIndexedItems();
        items = items.filter(item => !indexedItems.has(item.key));
      } else {
        // For rebuild: clear all existing index data first
        ztoolkit.log(`[SemanticSearch] Rebuild mode: clearing existing index data...`);

        // Get stats before clear for verification
        const statsBefore = await this.vectorStore.getStats();
        ztoolkit.log(`[SemanticSearch] Before clear: ${statsBefore.totalVectors} vectors, ${statsBefore.totalItems} items`);

        await this.vectorStore.clear();

        // Verify clear worked
        const statsAfter = await this.vectorStore.getStats();
        ztoolkit.log(`[SemanticSearch] After clear: ${statsAfter.totalVectors} vectors, ${statsAfter.totalItems} items`);

        if (statsAfter.totalVectors > 0) {
          ztoolkit.log(`[SemanticSearch] WARNING: clear() did not remove all vectors!`, 'warn');
        }

        ztoolkit.log(`[SemanticSearch] Existing index data cleared`);
      }

      this.indexProgress.total = items.length;
      onProgress?.(this.indexProgress);

      if (items.length === 0) {
        this.indexProgress.status = 'completed';
        return this.indexProgress;
      }

      ztoolkit.log(`[SemanticSearch] Indexing ${items.length} items...`);

      // Create a pool of PDFProcessors for true parallel processing
      const concurrency = 5;  // Process 5 items in parallel
      const processorPool: PDFProcessor[] = [];
      for (let p = 0; p < concurrency; p++) {
        processorPool.push(new PDFProcessor(ztoolkit));
      }
      ztoolkit.log(`[SemanticSearch] Created ${concurrency} PDFProcessor workers for parallel processing`);

      try {
        // Process in parallel batches for better throughput
        for (let i = 0; i < items.length; i += concurrency) {
          // Check for abort
          if (this._aborted) {
            this.indexProgress.status = 'aborted';
            ztoolkit.log(`[SemanticSearch] Indexing aborted at ${this.indexProgress.processed}/${this.indexProgress.total}`);
            break;
          }

          // Check for pause - wait until resumed
          if (this._paused) {
            ztoolkit.log(`[SemanticSearch] Indexing paused at ${this.indexProgress.processed}/${this.indexProgress.total}`);
            onProgress?.(this.indexProgress);
            await this.waitWhilePaused();
            // After resume, check if aborted while paused
            if (this._aborted) {
              this.indexProgress.status = 'aborted';
              ztoolkit.log(`[SemanticSearch] Indexing aborted after pause`);
              break;
            }
            this.indexProgress.status = 'indexing';
            ztoolkit.log(`[SemanticSearch] Indexing resumed`);
          }

          const batch = items.slice(i, i + concurrency);

          // Process batch items in parallel, each with its own processor
          const results = await Promise.allSettled(
            batch.map(async (item, batchIndex) => {
              this.indexProgress.currentItem = item.key;
              // Each item gets its own processor from the pool
              const processor = processorPool[batchIndex % processorPool.length];
              await this.indexItemWithProcessor(item, processor);
              return item.key; // Return item key for tracking
            })
          );

          // Count processed items and handle errors
          let hasAPIError = false;
          let apiError: EmbeddingAPIError | null = null;

          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const item = batch[j];

            if (result.status === 'fulfilled') {
              this.indexProgress.processed++;
            } else {
              // Check if this is an EmbeddingAPIError
              const error = result.reason;
              if (error instanceof EmbeddingAPIError) {
                // Special handling for pause - don't record as failed
                if (error.type === 'paused') {
                  ztoolkit.log(`[SemanticSearch] Item ${item.key} interrupted by pause`);
                  // Don't increment processed - will retry after resume
                  continue;
                }

                hasAPIError = true;
                apiError = error;

                // Record failed item
                this._failedItems.set(item.key, {
                  error: error.getUserMessage(),
                  errorType: error.type,
                  timestamp: Date.now()
                });
                this.indexProgress.failedCount = this._failedItems.size;

                ztoolkit.log(`[SemanticSearch] API error for item ${item.key}: ${error.type} - ${error.message}`, 'error');
              } else {
                // Other errors (PDF extraction, etc.) - just log and continue
                this.indexProgress.processed++;
                ztoolkit.log(`[SemanticSearch] Failed to index item ${item.key}: ${error}`, 'warn');
              }
            }
          }

          // If there was an API error, auto-pause and notify
          if (hasAPIError && apiError) {
            ztoolkit.log(`[SemanticSearch] API error detected, auto-pausing indexing...`, 'warn');

            // Set error info in progress
            this.indexProgress.error = apiError.getUserMessage();
            this.indexProgress.errorType = apiError.type;
            this.indexProgress.errorRetryable = apiError.retryable;

            // Auto-pause
            this._paused = true;
            this.indexProgress.status = 'paused';
            this.saveIndexProgress();

            // Notify via callback
            if (this._onErrorCallback) {
              this._onErrorCallback(apiError);
            }

            onProgress?.(this.indexProgress);

            // Wait for user to resume or abort
            await this.waitWhilePaused();

            // After resume, check if aborted
            if (this._aborted) {
              this.indexProgress.status = 'aborted';
              ztoolkit.log(`[SemanticSearch] Indexing aborted after API error`);
              break;
            }

            // Clear error state and continue
            this.indexProgress.error = undefined;
            this.indexProgress.errorType = undefined;
            this.indexProgress.errorRetryable = undefined;
            this.indexProgress.status = 'indexing';
            ztoolkit.log(`[SemanticSearch] Indexing resumed after API error`);
          }

          // Update estimated remaining time
          const elapsed = Date.now() - (this.indexProgress.startTime || 0);
          const avgTime = elapsed / this.indexProgress.processed;
          this.indexProgress.estimatedRemaining =
            avgTime * (this.indexProgress.total - this.indexProgress.processed);

          onProgress?.(this.indexProgress);

          // Save progress periodically (every 5 batches) for resume after restart
          if (Math.floor(i / concurrency) % 5 === 0) {
            this.saveIndexProgress();
          }

          // Yield to UI periodically
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      } finally {
        // Clean up all processors in the pool
        for (const processor of processorPool) {
          processor.terminate();
        }
        ztoolkit.log(`[SemanticSearch] Terminated ${processorPool.length} PDFProcessor workers`);
      }

      // Only set completed if not aborted
      if (this.indexProgress.status !== 'aborted') {
        this.indexProgress.status = 'completed';
        this.clearSavedIndexProgress();  // Clear persisted state on completion
      }
      onProgress?.(this.indexProgress);

      ztoolkit.log(`[SemanticSearch] Indexing finished: ${this.indexProgress.processed} items, status=${this.indexProgress.status}`);
      return this.indexProgress;

    } catch (error) {
      this.indexProgress.status = 'error';
      this.indexProgress.error = String(error);
      ztoolkit.log(`[SemanticSearch] Indexing failed: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Index a single item (creates its own PDFProcessor)
   */
  async indexItem(item: any): Promise<void> {
    return this.indexItemWithProcessor(item, null);
  }

  /**
   * Index a single item with optional shared PDFProcessor
   */
  async indexItemWithProcessor(item: any, sharedProcessor: PDFProcessor | null): Promise<void> {
    const startTime = Date.now();
    const itemTitle = item.getDisplayTitle?.() || item.key;
    ztoolkit.log(`[SemanticSearch] indexItem() start: ${item.key} "${itemTitle.substring(0, 30)}..."`);

    // Get timestamps for fast change detection
    const itemModified = item.dateModified || '';
    let attachmentModified = '';

    // Get latest attachment modification time
    if (item.isRegularItem?.()) {
      const attachmentIds = item.getAttachments?.() || [];
      for (const attId of attachmentIds) {
        try {
          const att = await Zotero.Items.getAsync(attId);
          if (att?.dateModified && att.dateModified > attachmentModified) {
            attachmentModified = att.dateModified;
          }
        } catch (e) {
          // Skip failed attachments
        }
      }
    }

    // Fast check: if timestamps haven't changed, skip entirely (no content extraction needed)
    const needsCheckByTimestamp = await this.vectorStore.needsReindexByTimestamp(
      item.key, itemModified, attachmentModified
    );
    if (!needsCheckByTimestamp) {
      ztoolkit.log(`[SemanticSearch] indexItem() skip: timestamps unchanged for ${item.key}`);
      return;
    }

    // Timestamps changed - try to use cached content first (avoid PDF re-extraction)
    let content: string;
    let contentHash: string;

    const cached = await this.vectorStore.getCachedContent(item.key);
    if (cached) {
      // Check if cached content hash matches stored index hash
      const needsIndex = await this.vectorStore.needsReindex(item.key, cached.hash);
      if (!needsIndex) {
        // Content unchanged, just update timestamps
        const status = await this.vectorStore.getIndexStatus(item.key);
        if (status) {
          await this.vectorStore.updateIndexStatus(
            item.key, status.chunkCount, cached.hash, itemModified, attachmentModified
          );
        }
        ztoolkit.log(`[SemanticSearch] indexItem() skip: cached content unchanged, updated timestamps`);
        return;
      }
      // Cache exists but hash indicates content may have changed - re-extract to verify
      ztoolkit.log(`[SemanticSearch] indexItem() cache hash mismatch, re-extracting content`);
    }

    // Check for pause before content extraction
    if (this._paused || this._aborted) {
      ztoolkit.log(`[SemanticSearch] indexItem() paused/aborted before content extraction: ${item.key}`);
      return;
    }

    // Extract content (PDF extraction happens here)
    content = await this.extractItemContent(item, sharedProcessor);
    if (!content.trim()) {
      // Mark item in index_status even with no content, to prevent repeated rebuild attempts
      await this.vectorStore.updateIndexStatus(item.key, 0, 'empty', itemModified, attachmentModified);
      ztoolkit.log(`[SemanticSearch] indexItem() skip: no content for ${item.key}, marked in index_status to avoid retry loop`);
      return;
    }
    ztoolkit.log(`[SemanticSearch] indexItem() extracted content: ${content.length} chars`);

    // Check for pause after content extraction (before embedding)
    if (this._paused || this._aborted) {
      // Save cached content but don't continue
      await this.vectorStore.setCachedContent(item.key, content, this.hashContent(content));
      ztoolkit.log(`[SemanticSearch] indexItem() paused/aborted after content extraction: ${item.key}`);
      return;
    }

    // Calculate content hash
    contentHash = this.hashContent(content);

    // Cache the extracted content for future use
    await this.vectorStore.setCachedContent(item.key, content, contentHash);
    ztoolkit.log(`[SemanticSearch] indexItem() cached content: ${content.length} chars`);

    // Check if content actually changed (compare with stored hash)
    const needsIndex = await this.vectorStore.needsReindex(item.key, contentHash);
    if (!needsIndex) {
      // Content hash unchanged, just update timestamps
      const status = await this.vectorStore.getIndexStatus(item.key);
      if (status) {
        await this.vectorStore.updateIndexStatus(
          item.key, status.chunkCount, contentHash, itemModified, attachmentModified
        );
      }
      ztoolkit.log(`[SemanticSearch] indexItem() skip: content unchanged, updated timestamps`);
      return;
    }

    // Delete existing vectors
    await this.vectorStore.deleteItemVectors(item.key);

    // Chunk the content
    const chunks = this.textChunker.chunk(content);
    if (chunks.length === 0) {
      ztoolkit.log(`[SemanticSearch] indexItem() skip: no chunks generated`);
      return;
    }
    ztoolkit.log(`[SemanticSearch] indexItem() chunked into ${chunks.length} chunks`);

    // Generate embeddings with pause check
    const batchItems = chunks.map((chunk, idx) => ({
      id: `${item.key}_${idx}`,
      text: chunk
    }));

    const embeddings = await this.embeddingService.embedBatch(batchItems, {
      onPauseCheck: () => this._paused || this._aborted
    });
    ztoolkit.log(`[SemanticSearch] indexItem() generated ${embeddings.size} embeddings`);

    // Store vectors
    const records = chunks.map((chunk, idx) => {
      const embedding = embeddings.get(`${item.key}_${idx}`);
      if (!embedding) return null;

      return {
        itemKey: item.key,
        chunkId: idx,
        vector: embedding.embedding,
        language: embedding.language,
        chunkText: chunk  // Store full chunk (max ~450 chars from TextChunker)
      };
    }).filter(r => r !== null) as any[];

    await this.vectorStore.insertVectorsBatch(records);
    await this.vectorStore.updateIndexStatus(item.key, chunks.length, contentHash, itemModified, attachmentModified);

    const elapsed = Date.now() - startTime;
    ztoolkit.log(`[SemanticSearch] indexItem() completed: ${item.key} (${records.length} vectors) in ${elapsed}ms`);
  }

  /**
   * Delete index for an item
   */
  async deleteItemIndex(itemKey: string): Promise<void> {
    await this.initialize();
    await this.vectorStore.deleteItemVectors(itemKey);
    ztoolkit.log(`[SemanticSearch] Deleted index for item: ${itemKey}`);
  }

  /**
   * Clear all indexes
   */
  async clearIndex(): Promise<void> {
    await this.initialize();
    await this.vectorStore.clear();
    ztoolkit.log('[SemanticSearch] Index cleared');
  }

  // ============ Status Methods ============

  /**
   * Get service statistics
   */
  async getStats(): Promise<SemanticServiceStats> {
    await this.initialize();

    const indexStats = await this.vectorStore.getStats();
    const embeddingStatus = this.embeddingService.getStatus();

    return {
      indexStats,
      serviceStatus: {
        initialized: this.initialized,
        embeddingReady: embeddingStatus.initialized,
        fallbackMode: this.embeddingService.isFallbackMode()
      },
      indexProgress: this.indexProgress
    };
  }

  /**
   * Get current index progress
   */
  getIndexProgress(): IndexProgress {
    return { ...this.indexProgress };
  }

  /**
   * Pause the indexing process
   */
  pauseIndex(): void {
    if (this.indexProgress.status === 'indexing') {
      this._paused = true;
      this.indexProgress.status = 'paused';
      this.saveIndexProgress();  // Persist paused state
      ztoolkit.log('[SemanticSearch] Index paused');
    }
  }

  /**
   * Resume the indexing process
   */
  resumeIndex(): void {
    if (this.indexProgress.status === 'paused' && this._paused) {
      this._paused = false;
      this.indexProgress.status = 'indexing';
      this.saveIndexProgress();  // Update persisted state
      if (this._pauseResolve) {
        this._pauseResolve();
        this._pauseResolve = null;
      }
      ztoolkit.log('[SemanticSearch] Index resumed');
    }
  }

  /**
   * Abort the indexing process
   */
  abortIndex(): void {
    if (this.indexProgress.status === 'indexing' || this.indexProgress.status === 'paused') {
      this._aborted = true;
      this._paused = false;
      this.indexProgress.status = 'aborted';
      this.clearSavedIndexProgress();  // Clear persisted state on abort
      // Release pause lock if paused
      if (this._pauseResolve) {
        this._pauseResolve();
        this._pauseResolve = null;
      }
      ztoolkit.log('[SemanticSearch] Index aborted');
    }
  }

  /**
   * Check if indexing is paused
   */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Set callback for indexing errors
   * Called when an error occurs during indexing (auto-pauses)
   */
  setOnIndexError(callback: (error: EmbeddingAPIError) => void): void {
    this._onErrorCallback = callback;
  }

  /**
   * Get failed items list
   */
  getFailedItems(): Array<{ itemKey: string; error: string; errorType: EmbeddingErrorType; timestamp: number }> {
    return Array.from(this._failedItems.entries()).map(([itemKey, info]) => ({
      itemKey,
      ...info
    }));
  }

  /**
   * Clear failed items list
   */
  clearFailedItems(): void {
    this._failedItems.clear();
    this.indexProgress.failedCount = 0;
  }

  /**
   * Retry failed items
   */
  async retryFailedItems(onProgress?: (progress: IndexProgress) => void): Promise<IndexProgress> {
    const failedItemKeys = Array.from(this._failedItems.keys());
    if (failedItemKeys.length === 0) {
      ztoolkit.log('[SemanticSearch] No failed items to retry');
      return this.indexProgress;
    }

    ztoolkit.log(`[SemanticSearch] Retrying ${failedItemKeys.length} failed items`);

    // Clear failed items before retry
    this._failedItems.clear();

    // Build index for failed items only
    return this.buildIndex({
      itemKeys: failedItemKeys,
      rebuild: false,
      onProgress
    });
  }

  /**
   * Wait while paused
   * Uses a while loop to handle race conditions where resume might be called
   * before the loop enters this function, or if the promise is resolved unexpectedly
   */
  private async waitWhilePaused(): Promise<void> {
    while (this._paused && !this._aborted) {
      await new Promise<void>(resolve => {
        this._pauseResolve = resolve;
      });
    }
  }

  /**
   * Check dimension compatibility between stored vectors and current embedding config
   * Returns an object indicating if they are compatible and details about the mismatch
   */
  async checkDimensionCompatibility(): Promise<{
    compatible: boolean;
    storedDimensions: number | null;
    currentDimensions: number | null;
    message?: string;
  }> {
    try {
      // Get stored dimensions from vector store
      const stats = await this.vectorStore.getStats();
      const storedDimensions = stats.storedDimensions || null;

      // If no stored vectors, any dimension is compatible
      if (!storedDimensions || stats.totalVectors === 0) {
        return {
          compatible: true,
          storedDimensions: null,
          currentDimensions: this.embeddingService.getActualDimensions()
        };
      }

      // Get current dimensions from embedding service
      const currentDimensions = this.embeddingService.getActualDimensions();

      // If we don't know current dimensions yet, we need to detect them first
      // This will happen on first API call, so we can't validate yet
      if (!currentDimensions) {
        return {
          compatible: true,
          storedDimensions,
          currentDimensions: null,
          message: 'Dimensions will be detected on first API call'
        };
      }

      // Check if dimensions match
      if (storedDimensions !== currentDimensions) {
        return {
          compatible: false,
          storedDimensions,
          currentDimensions,
          message: `维度不匹配: 已存储=${storedDimensions}, 当前配置=${currentDimensions}。请使用"重建索引"按钮清除旧数据后重新构建。 / Dimension mismatch: stored=${storedDimensions}, current=${currentDimensions}. Please use "Rebuild Index" to clear old data and rebuild.`
        };
      }

      return {
        compatible: true,
        storedDimensions,
        currentDimensions
      };
    } catch (error) {
      ztoolkit.log(`[SemanticSearch] Error checking dimension compatibility: ${error}`, 'warn');
      // If we can't check, assume compatible to avoid blocking
      return {
        compatible: true,
        storedDimensions: null,
        currentDimensions: null,
        message: 'Could not verify dimension compatibility'
      };
    }
  }

  /**
   * Check if service is ready
   */
  async isReady(): Promise<boolean> {
    try {
      await this.initialize();
      return await this.embeddingService.isReady();
    } catch {
      return false;
    }
  }

  // ============ Private Methods ============

  /**
   * Extract content from item for indexing
   * @param item The Zotero item
   * @param sharedProcessor Optional shared PDFProcessor for better performance
   */
  private async extractItemContent(item: any, sharedProcessor?: PDFProcessor | null): Promise<string> {
    const parts: string[] = [];
    ztoolkit.log(`[SemanticSearch] extractItemContent() start: ${item.key}, type=${item.itemType}`);

    try {
      // Title
      const title = item.getDisplayTitle?.() || item.getField?.('title');
      if (title) {
        parts.push(title);
        ztoolkit.log(`[SemanticSearch] extractItemContent() got title: "${title.substring(0, 50)}..."`);
      }

      // Abstract
      const abstract = item.getField?.('abstractNote');
      if (abstract) {
        parts.push(TextFormatter.htmlToText(abstract));
        ztoolkit.log(`[SemanticSearch] extractItemContent() got abstract: ${abstract.length} chars`);
      }

      // Get content from attachments (full text + annotations)
      if (item.isRegularItem?.()) {
        const attachmentIds = item.getAttachments?.() || [];
        ztoolkit.log(`[SemanticSearch] extractItemContent() checking ${attachmentIds.length} attachments`);
        let annotationCount = 0;
        let fullTextCount = 0;

        for (const attachmentId of attachmentIds) {
          try {
            const attachment = await Zotero.Items.getAsync(attachmentId);
            if (!attachment) continue;

            // Extract full text from PDF attachments using PDFProcessor
            if (attachment.isPDFAttachment?.()) {
              try {
                const filePath = await attachment.getFilePathAsync?.();
                if (filePath) {
                  ztoolkit.log(`[SemanticSearch] extractItemContent() extracting PDF: ${filePath}`);
                  // Use shared processor if provided (much faster for batch processing)
                  const processor = sharedProcessor || new PDFProcessor(ztoolkit);
                  const shouldTerminate = !sharedProcessor;  // Only terminate if we created it
                  try {
                    const textContent = await processor.extractText(filePath);
                    if (textContent && textContent.length > 0) {
                      const maxFullTextLength = 50000;
                      const finalContent = textContent.length > maxFullTextLength
                        ? textContent.substring(0, maxFullTextLength)
                        : textContent;
                      if (textContent.length > maxFullTextLength) {
                        ztoolkit.log(`[SemanticSearch] extractItemContent() truncated to ${maxFullTextLength} chars`);
                      }
                      parts.push(finalContent);
                      fullTextCount++;
                      ztoolkit.log(`[SemanticSearch] extractItemContent() got PDF text: ${finalContent.length} chars`);
                    } else {
                      ztoolkit.log(`[SemanticSearch] extractItemContent() PDF extraction returned empty`);
                    }
                  } finally {
                    if (shouldTerminate) {
                      processor.terminate();
                    }
                  }
                } else {
                  ztoolkit.log(`[SemanticSearch] extractItemContent() no file path for attachment ${attachmentId}`);
                }
              } catch (pdfError) {
                ztoolkit.log(`[SemanticSearch] extractItemContent() PDF extraction failed: ${pdfError}`, 'warn');
              }
            }

            // Extract text from plain text attachments
            if (attachment.attachmentContentType === 'text/plain') {
              try {
                const filePath = await attachment.getFilePathAsync?.();
                if (filePath) {
                  const textContent = await Zotero.File.getContentsAsync(filePath);
                  if (textContent && textContent.length > 0) {
                    parts.push(textContent);
                    fullTextCount++;
                    ztoolkit.log(`[SemanticSearch] extractItemContent() got plain text: ${textContent.length} chars`);
                  }
                }
              } catch (e) {
                ztoolkit.log(`[SemanticSearch] extractItemContent() plain text extraction failed: ${e}`, 'warn');
              }
            }

            // Get annotations from PDF attachments
            if (attachment.isPDFAttachment?.()) {
              const annotations = attachment.getAnnotations?.() || [];
              for (const ann of annotations) {
                const text = ann.annotationText;
                const comment = ann.annotationComment;
                if (text) {
                  parts.push(TextFormatter.htmlToText(text));
                  annotationCount++;
                }
                if (comment) {
                  parts.push(TextFormatter.htmlToText(comment));
                  annotationCount++;
                }
              }
            }
          } catch (e) {
            // Skip failed attachments
            ztoolkit.log(`[SemanticSearch] extractItemContent() attachment error: ${e}`, 'warn');
          }
        }

        if (fullTextCount > 0) {
          ztoolkit.log(`[SemanticSearch] extractItemContent() got ${fullTextCount} full text contents`);
        }
        if (annotationCount > 0) {
          ztoolkit.log(`[SemanticSearch] extractItemContent() got ${annotationCount} annotations`);
        }
      }

      // If it's an annotation item itself
      if (item.isAnnotation?.()) {
        const text = item.annotationText;
        const comment = item.annotationComment;
        if (text) parts.push(TextFormatter.htmlToText(text));
        if (comment) parts.push(TextFormatter.htmlToText(comment));
      }

      // Notes
      if (item.isNote?.()) {
        const noteText = item.getNote?.();
        if (noteText) parts.push(TextFormatter.htmlToText(noteText));
      }

    } catch (error) {
      ztoolkit.log(`[SemanticSearch] extractItemContent() error: ${error}`, 'warn');
    }

    const result = parts.join('\n\n');
    ztoolkit.log(`[SemanticSearch] extractItemContent() done: ${parts.length} parts, total ${result.length} chars`);
    return result;
  }

  /**
   * Fill in item metadata for search results
   */
  private async fillItemMetadata(results: SemanticSearchResult[]): Promise<void> {
    for (const result of results) {
      try {
        const item = await Zotero.Items.getByLibraryAndKeyAsync(
          Zotero.Libraries.userLibraryID,
          result.itemKey
        );

        if (item) {
          result.title = item.getDisplayTitle() || '';
          result.parentKey = item.parentItemKey || undefined;
          result.itemType = item.itemType || undefined;

          // Get creators
          const creators = item.getCreators?.() || [];
          if (creators.length > 0) {
            result.creators = creators
              .map((c: any) => c.lastName || c.name || '')
              .filter((n: string) => n)
              .join(', ');
          }

          // Get year
          const date = item.getField?.('date');
          if (date) {
            const yearMatch = String(date).match(/\d{4}/);
            if (yearMatch) {
              result.year = parseInt(yearMatch[0], 10);
            }
          }
        }
      } catch (e) {
        // Skip failed items
      }
    }
  }

  /**
   * Get items by keys
   */
  private async getItemsByKeys(keys: string[]): Promise<any[]> {
    const items: any[] = [];
    for (const key of keys) {
      try {
        const item = await Zotero.Items.getByLibraryAndKeyAsync(
          Zotero.Libraries.userLibraryID,
          key
        );
        if (item) items.push(item);
      } catch (e) {
        // Skip failed items
      }
    }
    return items;
  }

  /**
   * Get all items with content (regular items with attachments)
   */
  private async getItemsWithContent(): Promise<any[]> {
    try {
      // Get all regular items
      const search = new Zotero.Search();
      search.libraryID = Zotero.Libraries.userLibraryID;
      search.addCondition('itemType', 'isNot', 'attachment');
      search.addCondition('itemType', 'isNot', 'note');
      search.addCondition('itemType', 'isNot', 'annotation');

      const ids = await search.search();
      return Zotero.Items.getAsync(ids);
    } catch (error) {
      ztoolkit.log(`[SemanticSearch] Error getting items: ${error}`, 'warn');
      return [];
    }
  }

  /**
   * Hash content for change detection
   */
  private hashContent(content: string): string {
    // Simple hash using Zotero's utility
    try {
      return Zotero.Utilities.Internal.md5(content);
    } catch {
      // Fallback: simple hash
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    }
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.embeddingService.destroy();
    this.initialized = false;
    this.initPromise = null;
    ztoolkit.log('[SemanticSearch] Service destroyed');
  }
}

// Singleton instance
let semanticSearchInstance: SemanticSearchService | null = null;

export function getSemanticSearchService(): SemanticSearchService {
  if (!semanticSearchInstance) {
    ztoolkit.log(`[SemanticSearch] getSemanticSearchService() creating new singleton instance`);
    semanticSearchInstance = new SemanticSearchService();
  } else {
    ztoolkit.log(`[SemanticSearch] getSemanticSearchService() returning existing instance`);
  }
  return semanticSearchInstance;
}

/**
 * Reset the singleton instance (for shutdown cleanup)
 */
export function resetSemanticSearchService(): void {
  if (semanticSearchInstance) {
    semanticSearchInstance.abortIndex();
    semanticSearchInstance.destroy();
    semanticSearchInstance = null;
    ztoolkit.log('[SemanticSearch] Singleton instance reset');
  }
}
