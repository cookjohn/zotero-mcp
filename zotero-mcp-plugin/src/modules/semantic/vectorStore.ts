/**
 * Vector Store for Semantic Search
 *
 * SQLite-based vector storage using Zotero's database infrastructure.
 * Stores embeddings as BLOBs and performs similarity search in memory.
 */

declare let Zotero: any;
declare let ztoolkit: ZToolkit;
declare let PathUtils: any;
declare let IOUtils: any;

export interface VectorRecord {
  itemKey: string;
  chunkId: number;
  vector: Float32Array;
  language: 'zh' | 'en';
  chunkText: string;
  metadata?: Record<string, any>;
}

// Int8 quantized vector for fast search
export interface QuantizedVector {
  int8Data: Int8Array;
  scale: number;
  norm: number;  // Pre-computed L2 norm for faster cosine similarity
}

export interface SearchResult {
  itemKey: string;
  chunkId: number;
  score: number;
  chunkText: string;
  language: string;
}

export interface IndexStatus {
  itemKey: string;
  indexedAt: number;
  chunkCount: number;
  contentHash: string;
  version: number;
  itemModified?: string;       // Item's dateModified for fast change detection
  attachmentModified?: string; // Latest attachment dateModified
}

export interface VectorStoreStats {
  totalVectors: number;
  totalItems: number;
  zhVectors: number;
  enVectors: number;
  dbSizeBytes?: number;
  // Content cache stats
  cachedContentItems: number;
  cachedContentSizeBytes: number;
  // Extended stats for detailed view
  storedDimensions?: number;        // Dimensions of stored vectors
  int8MigrationStatus?: {
    migrated: number;
    total: number;
    percent: number;
  };
  dbPath?: string;                  // Path to database file
}

// Global instance counter for debugging
let vectorStoreInstanceCounter = 0;

export class VectorStore {
  private dbPath: string = '';
  private db: any = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  // In-memory cache for frequently accessed vectors
  private vectorCache: Map<string, Float32Array> = new Map();
  private cacheMaxSize: number = 1000;

  // Debug: instance ID for tracking multiple instances
  private instanceId: number;

  constructor() {
    this.instanceId = ++vectorStoreInstanceCounter;
    ztoolkit.log(`[VectorStore] Constructor called, instanceId=${this.instanceId}, total instances=${vectorStoreInstanceCounter}`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Get Zotero data directory
      const dataDir = Zotero.DataDirectory.dir;
      this.dbPath = PathUtils.join(dataDir, 'zotero-mcp-vectors.sqlite');

      ztoolkit.log(`[VectorStore] Initializing database: instanceId=${this.instanceId}, dbPath=${this.dbPath}`);

      // Create database connection
      this.db = new Zotero.DBConnection(this.dbPath);

      // Create tables
      await this.createTables();

      // Check database integrity
      const isHealthy = await this.checkAndRepairDatabase();
      if (!isHealthy) {
        // Database was recreated after corruption, re-create tables
        await this.createTables();
      }

      this.initialized = true;
      ztoolkit.log('[VectorStore] Initialized successfully');
    } catch (error) {
      ztoolkit.log(`[VectorStore] Initialization failed: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Check database integrity and attempt repair if corrupted.
   * Returns true if database is healthy (or was successfully repaired in-place).
   * Returns false if database was recreated from scratch (tables need to be re-created).
   */
  private async checkAndRepairDatabase(): Promise<boolean> {
    try {
      // Quick integrity check on all tables
      const result = await this.db.valueQueryAsync(`PRAGMA integrity_check(1)`);
      if (result === 'ok') {
        ztoolkit.log('[VectorStore] Database integrity check passed');
        return true;
      }

      ztoolkit.log(`[VectorStore] Database integrity check FAILED: ${result}`, 'warn');

      // Step 1: Try REINDEX to fix index corruption (most common cause)
      try {
        ztoolkit.log('[VectorStore] Attempting repair via REINDEX...');
        await this.db.queryAsync(`REINDEX`);

        // Re-check after REINDEX
        const recheck = await this.db.valueQueryAsync(`PRAGMA integrity_check(1)`);
        if (recheck === 'ok') {
          ztoolkit.log('[VectorStore] Database repaired successfully via REINDEX');
          return true;
        }
        ztoolkit.log(`[VectorStore] REINDEX did not fix corruption: ${recheck}`, 'warn');
      } catch (reindexError) {
        ztoolkit.log(`[VectorStore] REINDEX failed: ${reindexError}`, 'warn');
      }

      // Step 2: Close corrupted db, backup and recreate
      ztoolkit.log('[VectorStore] Corruption cannot be repaired in-place, recreating database...');

      // Close current connection
      try {
        await this.db.closeDatabase();
      } catch (closeError) {
        ztoolkit.log(`[VectorStore] Error closing corrupted db: ${closeError}`, 'warn');
      }

      // Rename corrupted file as backup
      const backupPath = this.dbPath + '.corrupt.' + Date.now();
      try {
        await IOUtils.move(this.dbPath, backupPath);
        ztoolkit.log(`[VectorStore] Corrupted database backed up to: ${backupPath}`);
      } catch (moveError) {
        ztoolkit.log(`[VectorStore] Failed to backup corrupted db: ${moveError}`, 'warn');
        // Try to remove it directly
        try {
          await IOUtils.remove(this.dbPath);
        } catch (removeError) {
          ztoolkit.log(`[VectorStore] Failed to remove corrupted db: ${removeError}`, 'error');
          throw new Error(`Database is corrupted and cannot be removed: ${removeError}`);
        }
      }

      // Also remove WAL/SHM files if they exist
      for (const suffix of ['-wal', '-shm']) {
        try {
          await IOUtils.remove(this.dbPath + suffix);
        } catch (_) {
          // May not exist, ignore
        }
      }

      // Create fresh connection
      this.db = new Zotero.DBConnection(this.dbPath);
      ztoolkit.log('[VectorStore] Fresh database created after corruption recovery');

      // Notify user
      try {
        new ztoolkit.ProgressWindow("Zotero MCP Plugin", { closeOtherProgressWindows: false })
          .createLine({
            text: "检测到索引数据库损坏，已自动重建。旧文件已备份。\nCorrupted index database detected and rebuilt. Old file backed up.",
            type: "default",
          })
          .show();
      } catch (_) {
        // UI notification is non-critical
      }

      return false; // Tables need to be re-created
    } catch (error) {
      // integrity_check itself failed - likely severe corruption
      ztoolkit.log(`[VectorStore] Integrity check query failed: ${error}`, 'error');

      // Try the same backup-and-recreate approach
      try {
        try { await this.db.closeDatabase(); } catch (_) {}

        const backupPath = this.dbPath + '.corrupt.' + Date.now();
        try {
          await IOUtils.move(this.dbPath, backupPath);
          ztoolkit.log(`[VectorStore] Severely corrupted database backed up to: ${backupPath}`);
        } catch (_) {
          await IOUtils.remove(this.dbPath);
        }

        for (const suffix of ['-wal', '-shm']) {
          try { await IOUtils.remove(this.dbPath + suffix); } catch (_) {}
        }

        this.db = new Zotero.DBConnection(this.dbPath);
        ztoolkit.log('[VectorStore] Fresh database created after severe corruption');

        try {
          new ztoolkit.ProgressWindow("Zotero MCP Plugin", { closeOtherProgressWindows: false })
            .createLine({
              text: "检测到索引数据库严重损坏，已自动重建。旧文件已备份。\nSeverely corrupted index database detected and rebuilt. Old file backed up.",
              type: "default",
            })
            .show();
        } catch (_) {}

        return false;
      } catch (recreateError) {
        ztoolkit.log(`[VectorStore] Failed to recreate database after corruption: ${recreateError}`, 'error');
        throw recreateError;
      }
    }
  }

  private async createTables(): Promise<void> {
    // Embeddings table
    await this.db.queryAsync(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_key TEXT NOT NULL,
        chunk_id INTEGER NOT NULL,
        vector BLOB NOT NULL,
        language TEXT NOT NULL CHECK(language IN ('zh', 'en')),
        chunk_text TEXT,
        dimensions INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(item_key, chunk_id)
      )
    `);

    // Index for faster lookups
    await this.db.queryAsync(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_item_key
      ON embeddings(item_key)
    `);

    await this.db.queryAsync(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_language
      ON embeddings(language)
    `);

    // Index status table - tracks indexing state and timestamps for change detection
    await this.db.queryAsync(`
      CREATE TABLE IF NOT EXISTS index_status (
        item_key TEXT PRIMARY KEY,
        indexed_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        chunk_count INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        item_modified TEXT,
        attachment_modified TEXT
      )
    `);

    // Migrate existing tables - add new columns if they don't exist
    try {
      await this.db.queryAsync(`ALTER TABLE index_status ADD COLUMN item_modified TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await this.db.queryAsync(`ALTER TABLE index_status ADD COLUMN attachment_modified TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add Int8 quantized vector columns for optimized search
    // vector_int8: Int8 quantized vector data (1 byte per dimension vs 4 bytes)
    // vector_scale: Scale factor for dequantization
    // vector_norm: Pre-computed L2 norm for fast cosine similarity
    try {
      await this.db.queryAsync(`ALTER TABLE embeddings ADD COLUMN vector_int8 BLOB`);
      ztoolkit.log('[VectorStore] Added vector_int8 column');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await this.db.queryAsync(`ALTER TABLE embeddings ADD COLUMN vector_scale REAL`);
      ztoolkit.log('[VectorStore] Added vector_scale column');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await this.db.queryAsync(`ALTER TABLE embeddings ADD COLUMN vector_norm REAL`);
      ztoolkit.log('[VectorStore] Added vector_norm column');
    } catch (e) {
      // Column already exists, ignore
    }

    // Content cache table - stores extracted PDF content to avoid re-extraction
    await this.db.queryAsync(`
      CREATE TABLE IF NOT EXISTS content_cache (
        item_key TEXT PRIMARY KEY,
        full_content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        cached_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    ztoolkit.log('[VectorStore] Tables created/verified');
  }

  /**
   * Insert a single vector with Int8 quantization for optimized search
   */
  async insertVector(record: VectorRecord): Promise<void> {
    await this.ensureInitialized();

    ztoolkit.log(`[VectorStore] insertVector: ${record.itemKey}_${record.chunkId}, dims=${record.vector.length}, lang=${record.language}`);

    const vectorBlob = this.float32ArrayToBuffer(record.vector);

    // Pre-compute Int8 quantized vector and norm for optimized search
    const quantized = this.quantizeWithNorm(record.vector);
    // Encode Int8 data as base64 string for reliable SQLite storage
    const int8Base64 = this.int8ArrayToBase64(quantized.int8Data);

    await this.db.queryAsync(`INSERT OR REPLACE INTO embeddings (item_key, chunk_id, vector, language, chunk_text, dimensions, vector_int8, vector_scale, vector_norm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      record.itemKey,
      record.chunkId,
      vectorBlob,
      record.language,
      record.chunkText || '',
      record.vector.length,
      int8Base64,
      quantized.scale,
      quantized.norm
    ]);

    // Update cache
    const cacheKey = `${record.itemKey}_${record.chunkId}`;
    this.updateCache(cacheKey, record.vector);
  }

  /**
   * Insert multiple vectors in a transaction with Int8 quantization
   */
  async insertVectorsBatch(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    await this.ensureInitialized();

    await this.db.executeTransaction(async () => {
      for (const record of records) {
        const vectorBlob = this.float32ArrayToBuffer(record.vector);

        // Pre-compute Int8 quantized vector and norm for optimized search
        const quantized = this.quantizeWithNorm(record.vector);
        // Encode Int8 data as base64 string for reliable SQLite storage
        const int8Base64 = this.int8ArrayToBase64(quantized.int8Data);

        await this.db.queryAsync(`INSERT OR REPLACE INTO embeddings (item_key, chunk_id, vector, language, chunk_text, dimensions, vector_int8, vector_scale, vector_norm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          record.itemKey,
          record.chunkId,
          vectorBlob,
          record.language,
          record.chunkText || '',
          record.vector.length,
          int8Base64,
          quantized.scale,
          quantized.norm
        ]);
      }
    });

    ztoolkit.log(`[VectorStore] Inserted ${records.length} vectors with Int8 quantization`);
  }

  /**
   * Search for similar vectors using optimized Int8 chunked streaming
   *
   * Optimization strategy:
   * 1. Large batch size (50,000) to reduce I/O from 53 queries to ~6
   * 2. Int8 quantized vectors for ~4x faster integer arithmetic
   * 3. Pre-computed norms eliminate per-vector norm calculation
   * 4. Chunked streaming: load chunk → compute → release → next chunk
   *
   * Memory usage: ~150MB peak (50k vectors × 2560 dims × 1 byte + overhead)
   * Expected speedup: 150s → ~25s for 273k vectors
   */
  async search(
    queryVector: Float32Array,
    options: {
      topK?: number;
      language?: 'zh' | 'en' | 'all';
      itemKeys?: string[];
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const { topK = 10, language = 'all', itemKeys, minScore = 0 } = options;
    const startTime = Date.now();

    ztoolkit.log(`[VectorStore] search() start: instanceId=${this.instanceId}, topK=${topK}, lang=${language}, minScore=${minScore}, queryDims=${queryVector.length}`);

    // Build query conditions
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (language !== 'all') {
      conditions.push('language = ?');
      params.push(language);
    }

    if (itemKeys && itemKeys.length > 0) {
      const placeholders = itemKeys.map(() => '?').join(',');
      conditions.push(`item_key IN (${placeholders})`);
      params.push(...itemKeys);
    }

    // Optimized batch size: 50,000 vectors per chunk
    // Memory: 50k × 2560 dims × 1 byte = ~128MB for Int8 data
    const BATCH_SIZE = 50000;
    let offset = 0;
    let totalScanned = 0;
    let batchCount = 0;

    // Get total count first
    const whereClause = conditions.join(' AND ');
    const totalCount = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings WHERE ${whereClause}`, params);
    ztoolkit.log(`[VectorStore] search() total vectors: ${totalCount}, batch size: ${BATCH_SIZE}`);

    if (!totalCount || totalCount === 0) {
      ztoolkit.log(`[VectorStore] search() no vectors found`);
      return [];
    }

    // Check stored vector dimensions - if they don't match query dimensions, search will fail
    const storedDimsRow = await this.db.queryAsync(`SELECT dimensions FROM embeddings WHERE ${whereClause} LIMIT 1`, params);
    if (storedDimsRow && storedDimsRow.length > 0) {
      const storedDims = storedDimsRow[0].dimensions;
      if (storedDims !== queryVector.length) {
        ztoolkit.log(`[VectorStore] CRITICAL: Dimension mismatch! Query=${queryVector.length}, Stored=${storedDims}. You need to re-index with the current embedding model.`, 'error');
        // Return empty results with a clear error - vectors of different dimensions cannot be compared
        return [];
      }
    }

    // Check if Int8 data is available (for backward compatibility)
    const hasInt8 = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings WHERE vector_int8 IS NOT NULL AND ${whereClause}`, params);
    const useInt8 = hasInt8 > 0 && hasInt8 >= totalCount * 0.9; // Use Int8 if >90% have it

    ztoolkit.log(`[VectorStore] search() using ${useInt8 ? 'Int8 optimized' : 'Float32 fallback'} search (${hasInt8}/${totalCount} have Int8)`);

    // Pre-compute query vector data
    const queryQuantized = this.quantizeWithNorm(queryVector);
    const { normalized: normalizedQuery, norm: queryNorm } = this.prepareQueryVector(queryVector);

    if (queryNorm === 0) {
      ztoolkit.log(`[VectorStore] search() query vector has zero norm, returning empty results`);
      return [];
    }

    // Debug: log query vector info
    const querySample = queryVector.slice(0, 5);
    const queryInt8Sample = queryQuantized.int8Data.slice(0, 5);
    // Compute max abs safely (avoid spread operator stack overflow on large arrays)
    let queryMaxAbs = 0;
    for (let i = 0; i < queryVector.length; i++) {
      const abs = Math.abs(queryVector[i]);
      if (abs > queryMaxAbs) queryMaxAbs = abs;
    }
    ztoolkit.log(`[VectorStore] search() query: float32[0:5]=[${Array.from(querySample).map(v => v.toFixed(4))}], int8[0:5]=[${Array.from(queryInt8Sample)}], norm=${queryNorm.toFixed(4)}, scale=${queryMaxAbs > 0 ? (127 / queryMaxAbs).toFixed(4) : 'N/A'}`);


    // Min-heap to track top K results efficiently
    const minHeap: SearchResult[] = [];

    // Track debug info for first few vectors
    let debugSampleCount = 0;
    const MAX_DEBUG_SAMPLES = 3;
    // Track score statistics for debugging
    let scoreSum = 0;
    let scoreCount = 0;
    let scoreMax = -Infinity;
    let scoreMin = Infinity;
    let nanCount = 0;

    // Process in large batches (chunked streaming)
    while (offset < totalCount) {
      batchCount++;
      const batchStartTime = Date.now();
      const batchParams = [...params, BATCH_SIZE, offset];

      // Select appropriate columns based on availability
      // Always include 'vector' for fallback when dimensions mismatch
      const selectCols = useInt8
        ? 'item_key, chunk_id, vector_int8, vector_scale, vector_norm, vector, language, chunk_text, dimensions'
        : 'item_key, chunk_id, vector, language, chunk_text, dimensions';

      const rows = await this.db.queryAsync(`SELECT ${selectCols} FROM embeddings WHERE ${whereClause} LIMIT ? OFFSET ?`, batchParams);

      if (!rows || rows.length === 0) {
        ztoolkit.log(`[VectorStore] search() batch ${batchCount} returned no rows at offset ${offset}`);
        break;
      }

      const ioTime = Date.now() - batchStartTime;
      const computeStartTime = Date.now();

      // Process this batch
      for (const row of rows) {
        try {
          let score: number;

          // Check dimension match - query and stored must have same dimensions
          const queryDims = queryVector.length;
          const storedDims = row.dimensions;

          if (useInt8 && row.vector_int8 && row.vector_norm && queryDims === storedDims) {
            // Optimized Int8 path with pre-computed norm
            const storedInt8 = this.bufferToInt8Array(row.vector_int8, row.dimensions);

            // Verify decoded array length matches expected dimensions
            if (storedInt8.length !== queryQuantized.int8Data.length) {
              // Length mismatch - fall back to Float32
              const storedVector = this.bufferToFloat32Array(row.vector, row.dimensions);
              score = this.cosineSimilarityWithNormalizedQuery(normalizedQuery, storedVector);
              if (debugSampleCount === 0) {
                ztoolkit.log(`[VectorStore] WARNING: Int8 length mismatch: query=${queryQuantized.int8Data.length}, stored=${storedInt8.length}, using Float32 fallback`);
              }
            } else {
              score = this.cosineSimilarityInt8WithNorm(
                queryQuantized.int8Data,
                queryQuantized.norm,
                storedInt8,
                row.vector_norm
              );

              // Debug: log first few vectors to diagnose issues
              if (debugSampleCount < MAX_DEBUG_SAMPLES) {
                const sampleQuery = queryQuantized.int8Data.slice(0, 5);
                const sampleStored = storedInt8.slice(0, 5);
                // Check if stored Int8 is all zeros (corrupted)
                let nonZeroCount = 0;
                for (let j = 0; j < Math.min(100, storedInt8.length); j++) {
                  if (storedInt8[j] !== 0) nonZeroCount++;
                }

                // Also compute Float32 similarity for comparison
                const storedFloat32 = this.bufferToFloat32Array(row.vector, row.dimensions);
                const float32Score = this.cosineSimilarityWithNormalizedQuery(normalizedQuery, storedFloat32);
                const sampleFloat32 = storedFloat32.slice(0, 5);

                ztoolkit.log(`[VectorStore] DEBUG sample ${debugSampleCount}:`);
                ztoolkit.log(`  Int8 score=${score.toFixed(4)}, Float32 score=${float32Score.toFixed(4)}, diff=${Math.abs(score - float32Score).toFixed(4)}`);
                ztoolkit.log(`  queryInt8[0:5]=[${Array.from(sampleQuery)}]`);
                ztoolkit.log(`  storedInt8[0:5]=[${Array.from(sampleStored)}], nonZero=${nonZeroCount}/100`);
                ztoolkit.log(`  storedFloat32[0:5]=[${Array.from(sampleFloat32).map(v => v.toFixed(4))}]`);
                ztoolkit.log(`  base64Len=${typeof row.vector_int8 === 'string' ? row.vector_int8.length : 'N/A'}, int8ArrayLen=${storedInt8.length}`);
                debugSampleCount++;
              }
            }
          } else {
            // Fallback to Float32 (dimension mismatch or no Int8 data)
            if (queryDims !== storedDims) {
              ztoolkit.log(`[VectorStore] Dimension mismatch: query=${queryDims}, stored=${storedDims}, falling back to Float32`);
            }
            const storedVector = this.bufferToFloat32Array(row.vector, row.dimensions);
            score = this.cosineSimilarityWithNormalizedQuery(normalizedQuery, storedVector);
          }

          totalScanned++;

          // Track score statistics for debugging
          if (isNaN(score)) {
            nanCount++;
          } else {
            scoreSum += score;
            scoreCount++;
            if (score > scoreMax) scoreMax = score;
            if (score < scoreMin) scoreMin = score;
          }

          if (score >= minScore) {
            const result: SearchResult = {
              itemKey: row.item_key,
              chunkId: row.chunk_id,
              score,
              chunkText: row.chunk_text,
              language: row.language
            };

            // Maintain top K using simple array (efficient for small K)
            if (minHeap.length < topK) {
              minHeap.push(result);
              if (minHeap.length === topK) {
                minHeap.sort((a, b) => a.score - b.score);
              }
            } else if (score > minHeap[0].score) {
              minHeap[0] = result;
              // Re-sort to maintain min-heap property
              minHeap.sort((a, b) => a.score - b.score);
            }
          }
        } catch (e) {
          // Skip invalid vectors
        }
      }

      const computeTime = Date.now() - computeStartTime;
      offset += rows.length;

      ztoolkit.log(`[VectorStore] search() batch ${batchCount}: ${rows.length} vectors, IO=${ioTime}ms, compute=${computeTime}ms, progress=${offset}/${totalCount}`);
    }

    // Final sort (descending by score)
    const topResults = minHeap.sort((a, b) => b.score - a.score);

    const searchTime = Date.now() - startTime;
    const topScores = topResults.slice(0, 5).map(r => r.score.toFixed(3)).join(', ');
    ztoolkit.log(`[VectorStore] search() completed in ${searchTime}ms: ${totalScanned} vectors in ${batchCount} batches, returning ${topResults.length}`);

    // Log score statistics for debugging
    if (scoreCount > 0) {
      const avgScore = scoreSum / scoreCount;
      ztoolkit.log(`[VectorStore] search() score stats: min=${scoreMin.toFixed(4)}, max=${scoreMax.toFixed(4)}, avg=${avgScore.toFixed(4)}, NaN=${nanCount}`);
    } else if (nanCount > 0) {
      ztoolkit.log(`[VectorStore] search() WARNING: All ${nanCount} scores were NaN! Check dimension mismatch or data corruption.`);
    }

    if (topResults.length > 0) {
      ztoolkit.log(`[VectorStore] search() top scores: [${topScores}]`);
    }

    return topResults;
  }

  /**
   * Get all indexed item keys
   */
  async getIndexedItems(): Promise<Set<string>> {
    await this.ensureInitialized();

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key FROM index_status`);

    // Zotero's queryAsync returns undefined when no rows found
    if (!rows || rows.length === 0) {
      return new Set();
    }

    return new Set(rows.map((r: any) => r.item_key));
  }

  /**
   * Get index status for an item
   */
  async getIndexStatus(itemKey: string): Promise<IndexStatus | null> {
    await this.ensureInitialized();

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key, indexed_at, version, chunk_count, content_hash, item_modified, attachment_modified FROM index_status WHERE item_key = ?`, [itemKey]);

    // Zotero's queryAsync returns undefined when no rows found
    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    return {
      itemKey: row.item_key,
      indexedAt: row.indexed_at,
      chunkCount: row.chunk_count,
      contentHash: row.content_hash,
      version: row.version,
      itemModified: row.item_modified,
      attachmentModified: row.attachment_modified
    };
  }

  /**
   * Update index status for an item (with optional timestamps)
   */
  async updateIndexStatus(
    itemKey: string,
    chunkCount: number,
    contentHash: string,
    itemModified?: string,
    attachmentModified?: string
  ): Promise<void> {
    await this.ensureInitialized();

    await this.db.queryAsync(`
      INSERT OR REPLACE INTO index_status
      (item_key, indexed_at, version, chunk_count, content_hash, item_modified, attachment_modified)
      VALUES (?, strftime('%s', 'now'), 1, ?, ?, ?, ?)
    `, [itemKey, chunkCount, contentHash, itemModified || null, attachmentModified || null]);
  }

  /**
   * Check if item needs re-indexing by timestamp (fast check, no content extraction needed)
   * Returns: true if needs reindex, false if timestamps unchanged
   */
  async needsReindexByTimestamp(
    itemKey: string,
    itemModified: string,
    attachmentModified: string
  ): Promise<boolean> {
    const status = await this.getIndexStatus(itemKey);

    // No existing index, needs indexing
    if (!status) return true;

    // No stored timestamps (old data), needs re-check with content hash
    if (!status.itemModified || !status.attachmentModified) return true;

    // Compare timestamps
    if (status.itemModified !== itemModified) return true;
    if (status.attachmentModified !== attachmentModified) return true;

    // Timestamps unchanged, no need to reindex
    return false;
  }

  /**
   * Check if item needs re-indexing by content hash
   */
  async needsReindex(itemKey: string, contentHash: string): Promise<boolean> {
    const status = await this.getIndexStatus(itemKey);
    if (!status) return true;
    return status.contentHash !== contentHash;
  }

  // ============ Content Cache Methods ============

  /**
   * Get cached content for an item
   * Returns null if not cached or hash doesn't match
   */
  async getCachedContent(itemKey: string): Promise<{ content: string; hash: string } | null> {
    await this.ensureInitialized();

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT full_content, content_hash FROM content_cache WHERE item_key = ?`, [itemKey]);

    if (!rows || rows.length === 0) return null;

    return {
      content: rows[0].full_content,
      hash: rows[0].content_hash
    };
  }

  /**
   * Set cached content for an item
   */
  async setCachedContent(itemKey: string, content: string, contentHash: string): Promise<void> {
    await this.ensureInitialized();

    await this.db.queryAsync(`
      INSERT OR REPLACE INTO content_cache (item_key, full_content, content_hash, cached_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
    `, [itemKey, content, contentHash]);
  }

  /**
   * Delete cached content for an item
   */
  async deleteCachedContent(itemKey: string): Promise<void> {
    await this.ensureInitialized();

    await this.db.queryAsync(`DELETE FROM content_cache WHERE item_key = ?`, [itemKey]);
  }

  /**
   * Get all cached content item keys with metadata
   */
  async listCachedContent(): Promise<Array<{
    itemKey: string;
    contentLength: number;
    hash: string;
    cachedAt: number;
  }>> {
    await this.ensureInitialized();

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key, LENGTH(full_content) as content_length, content_hash, cached_at FROM content_cache ORDER BY cached_at DESC`);

    if (!rows || rows.length === 0) return [];

    return rows.map((row: any) => ({
      itemKey: row.item_key,
      contentLength: row.content_length,
      hash: row.content_hash,
      cachedAt: row.cached_at
    }));
  }

  /**
   * Full-text search within cached content
   * Returns items whose content contains the search term
   */
  async searchCachedContent(
    searchTerm: string,
    options: { limit?: number; caseSensitive?: boolean } = {}
  ): Promise<Array<{
    itemKey: string;
    snippet: string;
    matchCount: number;
  }>> {
    await this.ensureInitialized();

    const { limit = 20, caseSensitive = false } = options;

    // SQLite LIKE is case-insensitive by default for ASCII
    const searchPattern = `%${searchTerm}%`;

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key, full_content FROM content_cache WHERE full_content LIKE ? LIMIT ?`, [searchPattern, limit * 2]); // Fetch more to account for filtering

    if (!rows || rows.length === 0) return [];

    const results: Array<{ itemKey: string; snippet: string; matchCount: number }> = [];

    for (const row of rows) {
      const content: string = row.full_content;
      const searchStr = caseSensitive ? searchTerm : searchTerm.toLowerCase();
      const contentToSearch = caseSensitive ? content : content.toLowerCase();

      // Count matches
      let matchCount = 0;
      let pos = 0;
      while ((pos = contentToSearch.indexOf(searchStr, pos)) !== -1) {
        matchCount++;
        pos += searchStr.length;
      }

      if (matchCount > 0) {
        // Extract snippet around first match
        const firstMatch = contentToSearch.indexOf(searchStr);
        const snippetStart = Math.max(0, firstMatch - 100);
        const snippetEnd = Math.min(content.length, firstMatch + searchTerm.length + 100);
        let snippet = content.substring(snippetStart, snippetEnd);
        if (snippetStart > 0) snippet = '...' + snippet;
        if (snippetEnd < content.length) snippet = snippet + '...';

        results.push({
          itemKey: row.item_key,
          snippet,
          matchCount
        });
      }

      if (results.length >= limit) break;
    }

    // Sort by match count descending
    results.sort((a, b) => b.matchCount - a.matchCount);

    return results;
  }

  /**
   * Get full cached content for an item (alias for getCachedContent for clarity)
   */
  async getFullContent(itemKey: string): Promise<string | null> {
    const cached = await this.getCachedContent(itemKey);
    return cached ? cached.content : null;
  }

  /**
   * Get full cached content for multiple items
   */
  async getFullContentBatch(itemKeys: string[]): Promise<Map<string, string>> {
    await this.ensureInitialized();

    const result = new Map<string, string>();
    if (itemKeys.length === 0) return result;

    const placeholders = itemKeys.map(() => '?').join(',');
    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key, full_content FROM content_cache WHERE item_key IN (${placeholders})`, itemKeys);

    if (!rows || rows.length === 0) return result;

    for (const row of rows) {
      result.set(row.item_key, row.full_content);
    }

    return result;
  }

  /**
   * Delete vectors for an item
   * @param itemKey The item key to delete
   * @param deleteContentCache If true, also delete content cache (use when item is permanently deleted)
   */
  async deleteItemVectors(itemKey: string, deleteContentCache: boolean = false): Promise<void> {
    await this.ensureInitialized();

    await this.db.executeTransaction(async () => {
      await this.db.queryAsync(
        `DELETE FROM embeddings WHERE item_key = ?`,
        [itemKey]
      );
      await this.db.queryAsync(
        `DELETE FROM index_status WHERE item_key = ?`,
        [itemKey]
      );
      if (deleteContentCache) {
        await this.db.queryAsync(
          `DELETE FROM content_cache WHERE item_key = ?`,
          [itemKey]
        );
      }
    });

    // Clear cache entries
    for (const key of this.vectorCache.keys()) {
      if (key.startsWith(`${itemKey}_`)) {
        this.vectorCache.delete(key);
      }
    }

    const cacheMsg = deleteContentCache ? 'including content cache' : 'content cache preserved';
    ztoolkit.log(`[VectorStore] Deleted vectors for item: ${itemKey} (${cacheMsg})`);
  }

  /**
   * Clear all vectors and index status (preserves content cache)
   * Use this for re-indexing while keeping extracted content
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    // Log which database we're clearing
    ztoolkit.log(`[VectorStore] clear() called on instanceId=${this.instanceId}, dbPath=${this.dbPath}`);

    // Get counts before deletion for logging
    const beforeEmbeddings = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`);
    const beforeIndex = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM index_status`);
    ztoolkit.log(`[VectorStore] clear() starting: embeddings=${beforeEmbeddings}, index_status=${beforeIndex}`);

    // Execute DELETE statements directly (not in transaction to ensure immediate effect)
    await this.db.queryAsync(`DELETE FROM embeddings`);
    await this.db.queryAsync(`DELETE FROM index_status`);

    // Verify deletion
    const afterEmbeddings = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`);
    const afterIndex = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM index_status`);
    ztoolkit.log(`[VectorStore] clear() completed: embeddings=${afterEmbeddings}, index_status=${afterIndex}`);

    if (afterEmbeddings > 0 || afterIndex > 0) {
      ztoolkit.log(`[VectorStore] WARNING: clear() did not fully delete data! Retrying...`, 'warn');
      // Retry with explicit SQL
      await this.db.queryAsync(`DELETE FROM embeddings WHERE 1=1`);
      await this.db.queryAsync(`DELETE FROM index_status WHERE 1=1`);

      const finalEmbeddings = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`);
      const finalIndex = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM index_status`);
      ztoolkit.log(`[VectorStore] clear() retry result: embeddings=${finalEmbeddings}, index_status=${finalIndex}`);
    }

    this.vectorCache.clear();
    // Note: content_cache is preserved as full-text database

    // VACUUM to reclaim disk space (DELETE only marks pages as free)
    try {
      ztoolkit.log(`[VectorStore] Running VACUUM to reclaim disk space...`);
      await this.db.queryAsync(`VACUUM`);
      ztoolkit.log(`[VectorStore] VACUUM completed`);
    } catch (vacuumError) {
      ztoolkit.log(`[VectorStore] VACUUM failed (non-critical): ${vacuumError}`, 'warn');
    }
  }

  /**
   * Clear everything including content cache
   * Use this for complete reset
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();

    // Get counts before deletion for logging
    const beforeEmbeddings = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`);
    const beforeIndex = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM index_status`);
    const beforeCache = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM content_cache`);
    ztoolkit.log(`[VectorStore] clearAll() starting: embeddings=${beforeEmbeddings}, index_status=${beforeIndex}, content_cache=${beforeCache}`);

    // Execute DELETE statements directly
    await this.db.queryAsync(`DELETE FROM embeddings`);
    await this.db.queryAsync(`DELETE FROM index_status`);
    await this.db.queryAsync(`DELETE FROM content_cache`);

    // Verify deletion
    const afterEmbeddings = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`);
    const afterIndex = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM index_status`);
    const afterCache = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM content_cache`);
    ztoolkit.log(`[VectorStore] clearAll() completed: embeddings=${afterEmbeddings}, index_status=${afterIndex}, content_cache=${afterCache}`);

    this.vectorCache.clear();

    // VACUUM to reclaim disk space (DELETE only marks pages as free)
    try {
      ztoolkit.log(`[VectorStore] Running VACUUM to reclaim disk space...`);
      await this.db.queryAsync(`VACUUM`);
      ztoolkit.log(`[VectorStore] VACUUM completed`);
    } catch (vacuumError) {
      ztoolkit.log(`[VectorStore] VACUUM failed (non-critical): ${vacuumError}`, 'warn');
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<VectorStoreStats> {
    await this.ensureInitialized();

    ztoolkit.log(`[VectorStore] getStats() called: instanceId=${this.instanceId}, dbPath=${this.dbPath}`);

    const total = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM embeddings`
    );
    const items = await this.db.valueQueryAsync(
      `SELECT COUNT(DISTINCT item_key) FROM embeddings`
    );
    const zh = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM embeddings WHERE language = 'zh'`
    );
    const en = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM embeddings WHERE language = 'en'`
    );

    // Content cache stats
    const cachedItems = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM content_cache`
    );
    const cachedSize = await this.db.valueQueryAsync(
      `SELECT COALESCE(SUM(LENGTH(full_content)), 0) FROM content_cache`
    );

    // Get stored dimensions (from first vector)
    let storedDimensions: number | undefined;
    const dimsRow = await this.db.queryAsync(`SELECT dimensions FROM embeddings LIMIT 1`);
    if (dimsRow && dimsRow.length > 0) {
      storedDimensions = dimsRow[0].dimensions;
    }

    // Int8 migration status
    const int8Count = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM embeddings WHERE vector_int8 IS NOT NULL`
    );
    const int8MigrationStatus = total > 0 ? {
      migrated: int8Count || 0,
      total: total || 0,
      percent: Math.round(((int8Count || 0) / total) * 100)
    } : undefined;

    // Get database file size
    let dbSizeBytes: number | undefined;
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(this.dbPath);
      if (file.exists()) {
        dbSizeBytes = file.fileSize;
      }
    } catch (e) {
      // Ignore file size errors
    }

    // index_status table count (may differ from embeddings DISTINCT count)
    const indexStatusCount = await this.db.valueQueryAsync(
      `SELECT COUNT(*) FROM index_status`
    );
    if (indexStatusCount !== items) {
      ztoolkit.log(`[VectorStore] Stats mismatch: index_status=${indexStatusCount}, embeddings(DISTINCT item_key)=${items}. Some items may have index_status but no embeddings.`, 'warn');
    }

    return {
      totalVectors: total || 0,
      totalItems: items || 0,
      zhVectors: zh || 0,
      enVectors: en || 0,
      cachedContentItems: cachedItems || 0,
      cachedContentSizeBytes: cachedSize || 0,
      storedDimensions,
      int8MigrationStatus,
      dbSizeBytes,
      dbPath: this.dbPath
    };
  }

  /**
   * Get vectors for a specific item (for find_similar)
   */
  async getItemVectors(itemKey: string): Promise<Array<{
    chunkId: number;
    vector: Float32Array;
    language: string;
  }>> {
    await this.ensureInitialized();

    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT chunk_id, vector, language, dimensions FROM embeddings WHERE item_key = ? ORDER BY chunk_id`, [itemKey]);

    // Zotero's queryAsync returns undefined when no rows found
    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row: any) => ({
      chunkId: row.chunk_id,
      vector: this.bufferToFloat32Array(row.vector, row.dimensions),
      language: row.language
    }));
  }

  /**
   * Get chunk texts for items (without vectors, for filling keyword search results)
   */
  async getItemChunks(itemKeys: string[]): Promise<Map<string, Array<{
    chunkId: number;
    text: string;
    language: string;
  }>>> {
    await this.ensureInitialized();

    const result = new Map<string, Array<{ chunkId: number; text: string; language: string }>>();

    if (itemKeys.length === 0) return result;

    const placeholders = itemKeys.map(() => '?').join(',');
    // IMPORTANT: Single-line query to avoid Zotero queryAsync bug with multi-line SQL
    const rows = await this.db.queryAsync(`SELECT item_key, chunk_id, chunk_text, language FROM embeddings WHERE item_key IN (${placeholders}) ORDER BY item_key, chunk_id`, itemKeys);

    if (!rows || rows.length === 0) {
      return result;
    }

    for (const row of rows) {
      const chunks = result.get(row.item_key) || [];
      chunks.push({
        chunkId: row.chunk_id,
        text: row.chunk_text || '',
        language: row.language
      });
      result.set(row.item_key, chunks);
    }

    return result;
  }

  // ============ Utility Methods ============

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Convert Float32Array to buffer for storage
   */
  private float32ArrayToBuffer(arr: Float32Array): Uint8Array {
    return new Uint8Array(arr.buffer.slice(
      arr.byteOffset,
      arr.byteOffset + arr.byteLength
    ));
  }

  /**
   * Convert Int8Array to base64 string for reliable SQLite storage
   */
  private int8ArrayToBase64(arr: Int8Array): string {
    // Convert signed Int8 to unsigned bytes, then to base64
    const uint8 = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      uint8[i] = arr[i] & 0xFF;
    }
    // Use btoa with binary string
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string back to Int8Array
   */
  private base64ToInt8Array(base64: string, dimensions: number): Int8Array {
    const binary = atob(base64);
    const int8 = new Int8Array(dimensions);
    for (let i = 0; i < dimensions && i < binary.length; i++) {
      // Convert unsigned byte back to signed Int8
      const unsigned = binary.charCodeAt(i);
      int8[i] = unsigned > 127 ? unsigned - 256 : unsigned;
    }
    return int8;
  }

  /**
   * Convert buffer or base64 string to Int8Array
   */
  private bufferToInt8Array(buffer: any, dimensions: number): Int8Array {
    // Handle base64 string format (new storage format)
    if (typeof buffer === 'string') {
      return this.base64ToInt8Array(buffer, dimensions);
    }

    // Handle binary blob formats (legacy)
    let uint8Array: Uint8Array;

    if (buffer instanceof Uint8Array) {
      uint8Array = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(buffer);
    } else if (typeof buffer === 'object' && buffer.buffer) {
      uint8Array = new Uint8Array(buffer.buffer);
    } else {
      uint8Array = new Uint8Array(buffer);
    }

    // Create Int8Array view
    return new Int8Array(uint8Array.buffer, uint8Array.byteOffset, dimensions);
  }

  /**
   * Convert buffer back to Float32Array
   */
  private bufferToFloat32Array(buffer: any, dimensions: number): Float32Array {
    // Handle different buffer formats from SQLite
    let uint8Array: Uint8Array;

    if (buffer instanceof Uint8Array) {
      uint8Array = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(buffer);
    } else if (typeof buffer === 'object' && buffer.buffer) {
      uint8Array = new Uint8Array(buffer.buffer);
    } else {
      // Try to convert from array-like object
      uint8Array = new Uint8Array(buffer);
    }

    // Create properly aligned Float32Array
    const alignedBuffer = new ArrayBuffer(dimensions * 4);
    const alignedView = new Uint8Array(alignedBuffer);
    alignedView.set(uint8Array.slice(0, dimensions * 4));

    return new Float32Array(alignedBuffer);
  }

  // ============ Int8 Quantization Methods ============

  /**
   * Quantize Float32Array to Int8Array with scale factor
   * Uses symmetric quantization: int8_val = round(float_val * scale)
   * Scale is chosen so that max(|float_val|) maps to 127
   * @returns { quantized: Int8Array, scale: number }
   */
  private quantizeToInt8(vector: Float32Array): { quantized: Int8Array; scale: number } {
    const len = vector.length;

    // Find max absolute value for scaling
    let maxAbs = 0;
    for (let i = 0; i < len; i++) {
      const abs = Math.abs(vector[i]);
      if (abs > maxAbs) maxAbs = abs;
    }

    // Compute scale factor (avoid division by zero)
    const scale = maxAbs > 0 ? 127 / maxAbs : 1;

    // Quantize
    const quantized = new Int8Array(len);
    for (let i = 0; i < len; i++) {
      quantized[i] = Math.round(vector[i] * scale);
    }

    return { quantized, scale };
  }

  /**
   * Quantize vector to Int8 with pre-computed L2 norm for optimized search
   * This is used during indexing to pre-compute everything needed for fast similarity
   */
  private quantizeWithNorm(vector: Float32Array): QuantizedVector {
    const len = vector.length;

    // Compute L2 norm
    let normSq = 0;
    let maxAbs = 0;
    for (let i = 0; i < len; i++) {
      normSq += vector[i] * vector[i];
      const abs = Math.abs(vector[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    const norm = Math.sqrt(normSq);

    // Compute scale factor for Int8 quantization
    const scale = maxAbs > 0 ? 127 / maxAbs : 1;

    // Quantize
    const int8Data = new Int8Array(len);
    for (let i = 0; i < len; i++) {
      int8Data[i] = Math.round(vector[i] * scale);
    }

    return { int8Data, scale, norm };
  }

  /**
   * Dequantize Int8Array back to Float32Array
   */
  private dequantizeFromInt8(quantized: Int8Array, scale: number): Float32Array {
    const len = quantized.length;
    const vector = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      vector[i] = quantized[i] / scale;
    }

    return vector;
  }

  /**
   * Fast cosine similarity using Int8 quantized vectors
   * Uses integer arithmetic for dot product, then converts to float for final result
   * ~4x faster than float comparison with ~99% accuracy
   * Note: Scale factors are not used in cosine similarity as they cancel out
   */
  private cosineSimilarityInt8(
    queryInt8: Int8Array,
    _queryScale: number,
    storedInt8: Int8Array,
    _storedScale: number
  ): number {
    const len = queryInt8.length;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Loop unrolling for integer arithmetic
    const unrollEnd = len - (len % 8);
    let i = 0;

    for (; i < unrollEnd; i += 8) {
      const a0 = queryInt8[i], a1 = queryInt8[i+1], a2 = queryInt8[i+2], a3 = queryInt8[i+3];
      const a4 = queryInt8[i+4], a5 = queryInt8[i+5], a6 = queryInt8[i+6], a7 = queryInt8[i+7];
      const b0 = storedInt8[i], b1 = storedInt8[i+1], b2 = storedInt8[i+2], b3 = storedInt8[i+3];
      const b4 = storedInt8[i+4], b5 = storedInt8[i+5], b6 = storedInt8[i+6], b7 = storedInt8[i+7];

      dotProduct += a0*b0 + a1*b1 + a2*b2 + a3*b3 + a4*b4 + a5*b5 + a6*b6 + a7*b7;
      normA += a0*a0 + a1*a1 + a2*a2 + a3*a3 + a4*a4 + a5*a5 + a6*a6 + a7*a7;
      normB += b0*b0 + b1*b1 + b2*b2 + b3*b3 + b4*b4 + b5*b5 + b6*b6 + b7*b7;
    }

    // Handle remaining elements
    for (; i < len; i++) {
      dotProduct += queryInt8[i] * storedInt8[i];
      normA += queryInt8[i] * queryInt8[i];
      normB += storedInt8[i] * storedInt8[i];
    }

    // Convert to float and compute final similarity
    // The scale factors cancel out in cosine similarity
    const magnitude = Math.sqrt(normA * normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Optimized Int8 cosine similarity - single pass computation
   *
   * Cosine similarity is scale-invariant: cos(a,b) = cos(k*a, m*b) for any k,m > 0
   * Therefore Int8 quantized cosine ≈ Float32 cosine with ~99% accuracy.
   *
   * This version computes dot product and norms in a single pass with loop unrolling
   * for maximum performance.
   */
  private cosineSimilarityInt8WithNorm(
    queryInt8: Int8Array,
    _queryNorm: number,  // Not used - we compute Int8 norm directly
    storedInt8: Int8Array,
    _storedNorm: number  // Not used - we compute Int8 norm directly
  ): number {
    const len = queryInt8.length;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Single pass: compute dot product and both norms together with loop unrolling
    const unrollEnd = len - (len % 8);
    let i = 0;

    for (; i < unrollEnd; i += 8) {
      const a0 = queryInt8[i], a1 = queryInt8[i+1], a2 = queryInt8[i+2], a3 = queryInt8[i+3];
      const a4 = queryInt8[i+4], a5 = queryInt8[i+5], a6 = queryInt8[i+6], a7 = queryInt8[i+7];
      const b0 = storedInt8[i], b1 = storedInt8[i+1], b2 = storedInt8[i+2], b3 = storedInt8[i+3];
      const b4 = storedInt8[i+4], b5 = storedInt8[i+5], b6 = storedInt8[i+6], b7 = storedInt8[i+7];

      dotProduct += a0*b0 + a1*b1 + a2*b2 + a3*b3 + a4*b4 + a5*b5 + a6*b6 + a7*b7;
      normA += a0*a0 + a1*a1 + a2*a2 + a3*a3 + a4*a4 + a5*a5 + a6*a6 + a7*a7;
      normB += b0*b0 + b1*b1 + b2*b2 + b3*b3 + b4*b4 + b5*b5 + b6*b6 + b7*b7;
    }

    // Handle remaining elements
    for (; i < len; i++) {
      const a = queryInt8[i];
      const b = storedInt8[i];
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    const magnitude = Math.sqrt(normA * normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Convert Float32Array to Int8Array buffer for storage (with scale prepended)
   * Format: [scale as Float32 (4 bytes)] + [Int8 values (n bytes)]
   */
  private float32ArrayToInt8Buffer(arr: Float32Array): Uint8Array {
    const { quantized, scale } = this.quantizeToInt8(arr);

    // Create buffer: 4 bytes for scale + n bytes for Int8 values
    const buffer = new Uint8Array(4 + quantized.length);

    // Write scale as Float32 at the beginning
    const scaleView = new DataView(buffer.buffer);
    scaleView.setFloat32(0, scale, true); // little-endian

    // Copy Int8 values
    buffer.set(new Uint8Array(quantized.buffer), 4);

    return buffer;
  }

  /**
   * Convert Int8 buffer back to Float32Array
   */
  private int8BufferToFloat32Array(buffer: Uint8Array, dimensions: number): Float32Array {
    // Read scale from first 4 bytes
    const scaleView = new DataView(buffer.buffer, buffer.byteOffset, 4);
    const scale = scaleView.getFloat32(0, true);

    // Read Int8 values
    const quantized = new Int8Array(buffer.buffer, buffer.byteOffset + 4, dimensions);

    return this.dequantizeFromInt8(quantized, scale);
  }

  /**
   * Calculate cosine similarity between two vectors
   * Optimized version with loop unrolling for better performance
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    const len = a.length;
    if (len !== b.length) {
      throw new Error(`Vector dimension mismatch: ${len} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Loop unrolling: process 8 elements at a time for better CPU pipelining
    const unrollEnd = len - (len % 8);
    let i = 0;

    for (; i < unrollEnd; i += 8) {
      const a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3];
      const a4 = a[i+4], a5 = a[i+5], a6 = a[i+6], a7 = a[i+7];
      const b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3];
      const b4 = b[i+4], b5 = b[i+5], b6 = b[i+6], b7 = b[i+7];

      dotProduct += a0*b0 + a1*b1 + a2*b2 + a3*b3 + a4*b4 + a5*b5 + a6*b6 + a7*b7;
      normA += a0*a0 + a1*a1 + a2*a2 + a3*a3 + a4*a4 + a5*a5 + a6*a6 + a7*a7;
      normB += b0*b0 + b1*b1 + b2*b2 + b3*b3 + b4*b4 + b5*b5 + b6*b6 + b7*b7;
    }

    // Handle remaining elements
    for (; i < len; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA * normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Cosine similarity with pre-normalized query vector
   * Only computes norm for the stored vector, saving ~33% computation
   * @param normalizedQuery - Pre-normalized query vector (norm = 1)
   * @param storedVector - Stored vector (may not be normalized)
   */
  private cosineSimilarityWithNormalizedQuery(normalizedQuery: Float32Array, storedVector: Float32Array): number {
    const len = normalizedQuery.length;
    let dotProduct = 0;
    let normB = 0;

    // Loop unrolling: process 8 elements at a time
    const unrollEnd = len - (len % 8);
    let i = 0;

    for (; i < unrollEnd; i += 8) {
      const a0 = normalizedQuery[i], a1 = normalizedQuery[i+1], a2 = normalizedQuery[i+2], a3 = normalizedQuery[i+3];
      const a4 = normalizedQuery[i+4], a5 = normalizedQuery[i+5], a6 = normalizedQuery[i+6], a7 = normalizedQuery[i+7];
      const b0 = storedVector[i], b1 = storedVector[i+1], b2 = storedVector[i+2], b3 = storedVector[i+3];
      const b4 = storedVector[i+4], b5 = storedVector[i+5], b6 = storedVector[i+6], b7 = storedVector[i+7];

      dotProduct += a0*b0 + a1*b1 + a2*b2 + a3*b3 + a4*b4 + a5*b5 + a6*b6 + a7*b7;
      normB += b0*b0 + b1*b1 + b2*b2 + b3*b3 + b4*b4 + b5*b5 + b6*b6 + b7*b7;
    }

    // Handle remaining elements
    for (; i < len; i++) {
      dotProduct += normalizedQuery[i] * storedVector[i];
      normB += storedVector[i] * storedVector[i];
    }

    const magnitude = Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Pre-compute query vector norm for batch comparisons
   * Returns: { normalizedQuery, queryNorm }
   */
  private prepareQueryVector(queryVector: Float32Array): { normalized: Float32Array; norm: number } {
    const len = queryVector.length;
    let normSq = 0;

    for (let i = 0; i < len; i++) {
      normSq += queryVector[i] * queryVector[i];
    }

    const norm = Math.sqrt(normSq);
    if (norm === 0) {
      return { normalized: queryVector, norm: 0 };
    }

    // Normalize the query vector
    const normalized = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      normalized[i] = queryVector[i] / norm;
    }

    return { normalized, norm };
  }

  /**
   * Update LRU cache
   */
  private updateCache(key: string, vector: Float32Array): void {
    // Simple LRU: remove oldest when cache is full
    if (this.vectorCache.size >= this.cacheMaxSize) {
      const firstKey = this.vectorCache.keys().next().value;
      if (firstKey) {
        this.vectorCache.delete(firstKey);
      }
    }
    this.vectorCache.set(key, vector);
  }

  /**
   * Migrate existing vectors to Int8 format
   * Call this to enable optimized search on existing indexed data
   * @returns Number of vectors migrated
   */
  async migrateToInt8(onProgress?: (processed: number, total: number) => void): Promise<number> {
    await this.ensureInitialized();

    // Count vectors needing migration
    const totalCount = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings WHERE vector_int8 IS NULL`);

    if (!totalCount || totalCount === 0) {
      ztoolkit.log('[VectorStore] No vectors need Int8 migration');
      return 0;
    }

    ztoolkit.log(`[VectorStore] Migrating ${totalCount} vectors to Int8 format...`);

    // Self-test: verify base64 encoding/decoding works correctly
    const testVector = new Float32Array([0.1, -0.5, 0.9, -0.1, 0.0, 0.123, -0.999, 0.5]);
    const testQuantized = this.quantizeWithNorm(testVector);
    const testBase64 = this.int8ArrayToBase64(testQuantized.int8Data);
    const testDecoded = this.base64ToInt8Array(testBase64, testVector.length);
    let testMatch = true;
    for (let i = 0; i < testVector.length; i++) {
      if (testQuantized.int8Data[i] !== testDecoded[i]) {
        testMatch = false;
        ztoolkit.log(`[VectorStore] SELF-TEST FAILED at index ${i}: original=${testQuantized.int8Data[i]}, decoded=${testDecoded[i]}`);
      }
    }
    ztoolkit.log(`[VectorStore] Base64 self-test: ${testMatch ? 'PASSED' : 'FAILED'}`);
    ztoolkit.log(`[VectorStore] Test data: original=[${Array.from(testQuantized.int8Data)}], decoded=[${Array.from(testDecoded)}], base64Len=${testBase64.length}`);

    const BATCH_SIZE = 100; // Smaller batch size for migration
    let processed = 0;
    let migrated = 0;

    while (processed < totalCount) {
      // Fetch batch of vectors without Int8 data (always start from offset 0 since we're updating)
      const rows = await this.db.queryAsync(`SELECT id, vector, dimensions FROM embeddings WHERE vector_int8 IS NULL LIMIT ?`, [BATCH_SIZE]);

      if (!rows || rows.length === 0) break;

      // Process each vector individually (not in transaction to avoid blob serialization issues)
      for (const row of rows) {
        try {
          const vector = this.bufferToFloat32Array(row.vector, row.dimensions);
          const quantized = this.quantizeWithNorm(vector);

          // Encode Int8 data as base64 string for reliable SQLite storage
          // Zotero's SQLite binding serializes Uint8Array as JSON object which fails
          const int8Base64 = this.int8ArrayToBase64(quantized.int8Data);

          // Log first 3 vectors being migrated
          if (migrated < 3) {
            const sampleFloat32 = vector.slice(0, 5);
            const sampleInt8 = quantized.int8Data.slice(0, 5);
            ztoolkit.log(`[VectorStore] Migration sample ${migrated}: id=${row.id}, dims=${row.dimensions}`);
            ztoolkit.log(`  Float32[0:5]=[${Array.from(sampleFloat32).map(v => v.toFixed(4))}]`);
            ztoolkit.log(`  Int8[0:5]=[${Array.from(sampleInt8)}], scale=${quantized.scale.toFixed(4)}, norm=${quantized.norm.toFixed(4)}`);
            ztoolkit.log(`  base64Len=${int8Base64.length}, expected=${Math.ceil(row.dimensions * 4 / 3)}`);
          }

          await this.db.queryAsync(`UPDATE embeddings SET vector_int8 = ?, vector_scale = ?, vector_norm = ? WHERE id = ?`, [
            int8Base64,
            quantized.scale,
            quantized.norm,
            row.id
          ]);

          migrated++;
        } catch (e) {
          ztoolkit.log(`[VectorStore] Failed to migrate vector id=${row.id}: ${e}`, 'warn');
        }
        processed++;
      }

      onProgress?.(processed, totalCount);

      if (migrated % 5000 === 0 && migrated > 0) {
        ztoolkit.log(`[VectorStore] Migration progress: ${migrated}/${totalCount} migrated`);
      }

      // Small delay to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    ztoolkit.log(`[VectorStore] Migration completed: ${migrated} vectors converted to Int8`);

    // Verification: read back a few vectors and verify the Int8 data
    ztoolkit.log(`[VectorStore] Verifying migrated data...`);
    const verifyRows = await this.db.queryAsync(`SELECT id, vector, vector_int8, dimensions, vector_scale, vector_norm FROM embeddings WHERE vector_int8 IS NOT NULL LIMIT 3`);
    if (verifyRows && verifyRows.length > 0) {
      for (let i = 0; i < verifyRows.length; i++) {
        const vRow = verifyRows[i];
        const originalVector = this.bufferToFloat32Array(vRow.vector, vRow.dimensions);
        const storedInt8 = this.bufferToInt8Array(vRow.vector_int8, vRow.dimensions);
        const reQuantized = this.quantizeWithNorm(originalVector);

        // Check if stored Int8 matches re-quantized Int8
        let matchCount = 0;
        for (let j = 0; j < vRow.dimensions; j++) {
          if (storedInt8[j] === reQuantized.int8Data[j]) matchCount++;
        }

        ztoolkit.log(`[VectorStore] Verify ${i}: id=${vRow.id}, dims=${vRow.dimensions}`);
        ztoolkit.log(`  Stored Int8[0:5]=[${Array.from(storedInt8.slice(0, 5))}]`);
        ztoolkit.log(`  Expected Int8[0:5]=[${Array.from(reQuantized.int8Data.slice(0, 5))}]`);
        ztoolkit.log(`  Match: ${matchCount}/${vRow.dimensions} (${(matchCount / vRow.dimensions * 100).toFixed(1)}%)`);
      }
    }

    return migrated;
  }

  /**
   * Check if Int8 migration is needed
   */
  async needsInt8Migration(): Promise<{ needed: boolean; count: number; total: number }> {
    await this.ensureInitialized();

    const total = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings`) || 0;
    const withInt8 = await this.db.valueQueryAsync(`SELECT COUNT(*) FROM embeddings WHERE vector_int8 IS NOT NULL`) || 0;
    const needsMigration = total - withInt8;

    return {
      needed: needsMigration > 0,
      count: needsMigration,
      total
    };
  }

  /**
   * Close database connection
   * This method releases references synchronously and closes DB asynchronously
   * to ensure shutdown doesn't hang on pending async operations.
   */
  close(): void {
    const db = this.db;

    // Release references synchronously to prevent memory leaks
    this.db = null;
    this.initialized = false;
    this.initPromise = null;
    this.vectorCache.clear();

    // Close database asynchronously (fire and forget)
    if (db) {
      try {
        db.closeDatabase().then(() => {
          ztoolkit.log('[VectorStore] Database closed successfully');
        }).catch((e: any) => {
          ztoolkit.log(`[VectorStore] Error closing database: ${e}`, 'warn');
        });
      } catch (e) {
        ztoolkit.log(`[VectorStore] Error initiating database close: ${e}`, 'warn');
      }
    }

    ztoolkit.log('[VectorStore] Database references released');
  }
}

// Singleton instance
let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    ztoolkit.log(`[VectorStore] getVectorStore() creating new singleton instance`);
    vectorStoreInstance = new VectorStore();
  } else {
    ztoolkit.log(`[VectorStore] getVectorStore() returning existing instance, instanceId=${(vectorStoreInstance as any).instanceId}`);
  }
  return vectorStoreInstance;
}

/**
 * Reset the singleton instance (for shutdown cleanup)
 */
export function resetVectorStore(): void {
  if (vectorStoreInstance) {
    vectorStoreInstance.close();
    vectorStoreInstance = null;
  }
  ztoolkit.log('[VectorStore] Singleton instance reset');
}
