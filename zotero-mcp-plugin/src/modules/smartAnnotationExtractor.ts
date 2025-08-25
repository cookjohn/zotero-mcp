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
  maxTokens?: number;
  outputMode?: string; // 'smart', 'preview', 'full', 'minimal'
  types?: string[];
  minRelevance?: number;
  limit?: number;
  offset?: number;
}

export interface AnnotationResult {
  id: string;
  type: 'note' | 'highlight' | 'annotation' | 'ink' | 'text' | 'image';
  content: string;
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

  constructor() {
    this.annotationService = new AnnotationService();
  }

  /**
   * Unified annotation retrieval (replaces 4 old tools)
   */
  async getAnnotations(params: {
    itemKey?: string;
    annotationId?: string;
    annotationIds?: string[];
    types?: string[];
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
        maxTokens: params.maxTokens || effectiveSettings.maxTokens,
        outputMode: params.outputMode || effectiveSettings.defaultOutputMode,
        types: params.types || ['note', 'highlight', 'annotation'],
        limit: params.limit || (effectiveSettings.defaultOutputMode === 'full' ? effectiveSettings.maxAnnotationsPerRequest : 20),
        offset: params.offset || 0
      };

      ztoolkit.log(`[SmartAnnotationExtractor] Using settings - maxTokens: ${options.maxTokens}, mode: ${options.outputMode}`);

      let annotations: any[] = [];

      // Route to different retrieval methods
      if (params.annotationId) {
        annotations = await this.getById(params.annotationId);
      } else if (params.annotationIds) {
        annotations = await this.getByIds(params.annotationIds);
      } else if (params.itemKey) {
        annotations = await this.getByItem(params.itemKey, options);
      } else {
        throw new Error('Must provide itemKey, annotationId, or annotationIds');
      }

      // Apply type filtering
      if (options.types && options.types.length > 0) {
        annotations = annotations.filter(ann => options.types!.includes(ann.type));
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
    itemKeys?: string[];
    types?: string[];
    maxTokens?: number;
    outputMode?: string;
    minRelevance?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<SmartAnnotationResponse> {
    const startTime = Date.now();

    try {
      ztoolkit.log(`[SmartAnnotationExtractor] searchAnnotations called: "${query}"`);

      const effectiveSettings = MCPSettingsService.getEffectiveSettings();

      const searchOptions: SmartAnnotationOptions = {
        maxTokens: options.maxTokens || effectiveSettings.maxTokens,
        outputMode: options.outputMode || effectiveSettings.defaultOutputMode,
        types: options.types || ['note', 'highlight', 'annotation'],
        minRelevance: options.minRelevance || 0.1,
        limit: options.limit || (effectiveSettings.defaultOutputMode === 'full' ? effectiveSettings.maxAnnotationsPerRequest : 15),
        offset: options.offset || 0
      };

      // Search using AnnotationService
      const searchParams = {
        q: query,
        itemKey: options.itemKeys?.[0], // For now, use first itemKey if provided
        type: searchOptions.types,
        detailed: false, // We'll handle detail level ourselves
        limit: '100', // Get more results to score and filter
        offset: '0'
      };

      const searchResult = await this.annotationService.searchAnnotations(searchParams);
      let annotations = searchResult.results || [];

      // Apply relevance scoring and filtering
      const scoredAnnotations = annotations.map(ann => ({
        ...ann,
        relevance: this.calculateRelevance(ann, query),
        importance: this.calculateImportance(ann)
      })).filter(ann => ann.relevance >= searchOptions.minRelevance!);

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
            foundCount: searchResult.results?.length || 0,
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
  private async getById(annotationId: string): Promise<any[]> {
    const annotation = await this.annotationService.getAnnotationById(annotationId);
    return annotation ? [annotation] : [];
  }

  /**
   * Get annotations by multiple IDs
   */
  private async getByIds(annotationIds: string[]): Promise<any[]> {
    return await this.annotationService.getAnnotationsByIds(annotationIds);
  }

  /**
   * Get annotations by item (PDF annotations + notes)
   */
  private async getByItem(itemKey: string, options: SmartAnnotationOptions): Promise<any[]> {
    const annotations: any[] = [];

    // Get notes if requested
    if (options.types!.includes('note')) {
      try {
        const notes = await this.annotationService.getAllNotes(itemKey);
        annotations.push(...notes);
      } catch (error) {
        ztoolkit.log(`[SmartAnnotationExtractor] Error getting notes for ${itemKey}: ${error}`, 'warn');
      }
    }

    // Get PDF annotations if requested
    const pdfTypes = ['highlight', 'annotation', 'ink', 'text', 'image'];
    if (options.types!.some(type => pdfTypes.includes(type))) {
      try {
        const pdfAnnotations = await this.annotationService.getPDFAnnotations(itemKey);
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