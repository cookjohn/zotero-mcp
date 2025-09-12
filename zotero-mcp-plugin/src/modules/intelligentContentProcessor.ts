/**
 * Intelligent Content Processor for Zotero MCP Plugin
 * Implements advanced algorithms for content importance scoring and intelligent extraction
 * Based on 2024 research: TF-IDF + Improved TextRank + Position Weighting
 */

declare let ztoolkit: ZToolkit;

export interface ContentControl {
  preserveOriginal?: boolean;        // 保持原文完整性 (默认true)
  allowExtended?: boolean;           // 允许超出模式默认长度 (默认false)
  expandIfImportant?: boolean;       // 重要内容时自动扩展 (默认true)
  
  // 长度控制覆盖
  maxContentLength?: number;         // 覆盖模式默认长度限制
  maxAttachments?: number;           // 覆盖附件数量限制  
  maxNotes?: number;                 // 覆盖笔记数量限制
  
  // 质量控制
  prioritizeCompleteness?: boolean;  // 优先完整性而非长度 (默认false)
  requireContext?: boolean;          // 要求上下文完整性 (默认true)
  minSentenceLength?: number;        // 最小句子长度阈值
  
  // 智能扩展策略
  smartExpansion?: {
    enabled?: boolean;               // 启用智能扩展 (默认false)
    trigger?: 'high_importance' | 'user_query' | 'context_needed';
    maxExpansionRatio?: number;      // 最大扩展倍数 (如1.5x)
  };
}

export interface ProcessedSentence {
  content: string;
  position: number;                  // 在文档中的位置 (0-1)
  importance: number;                // 综合重要性评分 (0-1)
  tfIdfScore: number;               // TF-IDF评分
  textRankScore: number;            // TextRank评分
  positionWeight: number;           // 位置权重
  length: number;                   // 句子长度
  keywords: string[];               // 关键词
  isComplete: boolean;              // 是否是完整句子
  contentType?: 'main_content' | 'reference' | 'supplementary'; // 内容类型
}

export interface ProcessingResult {
  originalText: string;
  processedText: string;
  sentences: ProcessedSentence[];
  metadata: {
    originalLength: number;
    processedLength: number;
    preservationRatio: number;
    selectedSentences: number;
    totalSentences: number;
    averageImportance: number;
    processingMethod: string;
    appliedLimits: any;
    expansionTriggered: boolean;
  };
}

export class IntelligentContentProcessor {
  
  /**
   * Process text content with intelligent algorithms
   */
  async processContent(
    text: string, 
    mode: string, 
    contentControl: ContentControl = {}
  ): Promise<ProcessingResult> {
    try {
      ztoolkit.log(`[IntelligentProcessor] Processing content with mode: ${mode}`);
      
      if (!text || text.trim().length === 0) {
        return this.createEmptyResult();
      }

      // Step 1: Split text into sentences
      const sentences = this.splitIntoSentences(text);
      
      // Step 2: Calculate importance scores for each sentence
      const scoredSentences = await this.calculateImportanceScores(sentences, text);
      
      // Step 3: Apply mode-based selection with contentControl
      const selectedSentences = this.selectContentByMode(scoredSentences, mode, contentControl);
      
      // Step 4: Generate final processed text
      const processedText = this.reconstructText(selectedSentences, contentControl);
      
      // Step 5: Generate metadata
      const metadata = this.generateMetadata(text, processedText, sentences, selectedSentences, mode, contentControl);

      return {
        originalText: text,
        processedText,
        sentences: selectedSentences,
        metadata
      };

    } catch (error) {
      ztoolkit.log(`[IntelligentProcessor] Error processing content: ${error}`, "error");
      // Fallback to simple truncation
      return this.fallbackProcessing(text, mode);
    }
  }

  /**
   * Split text into sentences with position tracking
   */
  private splitIntoSentences(text: string): ProcessedSentence[] {
    // Enhanced sentence splitting that handles various punctuation
    const sentenceRegex = /[.!?]+\s+|[。！？]+\s*|\n\s*\n/g;
    const sentences: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = text.substring(lastIndex, match.index + match[0].length).trim();
      if (sentence.length > 10) { // Filter out very short fragments
        sentences.push(sentence);
      }
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text as last sentence
    const remaining = text.substring(lastIndex).trim();
    if (remaining.length > 10) {
      sentences.push(remaining);
    }

    // Convert to ProcessedSentence objects
    return sentences.map((sentence, index) => ({
      content: sentence,
      position: index / Math.max(sentences.length - 1, 1), // 0 to 1
      importance: 0, // Will be calculated
      tfIdfScore: 0,
      textRankScore: 0,
      positionWeight: 0,
      length: sentence.length,
      keywords: [],
      isComplete: this.isCompleteSentence(sentence)
    }));
  }

  /**
   * Calculate comprehensive importance scores using multiple algorithms
   */
  private async calculateImportanceScores(sentences: ProcessedSentence[], fullText: string): Promise<ProcessedSentence[]> {
    ztoolkit.log(`[IntelligentProcessor] Calculating importance scores for ${sentences.length} sentences`);

    // Calculate TF-IDF scores
    const tfIdfScores = this.calculateTfIdf(sentences, fullText);
    
    // Calculate TextRank scores
    const textRankScores = this.calculateTextRank(sentences);
    
    // Calculate position weights
    const positionWeights = this.calculatePositionWeights(sentences);

    // Combine scores with weighted formula and content classification
    return sentences.map((sentence, index) => {
      const tfIdf = tfIdfScores[index] || 0;
      const textRank = textRankScores[index] || 0;
      const posWeight = positionWeights[index] || 0;
      
      // Classify content section
      const contentType = this.classifyContentSection(sentence.content, sentence.position);
      
      // Apply content type modifiers
      let contentTypeModifier = 1.0;
      switch (contentType) {
        case 'reference':
          contentTypeModifier = 0.1; // Heavily penalize references
          break;
        case 'supplementary':
          contentTypeModifier = 0.3; // Moderately penalize supplementary content
          break;
        case 'main_content':
          contentTypeModifier = 1.0; // Keep main content at full value
          break;
      }
      
      // Weighted combination: 40% TF-IDF + 35% TextRank + 25% Position
      const baseImportance = (0.4 * tfIdf) + (0.35 * textRank) + (0.25 * posWeight);
      const adjustedImportance = baseImportance * contentTypeModifier;
      
      return {
        ...sentence,
        tfIdfScore: tfIdf,
        textRankScore: textRank,
        positionWeight: posWeight,
        importance: Math.min(1.0, adjustedImportance), // Normalize to 0-1
        keywords: this.extractKeywords(sentence.content, 3),
        contentType // Add content type for debugging
      };
    });
  }

  /**
   * TF-IDF calculation implementation
   */
  private calculateTfIdf(sentences: ProcessedSentence[], fullText: string): number[] {
    // Tokenize all text
    const allWords = this.tokenize(fullText.toLowerCase());
    const wordCount = allWords.length;
    const uniqueWords = [...new Set(allWords)];
    
    // Calculate document frequency for each word
    const documentFreq = new Map<string, number>();
    uniqueWords.forEach(word => {
      let count = 0;
      sentences.forEach(sentence => {
        if (sentence.content.toLowerCase().includes(word)) {
          count++;
        }
      });
      documentFreq.set(word, count);
    });

    // Calculate TF-IDF for each sentence
    return sentences.map(sentence => {
      const sentenceWords = this.tokenize(sentence.content.toLowerCase());
      const sentenceWordCount = sentenceWords.length;
      
      if (sentenceWordCount === 0) return 0;
      
      // Calculate term frequency and IDF
      let totalTfIdf = 0;
      const wordFreq = new Map<string, number>();
      
      // Count word frequency in sentence
      sentenceWords.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });
      
      // Calculate TF-IDF for each unique word in sentence
      [...wordFreq.keys()].forEach(word => {
        const tf = wordFreq.get(word)! / sentenceWordCount;
        const df = documentFreq.get(word) || 1;
        const idf = Math.log(sentences.length / df);
        totalTfIdf += tf * idf;
      });
      
      return totalTfIdf / wordFreq.size; // Average TF-IDF
    });
  }

  /**
   * TextRank calculation implementation (simplified graph-based approach)
   */
  private calculateTextRank(sentences: ProcessedSentence[]): number[] {
    const numSentences = sentences.length;
    if (numSentences <= 1) return [1.0];

    // Create similarity matrix
    const similarityMatrix = this.createSimilarityMatrix(sentences);
    
    // Initialize ranks
    let ranks = new Array(numSentences).fill(1.0 / numSentences);
    const dampingFactor = 0.85;
    const iterations = 10; // Simplified iteration count
    
    // Iterative calculation
    for (let iter = 0; iter < iterations; iter++) {
      const newRanks = new Array(numSentences).fill(0);
      
      for (let i = 0; i < numSentences; i++) {
        let sum = 0;
        for (let j = 0; j < numSentences; j++) {
          if (i !== j && similarityMatrix[j][i] > 0) {
            // Calculate sum of outbound similarities for sentence j
            const outboundSum = similarityMatrix[j].reduce((acc, val, idx) => 
              idx !== j ? acc + val : acc, 0);
            if (outboundSum > 0) {
              sum += (similarityMatrix[j][i] / outboundSum) * ranks[j];
            }
          }
        }
        newRanks[i] = (1 - dampingFactor) + dampingFactor * sum;
      }
      ranks = newRanks;
    }
    
    // Normalize to 0-1 range
    const maxRank = Math.max(...ranks);
    const minRank = Math.min(...ranks);
    const range = maxRank - minRank;
    
    return range > 0 ? ranks.map(rank => (rank - minRank) / range) : ranks;
  }

  /**
   * Create similarity matrix for TextRank
   */
  private createSimilarityMatrix(sentences: ProcessedSentence[]): number[][] {
    const numSentences = sentences.length;
    const matrix = Array(numSentences).fill(null).map(() => Array(numSentences).fill(0));
    
    for (let i = 0; i < numSentences; i++) {
      for (let j = 0; j < numSentences; j++) {
        if (i !== j) {
          matrix[i][j] = this.calculateSentenceSimilarity(sentences[i], sentences[j]);
        }
      }
    }
    
    return matrix;
  }

  /**
   * Calculate similarity between two sentences using word overlap
   */
  private calculateSentenceSimilarity(sent1: ProcessedSentence, sent2: ProcessedSentence): number {
    const words1 = new Set(this.tokenize(sent1.content.toLowerCase()));
    const words2 = new Set(this.tokenize(sent2.content.toLowerCase()));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate position weights (beginning and end more important)
   */
  private calculatePositionWeights(sentences: ProcessedSentence[]): number[] {
    return sentences.map(sentence => {
      const pos = sentence.position;
      // U-shaped curve: beginning (0) and end (1) get higher weights
      if (pos <= 0.1) return 1.0;        // First 10%
      if (pos >= 0.9) return 0.9;        // Last 10%
      if (pos <= 0.3) return 0.7;        // First 30%
      if (pos >= 0.7) return 0.6;        // Last 30%
      return 0.3;                        // Middle gets lower weight
    });
  }

  /**
   * Select content based on mode and content control parameters
   */
  private selectContentByMode(
    sentences: ProcessedSentence[], 
    mode: string, 
    contentControl: ContentControl
  ): ProcessedSentence[] {
    // Get effective limits (considering contentControl overrides)
    const limits = this.resolveContentLimits(mode, contentControl);
    
    ztoolkit.log(`[IntelligentProcessor] Mode: ${mode}, Limits: ${JSON.stringify(limits)}`);
    
    // Special handling for minimal mode to prioritize main content
    if (mode === 'minimal') {
      return this.selectMinimalContent(sentences, limits, contentControl);
    }
    
    // Sort by importance (descending)
    const sortedSentences = [...sentences].sort((a, b) => b.importance - a.importance);
    
    let selectedSentences: ProcessedSentence[] = [];
    let currentLength = 0;
    
    // Select sentences based on importance and length constraints
    for (const sentence of sortedSentences) {
      const wouldExceedLimit = limits.maxContentLength > 0 && 
                              (currentLength + sentence.length) > limits.maxContentLength;
      
      if (wouldExceedLimit) {
        // Check if we should expand for important content
        if (contentControl.expandIfImportant && sentence.importance > 0.8) {
          ztoolkit.log(`[IntelligentProcessor] Expanding for high importance content: ${sentence.importance}`);
          // Allow expansion up to maxExpansionRatio
          const maxExpanded = limits.maxContentLength * (contentControl.smartExpansion?.maxExpansionRatio || 1.5);
          if (currentLength + sentence.length <= maxExpanded) {
            selectedSentences.push(sentence);
            currentLength += sentence.length;
          }
        }
        // Check if prioritizing completeness
        else if (contentControl.prioritizeCompleteness && sentence.importance > 0.5) {
          selectedSentences.push(sentence);
          currentLength += sentence.length;
        }
        else {
          break; // Stop adding sentences
        }
      } else {
        selectedSentences.push(sentence);
        currentLength += sentence.length;
      }
    }
    
    // Sort selected sentences back to original order for coherent reading
    return selectedSentences.sort((a, b) => a.position - b.position);
  }

  /**
   * Special selection logic for minimal mode to prioritize main content
   */
  private selectMinimalContent(
    sentences: ProcessedSentence[], 
    limits: any, 
    contentControl: ContentControl
  ): ProcessedSentence[] {
    // First, separate sentences by content type
    const mainContent = sentences.filter(s => s.contentType === 'main_content');
    const otherContent = sentences.filter(s => s.contentType !== 'main_content');
    
    ztoolkit.log(`[IntelligentProcessor] Minimal mode: ${mainContent.length} main, ${otherContent.length} other sentences`);
    
    // Sort main content by importance (descending)
    const sortedMainContent = [...mainContent].sort((a, b) => b.importance - a.importance);
    
    let selectedSentences: ProcessedSentence[] = [];
    let currentLength = 0;
    
    // First, try to fill the limit with main content
    for (const sentence of sortedMainContent) {
      if (limits.maxContentLength > 0 && (currentLength + sentence.length) > limits.maxContentLength) {
        break;
      }
      selectedSentences.push(sentence);
      currentLength += sentence.length;
    }
    
    // If we still have room and no main content was selected, 
    // fall back to highest-importance other content
    if (selectedSentences.length === 0 && otherContent.length > 0) {
      const sortedOtherContent = [...otherContent].sort((a, b) => b.importance - a.importance);
      
      for (const sentence of sortedOtherContent) {
        if (limits.maxContentLength > 0 && (currentLength + sentence.length) > limits.maxContentLength) {
          break;
        }
        selectedSentences.push(sentence);
        currentLength += sentence.length;
        
        // For minimal mode, prefer one high-quality sentence over many low-quality ones
        if (selectedSentences.length >= 2) {
          break;
        }
      }
    }
    
    // Sort selected sentences back to original order for coherent reading
    return selectedSentences.sort((a, b) => a.position - b.position);
  }

  /**
   * Resolve effective content limits considering mode and overrides
   */
  private resolveContentLimits(mode: string, contentControl: ContentControl): any {
    const baseLimits = this.getModeConfiguration(mode);
    
    return {
      maxContentLength: contentControl.maxContentLength ?? 
                       (contentControl.allowExtended ? baseLimits.maxContentLength * 1.5 : baseLimits.maxContentLength),
      maxAttachments: contentControl.maxAttachments ?? baseLimits.maxAttachments,
      maxNotes: contentControl.maxNotes ?? baseLimits.maxNotes
    };
  }

  /**
   * Get base mode configuration
   */
  private getModeConfiguration(mode: string): any {
    const configs = {
      'minimal': { maxContentLength: 500, maxAttachments: 2, maxNotes: 3 },
      'preview': { maxContentLength: 1500, maxAttachments: 5, maxNotes: 8 },
      'smart': { maxContentLength: 3000, maxAttachments: 10, maxNotes: 15 },
      'full': { maxContentLength: -1, maxAttachments: -1, maxNotes: -1 }
    };
    
    return configs[mode as keyof typeof configs] || configs['smart'];
  }

  /**
   * Reconstruct text from selected sentences
   */
  private reconstructText(sentences: ProcessedSentence[], contentControl: ContentControl): string {
    if (sentences.length === 0) return '';
    
    let result = sentences.map(s => s.content).join(' ');
    
    // Ensure text ends properly if truncated
    if (contentControl.requireContext !== false && !this.isCompleteSentence(result)) {
      result += '...';
    }
    
    return result.trim();
  }

  /**
   * Generate comprehensive metadata
   */
  private generateMetadata(
    originalText: string, 
    processedText: string, 
    allSentences: ProcessedSentence[], 
    selectedSentences: ProcessedSentence[],
    mode: string,
    contentControl: ContentControl
  ): any {
    const avgImportance = selectedSentences.length > 0 
      ? selectedSentences.reduce((sum, s) => sum + s.importance, 0) / selectedSentences.length 
      : 0;

    return {
      originalLength: originalText.length,
      processedLength: processedText.length,
      preservationRatio: originalText.length > 0 ? processedText.length / originalText.length : 1,
      selectedSentences: selectedSentences.length,
      totalSentences: allSentences.length,
      averageImportance: avgImportance,
      processingMethod: 'intelligent-scoring',
      appliedLimits: this.resolveContentLimits(mode, contentControl),
      expansionTriggered: contentControl.expandIfImportant && 
                         selectedSentences.some(s => s.importance > 0.8)
    };
  }

  /**
   * Utility methods
   */
  private tokenize(text: string): string[] {
    return text.toLowerCase()
               .replace(/[^\w\s]/g, ' ')
               .split(/\s+/)
               .filter(word => word.length > 2);
  }

  private extractKeywords(text: string, count: number): string[] {
    const words = this.tokenize(text);
    const wordFreq = new Map<string, number>();
    
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
    
    return [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word]) => word);
  }

  private isCompleteSentence(text: string): boolean {
    return /[.!?。！？]$/.test(text.trim());
  }

  /**
   * Detect if sentence is likely a reference or citation
   */
  private isReference(sentence: string): boolean {
    const content = sentence.trim();
    const lowerContent = content.toLowerCase();
    
    // Reference section headers
    if (/^(references?|bibliography|works?\s+cited|literature\s+cited)\s*$/i.test(content)) {
      return true;
    }
    
    // Common reference patterns
    const referencePatterns = [
      /^\d+\.\s+[A-Z][a-z]+,?\s+[A-Z][\.\w]*/, // "1. Smith, J." or "1. Smith, John"
      /^\[\d+\]\s*/, // "[1]" style citations
      /^[A-Z][a-z]+,\s*[A-Z][\.\w]*.*\(\d{4}[a-z]?\)/, // "Smith, J. (2020)" 
      /^[A-Z][a-z]+,\s*[A-Z][\.\w]*,?\s+.*\d{4}[a-z]?[\.,]/, // "Smith, J., Title, 2020."
      /et\s+al\..*\(\d{4}\)/, // "Smith et al. (2020)"
      /doi\s*:\s*10\.\d+/, // DOI patterns
      /https?:\/\/[^\s]+/, // URLs
      /www\.[^\s]+/, // www URLs
    ];
    
    // Check against patterns
    const hasReferencePattern = referencePatterns.some(pattern => pattern.test(content));
    
    // Academic terms that often appear in references
    const academicTerms = [
      'journal', 'proceedings', 'conference', 'symposium',
      'vol\\.', 'volume', 'issue', 'pp\\.', 'pages',
      'editor', 'eds\\.', 'publisher', 'press',
      'retrieved from', 'available at'
    ];
    const hasAcademicTerms = academicTerms.some(term => 
      new RegExp(term, 'i').test(lowerContent)
    );
    
    // Additional heuristics
    const hasYear = /\(\d{4}[a-z]?\)|\b\d{4}[a-z]?[\.,]/.test(content);
    const hasAuthorPattern = /^[A-Z][a-z]+,\s*[A-Z]/.test(content);
    const startsWithNumber = /^\d+\./.test(content);
    const hasMultipleAuthors = /,\s*[A-Z]\./g.test(content) || /&|and\s+[A-Z][a-z]+,/.test(content);
    
    // Combine criteria - need at least two indicators for high confidence
    let indicators = 0;
    if (hasReferencePattern) indicators += 3; // Strong indicator
    if (hasAcademicTerms && hasYear) indicators += 2; // Medium-strong
    if (hasAuthorPattern && hasYear) indicators += 2; // Medium-strong  
    if (startsWithNumber && hasAuthorPattern) indicators += 2; // Medium-strong
    if (hasMultipleAuthors) indicators += 1; // Weak
    if (hasYear) indicators += 1; // Weak
    
    return indicators >= 2;
  }

  /**
   * Detect content sections and classify importance
   */
  private classifyContentSection(sentence: string, position: number): 'main_content' | 'reference' | 'supplementary' {
    // Check for reference
    if (this.isReference(sentence)) {
      return 'reference';
    }
    
    // Check for supplementary content (acknowledgments, appendices, etc.)
    const supplementaryPatterns = [
      /acknowledgment|acknowledgement|thanks|funding|grant|support/i,
      /appendix|supplementary|additional|extra/i,
      /conflict\s+of\s+interest|competing\s+interest/i
    ];
    
    if (supplementaryPatterns.some(pattern => pattern.test(sentence))) {
      return 'supplementary';
    }
    
    return 'main_content';
  }

  private createEmptyResult(): ProcessingResult {
    return {
      originalText: '',
      processedText: '',
      sentences: [],
      metadata: {
        originalLength: 0,
        processedLength: 0,
        preservationRatio: 1,
        selectedSentences: 0,
        totalSentences: 0,
        averageImportance: 0,
        processingMethod: 'empty',
        appliedLimits: {},
        expansionTriggered: false
      }
    };
  }

  private fallbackProcessing(text: string, mode: string): ProcessingResult {
    const config = this.getModeConfiguration(mode);
    const truncatedText = config.maxContentLength > 0 && text.length > config.maxContentLength
      ? text.substring(0, config.maxContentLength) + '...'
      : text;
    
    return {
      originalText: text,
      processedText: truncatedText,
      sentences: [],
      metadata: {
        originalLength: text.length,
        processedLength: truncatedText.length,
        preservationRatio: truncatedText.length / text.length,
        selectedSentences: 0,
        totalSentences: 0,
        averageImportance: 0,
        processingMethod: 'fallback-truncation',
        appliedLimits: config,
        expansionTriggered: false
      }
    };
  }
}

export const intelligentContentProcessor = new IntelligentContentProcessor();