/**
 * Smart Annotation Extractor for Zotero MCP Plugin
 * 
 * Handles PDF annotations, highlights, notes with intelligent content management
 * Replaces the overlapping functionality of:
 * - get_annotation_by_id
 * - get_annotations_batch
 * - get_item_notes 
 * - complex search_annotations
 */

import { AnnotationService } from './annotationService';
import { MCPSettingsService } from './mcpSettingsService';

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export interface SmartAnnotationOptions {
  libraryID?: number;
  maxTokens?: number;
  outputMode?: string; // 'smart', 'preview', 'full', 'minimal'
  types?: string[];
  colors?: string[];    // Filter by annotation colors (e.g., ['#ffd400', '#ff6666'])
  tags?: string[];      // Filter by tags
  minRelevance?: number;
  limit?: number;
  offset?: number;
}

export interface AnnotationResult {
  id: string;
  type: 'note' | 'highlight' | 'annotation' | 'ink' | 'text' | 'image';
  content: string;
  color?: string;        // Annotation color (hex code like '#ffd400')
  colorName?: string;    // Human-readable color name
  tags?: string[];       // Tags attached to this annotation
  importance?: number;
  keywords?: string[];
  page?: number;
  dateModified: string;
  itemKey: string;
  parentKey?: string;
}

export interface SmartAnnotationResponse {
  mode: string;
  originalCount?: number;
  includedCount: number;
  estimatedTokens: number;
  compressionRatio?: string;
  metadata: {
    extractedAt: string;
    userSettings: any;
    processingTime: string;
    pagination?: {
      total: number;          // 总结果数
      offset: number;         // 当前偏移量
      limit: number;          // 当前限制
      hasMore: boolean;       // 是否有更多结果
      nextOffset?: number;    // 下一页偏移量（如果有更多）
    };
    stats: {
      foundCount: number;     // 找到的原始数量
      filteredCount: number; // 过滤后数量
      returnedCount: number; // 实际返回数量
      skippedCount?: number;  // 跳过的数量（压缩时）
    };
  };
  data: AnnotationResult[];
}

export class SmartAnnotationExtractor {
  private annotationService: AnnotationService;

  // Common Zotero annotation colors with their names
  private static readonly COLOR_MAP: Record<string, string[]> = {
    '#ffd400': ['yellow', 'question', '黄色'],
    '#ff6666': ['red', 'error', 'important', '红色'],
    '#5fb236': ['green', 'agree', '绿色'],
    '#2ea8e5': ['blue', 'info', '蓝色'],
    '#a28ae5': ['purple', 'definition', '紫色'],
    '#e56eee': ['magenta', 'pink', '粉色'],
    '#f19837': ['orange', 'todo', '橙色'],
    '#aaaaaa': ['gray', 'grey', '灰色'],
  };

  constructor() {
    this.annotationService = new AnnotationService();
  }

  /**
   * Match color by hex code or name
   */
  private matchColor(annotationColor: string, filterColor: string): boolean {
    if (!annotationColor) return false;

    const normalizedAnnotationColor = annotationColor.toLowerCase();
    const normalizedFilter = filterColor.toLowerCase();

    // Direct hex match
    if (normalizedAnnotationColor === normalizedFilter) {
      return true;
    }

    // Name-based matching
    for (const [hexColor, names] of Object.entries(SmartAnnotationExtractor.COLOR_MAP)) {
      if (normalizedAnnotationColor === hexColor) {
        // Check if filter matches any name for this color
        if (names.some(name => name.includes(normalizedFilter) || normalizedFilter.includes(name))) {
          return true;
        }
      }
      // Also check if filter is a hex code that matches
      if (normalizedFilter === hexColor && normalizedAnnotationColor === hexColor) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get human-readable color name from hex code
   */
  private getColorName(hexColor: string): string {
    if (!hexColor) return '';
    const normalizedHex = hexColor.toLowerCase();
    const names = SmartAnnotationExtractor.COLOR_MAP[normalizedHex];
    return names ? names[0] : hexColor;
  }

  /**
   * Unified annotation retrieval (replaces 4 old tools)
   */
  async getAnnotations(params: {
    libraryID?: number;
    itemKey?: string;
    annotationId?: string;
    annotationIds?: string[];
    types?: string[];
    colors?: string[];      // Filter by colors (e.g., ['#ffd400', 'yellow'])
    tags?: string[];        // Filter by tags
    maxTokens?: number;
    outputMode?: string;
    limit?: number;
    offset?: number;
  }): Promise<SmartAnnotationResponse> {
    const startTime = Date.now();
    
    try {
      ztoolkit.log(`[SmartAnnotationExtractor] getAnnotations called with params: ${JSON.stringify(params)}`);

      // Read user settings for defaults
      const effectiveSettings = MCPSettingsService.getEffectiveSettings();
      
      const options: SmartAnnotationOptions = {
        libraryID: params.libraryID,
        maxTokens: params.maxTokens || effectiveSettings.maxTokens,
        outputMode: params.outputMode || MCPSettingsService.get('content.mode'),
        types: params.types || ['note', 'highlight', 'annotation'],
        colors: params.colors,  // Color filter (hex codes or names)
        tags: params.tags,      // Tag filter
        limit: params.limit || (MCPSettingsService.get('content.mode') === 'complete' ? effectiveSettings.maxAnnotationsPerRequest : 20),
        offset: params.offset || 0
      };

      ztoolkit.log(`[SmartAnnotationExtractor] Using settings - maxTokens: ${options.maxTokens}, mode: ${options.outputMode}`);

      let annotations: any[] = [];

      // Route to different retrieval methods
      if (params.annotationId) {
        annotations = await this.getById(params.annotationId, options.libraryID);
      } else if (params.annotationIds) {
        annotations = await this.getByIds(params.annotationIds, options.libraryID);
      } else if (params.itemKey) {
        annotations = await this.getByItem(params.itemKey, options);
      } else {
        throw new Error('Must provide itemKey, annotationId, or annotationIds');
      }

      // Apply type filtering
      if (options.types && options.types.length > 0) {
        annotations = annotations.filter(ann => options.types!.includes(ann.type));
      }

      // Apply color filtering
      if (options.colors && options.colors.length > 0) {
        annotations = annotations.filter(ann => {
          if (!ann.color) return false;
          return options.colors!.some(filterColor =>
            this.matchColor(ann.color, filterColor)
          );
        });
      }

      // Apply tag filtering
      if (options.tags && options.tags.length > 0) {
        annotations = annotations.filter(ann => {
          if (!ann.tags || ann.tags.length === 0) return false;
          return options.tags!.some(filterTag =>
            ann.tags.some((tag: string) => tag.toLowerCase().includes(filterTag.toLowerCase()))
          );
        });
      }

      // Apply pagination before processing (for performance)
      // Skip pagination for comprehensive/full mode to get all annotations
      const totalCount = annotations.length;
      let paginatedAnnotations: any[];
      
      if (options.outputMode === 'full') {
        // Full mode: return all annotations without pagination
        paginatedAnnotations = annotations;
      } else {
        // Other modes: apply pagination for performance
        paginatedAnnotations = annotations.slice(options.offset!, options.offset! + options.limit!);
      }

      // Process content with smart compression
      const processed = await this.processAnnotations(paginatedAnnotations, options);

      const processingTime = `${Date.now() - startTime}ms`;
      ztoolkit.log(`[SmartAnnotationExtractor] Completed in ${processingTime}, processed ${processed.includedCount} of ${totalCount} annotations (paginated: ${paginatedAnnotations.length})`);

      // Calculate pagination info
      const hasMore = options.outputMode !== 'full' && (options.offset! + options.limit!) < totalCount;
      const nextOffset = hasMore ? options.offset! + options.limit! : undefined;

      return {
        ...processed,
        metadata: {
          extractedAt: new Date().toISOString(),
          userSettings: {
            maxTokens: options.maxTokens,
            outputMode: options.outputMode
          },
          processingTime,
          pagination: {
            total: totalCount,
            offset: options.offset!,
            limit: options.limit!,
            hasMore,
            nextOffset
          },
          stats: {
            foundCount: totalCount,
            filteredCount: paginatedAnnotations.length,
            returnedCount: processed.includedCount,
            skippedCount: processed.originalCount ? processed.originalCount - processed.includedCount : undefined
          }
        }
      };

    } catch (error) {
      ztoolkit.log(`[SmartAnnotationExtractor] Error in getAnnotations: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Intelligent search with relevance scoring
   */
  async searchAnnotations(query: string, options: {
    libraryID?: number;
    itemKeys?: string[];
    types?: string[];
    colors?: string[];      // Filter by colors
    tags?: string[];        // Filter by tags
    maxTokens?: number;
    outputMode?: string;
    minRelevance?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<SmartAnnotationResponse> {
    const startTime = Date.now();

    try {
      ztoolkit.log(`[SmartAnnotationExtractor] searchAnnotations called: "${query || '(filter only)'}"`);

      const effectiveSettings = MCPSettingsService.getEffectiveSettings();
      const hasQuery = query && query.trim().length > 0;

      const searchOptions: SmartAnnotationOptions = {
        libraryID: options.libraryID,
        maxTokens: options.maxTokens || effectiveSettings.maxTokens,
        outputMode: options.outputMode || MCPSettingsService.get('content.mode'),
        types: options.types || ['note', 'highlight', 'annotation'],
        colors: options.colors,  // Color filter
        tags: options.tags,      // Tag filter
        minRelevance: hasQuery ? (options.minRelevance || 0.1) : 0, // No relevance filter when no query
        limit: options.limit || (MCPSettingsService.get('content.mode') === 'complete' ? effectiveSettings.maxAnnotationsPerRequest : 15),
        offset: options.offset || 0
      };

      let annotations: any[] = [];

      if (hasQuery) {
        // Search using AnnotationService with query
        const searchParams = {
          libraryID: searchOptions.libraryID,
          q: query,
          itemKey: options.itemKeys?.[0], // For now, use first itemKey if provided
          type: searchOptions.types,
          detailed: false, // We'll handle detail level ourselves
          limit: '100', // Get more results to score and filter
          offset: '0'
        };

        const searchResult = await this.annotationService.searchAnnotations(searchParams);
        annotations = searchResult.results || [];
      } else {
        // No query - get ALL annotations for filtering by colors/tags
        // Paginate through all results to ensure complete coverage
        const batchSize = 100;
        let currentOffset = 0;
        let hasMore = true;

        ztoolkit.log(`[SmartAnnotationExtractor] Fetching all annotations for color/tag filtering...`);

        while (hasMore) {
          const allParams = {
            libraryID: searchOptions.libraryID,
            type: searchOptions.types,
            detailed: false,
            limit: String(batchSize),
            offset: String(currentOffset)
          };
          const batchResult = await this.annotationService.searchAnnotations(allParams);
          const batchAnnotations = batchResult.results || [];
          annotations.push(...batchAnnotations);

          // Check if there are more results
          hasMore = batchResult.pagination?.hasMore || false;
          currentOffset += batchSize;

          // Safety limit to prevent infinite loops
          if (currentOffset > 10000) {
            ztoolkit.log(`[SmartAnnotationExtractor] Reached safety limit of 10000 annotations`);
            break;
          }
        }

        ztoolkit.log(`[SmartAnnotationExtractor] Fetched total ${annotations.length} annotations for filtering`);
      }

      // Debug: log annotation colors
      ztoolkit.log(`[SmartAnnotationExtractor] Got ${annotations.length} annotations, checking colors...`);
      const colorCounts: Record<string, number> = {};
      annotations.forEach(ann => {
        const c = ann.color || '(no color)';
        colorCounts[c] = (colorCounts[c] || 0) + 1;
      });
      ztoolkit.log(`[SmartAnnotationExtractor] Color distribution: ${JSON.stringify(colorCounts)}`);

      // Apply relevance scoring and filtering (only when query exists)
      let scoredAnnotations = annotations.map(ann => ({
        ...ann,
        relevance: hasQuery ? this.calculateRelevance(ann, query) : 1.0, // All relevant when no query
        importance: this.calculateImportance(ann)
      })).filter(ann => ann.relevance >= searchOptions.minRelevance!);

      // Apply color filtering
      if (searchOptions.colors && searchOptions.colors.length > 0) {
        ztoolkit.log(`[SmartAnnotationExtractor] Filtering by colors: ${JSON.stringify(searchOptions.colors)}`);
        const beforeCount = scoredAnnotations.length;
        scoredAnnotations = scoredAnnotations.filter(ann => {
          const color = ann.color;
          if (!color) return false;
          const matches = searchOptions.colors!.some(filterColor =>
            this.matchColor(color, filterColor)
          );
          return matches;
        });
        ztoolkit.log(`[SmartAnnotationExtractor] Color filter: ${beforeCount} -> ${scoredAnnotations.length} annotations`);
      }

      // Apply tag filtering
      if (searchOptions.tags && searchOptions.tags.length > 0) {
        scoredAnnotations = scoredAnnotations.filter(ann => {
          if (!ann.tags || ann.tags.length === 0) return false;
          return searchOptions.tags!.some(filterTag =>
            ann.tags.some((tag: string) => tag.toLowerCase().includes(filterTag.toLowerCase()))
          );
        });
      }

      // Sort by combined relevance and importance
      scoredAnnotations.sort((a, b) => {
        const scoreA = (a.relevance * 0.7) + (a.importance * 0.3);
        const scoreB = (b.relevance * 0.7) + (b.importance * 0.3);
        return scoreB - scoreA;
      });

      // Apply pagination (skip for full mode)
      const totalCount = scoredAnnotations.length;
      let paginatedAnnotations: any[];
      
      if (searchOptions.outputMode === 'full') {
        // Full mode: return all relevant annotations
        paginatedAnnotations = scoredAnnotations;
      } else {
        // Other modes: apply pagination
        paginatedAnnotations = scoredAnnotations.slice(searchOptions.offset!, searchOptions.offset! + searchOptions.limit!);
      }

      // Process with smart compression
      const processed = await this.processAnnotations(paginatedAnnotations, searchOptions);

      const processingTime = `${Date.now() - startTime}ms`;
      ztoolkit.log(`[SmartAnnotationExtractor] Search completed in ${processingTime}, found ${processed.includedCount} relevant results of ${totalCount} total (paginated: ${paginatedAnnotations.length})`);

      // Calculate pagination info
      const hasMore = searchOptions.outputMode !== 'full' && (searchOptions.offset! + searchOptions.limit!) < totalCount;
      const nextOffset = hasMore ? searchOptions.offset! + searchOptions.limit! : undefined;

      return {
        ...processed,
        metadata: {
          extractedAt: new Date().toISOString(),
          userSettings: {
            maxTokens: searchOptions.maxTokens,
            outputMode: searchOptions.outputMode,
            minRelevance: searchOptions.minRelevance
          },
          processingTime,
          pagination: {
            total: totalCount,
            offset: searchOptions.offset!,
            limit: searchOptions.limit!,
            hasMore,
            nextOffset
          },
          stats: {
            foundCount: annotations.length,
            filteredCount: totalCount, // 已过滤过相关性的数量
            returnedCount: processed.includedCount,
            skippedCount: processed.originalCount ? processed.originalCount - processed.includedCount : undefined
          }
        }
      };

    } catch (error) {
      ztoolkit.log(`[SmartAnnotationExtractor] Error in searchAnnotations: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Get annotation by single ID
   */
  private async getById(annotationId: string, libraryID?: number): Promise<any[]> {
    const annotation = await this.annotationService.getAnnotationById(annotationId, libraryID);
    return annotation ? [annotation] : [];
  }

  /**
   * Get annotations by multiple IDs
   */
  private async getByIds(annotationIds: string[], libraryID?: number): Promise<any[]> {
    return await this.annotationService.getAnnotationsByIds(annotationIds, libraryID);
  }

  /**
   * Get annotations by item (PDF annotations + notes)
   */
  private async getByItem(itemKey: string, options: SmartAnnotationOptions): Promise<any[]> {
    const annotations: any[] = [];

    // Get notes if requested
    if (options.types!.includes('note')) {
      try {
        const notes = await this.annotationService.getAllNotes(itemKey, options.libraryID);
        annotations.push(...notes);
      } catch (error) {
        ztoolkit.log(`[SmartAnnotationExtractor] Error getting notes for ${itemKey}: ${error}`, 'warn');
      }
    }

    // Get PDF annotations if requested
    const pdfTypes = ['highlight', 'annotation', 'ink', 'text', 'image'];
    if (options.types!.some(type => pdfTypes.includes(type))) {
      try {
        const pdfAnnotations = await this.annotationService.getPDFAnnotations(itemKey, options.libraryID);
        // Filter by requested PDF annotation types
        const filteredPdfAnnotations = pdfAnnotations.filter(ann => options.types!.includes(ann.type));
        annotations.push(...filteredPdfAnnotations);
      } catch (error) {
        ztoolkit.log(`[SmartAnnotationExtractor] Error getting PDF annotations for ${itemKey}: ${error}`, 'warn');
      }
    }

    return annotations;
  }

  /**
   * Smart content processing and compression
   */
  private async processAnnotations(annotations: any[], options: SmartAnnotationOptions): Promise<SmartAnnotationResponse> {
    if (annotations.length === 0) {
      return {
        mode: 'empty',
        includedCount: 0,
        estimatedTokens: 0,
        data: [],
        metadata: {
          extractedAt: new Date().toISOString(),
          userSettings: {
            maxTokens: options.maxTokens,
            outputMode: options.outputMode
          },
          processingTime: "0ms",
          stats: {
            foundCount: 0,
            filteredCount: 0,
            returnedCount: 0
          }
        }
      };
    }

    // Calculate importance scores
    const scoredAnnotations = annotations.map(ann => ({
      ...ann,
      importance: this.calculateImportance(ann)
    }));

    // Estimate tokens for all content
    const fullTokens = this.estimateTokens(scoredAnnotations);

    // If within budget or mode is 'full', return all
    if (fullTokens <= options.maxTokens! || options.outputMode === 'full') {
      const processedAnnotations = scoredAnnotations.map(ann => this.formatAnnotation(ann, 'full'));
      return {
        mode: fullTokens <= options.maxTokens! ? 'full_within_budget' : 'full_forced',
        includedCount: processedAnnotations.length,
        estimatedTokens: fullTokens,
        data: processedAnnotations,
        metadata: {
          extractedAt: new Date().toISOString(),
          userSettings: {
            maxTokens: options.maxTokens,
            outputMode: options.outputMode
          },
          processingTime: "0ms",
          stats: {
            foundCount: annotations.length,
            filteredCount: annotations.length,
            returnedCount: processedAnnotations.length
          }
        }
      };
    }

    // Smart compression needed
    return this.smartCompress(scoredAnnotations, options.maxTokens!, options.outputMode!);
  }

  /**
   * Smart compression algorithm
   */
  private smartCompress(annotations: any[], maxTokens: number, outputMode: string): SmartAnnotationResponse {
    // Sort by importance (descending)
    const sortedAnnotations = [...annotations].sort((a, b) => b.importance - a.importance);

    const result: AnnotationResult[] = [];
    let tokenBudget = maxTokens;
    let skipped = 0;

    for (const annotation of sortedAnnotations) {
      // Determine processing mode based on remaining budget and annotation importance
      let processMode = this.selectProcessingMode(tokenBudget, annotation.importance, outputMode);
      
      if (processMode === 'skip') {
        skipped++;
        continue;
      }

      const processed = this.formatAnnotation(annotation, processMode);
      const estimatedTokens = this.estimateTokens([processed]);

      if (estimatedTokens <= tokenBudget) {
        result.push(processed);
        tokenBudget -= estimatedTokens;
      } else if (tokenBudget > 100) { // Try minimal if we have some budget left
        const minimal = this.formatAnnotation(annotation, 'minimal');
        const minimalTokens = this.estimateTokens([minimal]);
        
        if (minimalTokens <= tokenBudget) {
          result.push(minimal);
          tokenBudget -= minimalTokens;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    const compressionRatio = `${Math.round(result.length / annotations.length * 100)}%`;
    
    return {
      mode: 'smart_compressed',
      originalCount: annotations.length,
      includedCount: result.length,
      estimatedTokens: maxTokens - tokenBudget,
      compressionRatio,
      data: result,
      metadata: {
        extractedAt: new Date().toISOString(),
        userSettings: {
          maxTokens: maxTokens,
          outputMode: outputMode
        },
        processingTime: "0ms",
        stats: {
          foundCount: annotations.length,
          filteredCount: annotations.length,
          returnedCount: result.length,
          skippedCount: annotations.length - result.length
        }
      }
    };
  }

  /**
   * Calculate importance score for an annotation
   */
  private calculateImportance(annotation: any): number {
    let score = 0;

    // Content length score (longer content is often more important)
    const contentLength = (annotation.content || '').length;
    score += Math.min(contentLength, 500) / 500 * 0.3;

    // Type-based scoring
    const typeScores = { 
      note: 0.4,      // Notes are usually more important
      highlight: 0.3, // Highlights are selective
      annotation: 0.2,
      ink: 0.15,
      text: 0.25,
      image: 0.1
    };
    score += typeScores[annotation.type as keyof typeof typeScores] || 0.2;

    // Has comment (user added thoughts)
    if (annotation.comment && annotation.comment.trim()) {
      score += 0.2;
    }

    // Recency score (more recent = more important)
    const daysSinceModified = (Date.now() - new Date(annotation.dateModified).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, (30 - daysSinceModified) / 30) * 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate relevance score for search
   */
  private calculateRelevance(annotation: any, query: string): number {
    const lowerQuery = query.toLowerCase();
    let score = 0;

    // Exact match in content
    if (annotation.content?.toLowerCase().includes(lowerQuery)) {
      score += 0.6;
    }

    // Exact match in comment
    if (annotation.comment?.toLowerCase().includes(lowerQuery)) {
      score += 0.4;
    }

    // Word-based matching
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 1);
    const contentWords = (annotation.content + ' ' + (annotation.comment || '')).toLowerCase().split(/\s+/);
    
    const matches = queryWords.filter(qw => 
      contentWords.some(cw => cw.includes(qw) || qw.includes(cw))
    ).length;
    
    if (queryWords.length > 0) {
      score += (matches / queryWords.length) * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Select processing mode based on budget and importance
   */
  private selectProcessingMode(availableTokens: number, importance: number, userMode: string): string {
    if (userMode === 'minimal') return 'minimal';
    if (userMode === 'full') return 'full';
    
    // For smart and preview modes, adapt based on budget and importance
    if (availableTokens > 500 && importance > 0.6) return 'full';
    if (availableTokens > 200 && importance > 0.3) return 'preview';
    if (availableTokens > 80) return 'minimal';
    
    return 'skip';
  }

  /**
   * Format annotation according to processing mode
   */
  private formatAnnotation(annotation: any, mode: string): AnnotationResult {
    const base: AnnotationResult = {
      id: annotation.id,
      type: annotation.type,
      content: '',
      color: annotation.color,
      colorName: this.getColorName(annotation.color),
      tags: annotation.tags || [],
      itemKey: annotation.itemKey,
      parentKey: annotation.parentKey,
      page: annotation.page,
      dateModified: annotation.dateModified
    };

    switch (mode) {
      case 'minimal':
        base.content = this.smartTruncate(annotation.content || annotation.text || '', 50);
        base.keywords = this.extractKeywords(annotation.content || annotation.text || '', 2);
        break;

      case 'preview':
        base.content = this.smartTruncate(annotation.content || annotation.text || '', 150);
        base.keywords = this.extractKeywords(
          (annotation.content || '') + ' ' + (annotation.comment || '') + ' ' + (annotation.text || ''), 
          5
        );
        base.importance = annotation.importance;
        break;

      case 'full':
        base.content = annotation.content || annotation.text || '';
        if (annotation.comment && annotation.comment !== base.content) {
          base.content += annotation.comment ? `\n\nComment: ${annotation.comment}` : '';
        }
        base.keywords = this.extractKeywords(base.content, 8);
        base.importance = annotation.importance;
        break;

      default:
        base.content = annotation.content || annotation.text || '';
        break;
    }

    return base;
  }

  /**
   * Smart truncation that preserves sentence boundaries
   */
  private smartTruncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    const lastSentence = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('\n')
    );
    
    if (lastSentence > maxLength * 0.6) {
      return truncated.substring(0, lastSentence + 1) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string, maxCount: number): string[] {
    if (!text) return [];
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      '的', '了', '在', '是', '和', '与', '或', '但', '然而', '因此', '所以', '这', '那', '有', '没有'
    ]);
    
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCount)
      .map(([word]) => word);
  }

  /**
   * Estimate token count for content
   */
  private estimateTokens(content: any): number {
    const text = JSON.stringify(content);
    // Rough estimation: 1 token ≈ 3.5 characters for mixed Chinese/English
    return Math.ceil(text.length / 3.5);
  }

}