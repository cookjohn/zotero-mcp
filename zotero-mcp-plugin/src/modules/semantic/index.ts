/**
 * Semantic Search Module
 *
 * Exports all semantic search components for use in the Zotero MCP Plugin.
 */

// Core services
export {
  SemanticSearchService,
  getSemanticSearchService,
  type SemanticSearchOptions,
  type SemanticSearchResult,
  type IndexProgress,
  type SemanticServiceStats
} from './semanticSearchService';

// Embedding service
export {
  EmbeddingService,
  getEmbeddingService,
  type EmbeddingResult,
  type BatchEmbeddingItem,
  type EmbeddingConfig,
  type EmbeddingServiceStatus
} from './embeddingService';

// Vector storage
export {
  VectorStore,
  getVectorStore,
  type VectorRecord,
  type QuantizedVector,
  type SearchResult,
  type IndexStatus,
  type VectorStoreStats
} from './vectorStore';

// Text processing
export {
  TextChunker,
  getTextChunker,
  resetTextChunker,
  TextQualityPreprocessor,
  type ChunkerOptions,
  type TextChunk,
  type SemanticChunk
} from './textChunker';
