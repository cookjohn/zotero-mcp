/**
 * Semantic Text Chunker for Embedding
 *
 * Splits text into semantically meaningful chunks for embedding generation.
 * Features:
 * - Document structure detection (abstract, sections, references)
 * - Quality assessment and garbage filtering
 * - Sentence-level splitting with semantic boundaries
 * - Support for Chinese and English academic papers
 */

declare let ztoolkit: ZToolkit;

// ============== Interfaces ==============

export interface ChunkerOptions {
  maxChunkSize: number;      // Maximum chunk size (characters)
  minChunkSize: number;      // Minimum chunk size
  overlapSentences: number;  // Number of sentences to overlap
  skipReferences: boolean;   // Skip reference section
  qualityThreshold: number;  // Minimum quality score (0-100)
}

export interface TextChunk {
  id: number;
  text: string;
  startPos: number;
  endPos: number;
}

export interface SemanticChunk {
  text: string;
  type: 'abstract' | 'keywords' | 'section' | 'paragraph' | 'references';
  title?: string;
  importance: 'high' | 'normal' | 'low';
  quality: number;
}

interface DocumentStructure {
  hasAbstract: boolean;
  abstractStart?: number;
  abstractEnd?: number;
  hasKeywords: boolean;
  keywordsStart?: number;
  keywordsEnd?: number;
  sections: Array<{ level: number; title: string; position: number }>;
  referencesStart: number | null;
}

interface QualityResult {
  score: number;
  issues: string[];
  shouldIndex: boolean;
}

// ============== Text Quality Preprocessor ==============

export class TextQualityPreprocessor {
  /**
   * Preprocess and assess text quality
   */
  static process(text: string): { text: string; quality: QualityResult } {
    if (!text || text.trim().length === 0) {
      return {
        text: '',
        quality: { score: 0, issues: ['empty'], shouldIndex: false }
      };
    }

    let processed = text;

    // 1. Normalize whitespace
    processed = processed
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2000-\u200B]/g, ' ')
      .replace(/ {3,}/g, '  ');

    // 2. Remove control characters (keep newlines)
    processed = processed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 3. Remove garbage lines (OCR failures)
    processed = this.removeGarbageLines(processed);

    // 4. Remove repeated header/footer lines
    processed = this.removeRepeatedLines(processed);

    // 5. Clean up excessive newlines
    processed = processed.replace(/\n{4,}/g, '\n\n\n').trim();

    // 6. Assess quality
    const quality = this.assessQuality(processed);

    return { text: processed, quality };
  }

  /**
   * Remove lines that are mostly punctuation/symbols (OCR failure signature)
   */
  private static removeGarbageLines(text: string): string {
    return text.split('\n').filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true; // Keep empty lines for structure

      // Valid characters: Chinese + English letters + digits
      const validChars = (trimmed.match(/[a-zA-Z\u4e00-\u9fa5\d]/g) || []).length;
      const validRatio = validChars / trimmed.length;

      // If valid characters < 30% and line is not too short, it's garbage
      if (validRatio < 0.3 && trimmed.length > 5) {
        return false;
      }

      // Remove single character lines (likely OCR artifacts) except numbers
      if (trimmed.length <= 2 && !/^[\d]+[.、)]?$/.test(trimmed)) {
        return false;
      }

      return true;
    }).join('\n');
  }

  /**
   * Remove lines that appear too frequently (headers/footers)
   */
  private static removeRepeatedLines(text: string): string {
    const lines = text.split('\n');
    if (lines.length <= 10) return text;

    // Count line frequency
    const freq: Record<string, number> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 5 && trimmed.length <= 100) {
        freq[trimmed] = (freq[trimmed] || 0) + 1;
      }
    }

    // Remove lines appearing more than 3 times
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      return !freq[trimmed] || freq[trimmed] <= 3;
    });

    // Only apply if we didn't remove too much
    if (filtered.length >= lines.length * 0.9) {
      return filtered.join('\n');
    }
    return text;
  }

  /**
   * Assess text quality
   */
  private static assessQuality(text: string): QualityResult {
    const issues: string[] = [];
    let score = 100;

    if (!text || text.length < 50) {
      return { score: 0, issues: ['too_short'], shouldIndex: false };
    }

    const noSpace = text.replace(/\s/g, '');

    // 1. Valid character ratio (Chinese + English)
    const validChars = (text.match(/[a-zA-Z\u4e00-\u9fa5]/g) || []).length;
    const validRatio = validChars / Math.max(1, noSpace.length);
    if (validRatio < 0.4) {
      score -= 40;
      issues.push(`low_valid_ratio:${(validRatio * 100).toFixed(0)}%`);
    }

    // 2. Punctuation ratio
    const punct = (text.match(/[，。、；：""''！？…—,.;:!?"'\-\(\)\[\]]/g) || []).length;
    const punctRatio = punct / text.length;
    if (punctRatio > 0.25) {
      score -= 30;
      issues.push(`high_punct:${(punctRatio * 100).toFixed(0)}%`);
    }

    // 3. Consecutive punctuation (strong OCR failure indicator)
    if (/[，。、；：,.;:]{4,}/.test(text)) {
      score -= 30;
      issues.push('consecutive_punct');
    }

    // 4. Average line length
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 5) {
      const avgLineLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
      if (avgLineLen < 15) {
        score -= 20;
        issues.push(`short_lines:avg${avgLineLen.toFixed(0)}`);
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      shouldIndex: score >= 30 && text.length >= 50
    };
  }
}

// ============== Semantic Text Chunker ==============

export class TextChunker {
  private options: ChunkerOptions;

  constructor(options: Partial<ChunkerOptions> = {}) {
    this.options = {
      maxChunkSize: options.maxChunkSize || 500,
      minChunkSize: options.minChunkSize || 50,
      overlapSentences: options.overlapSentences || 1,
      skipReferences: options.skipReferences ?? true,
      qualityThreshold: options.qualityThreshold || 30
    };
  }

  /**
   * Main entry: chunk text with preprocessing
   */
  chunk(text: string): string[] {
    const startTime = Date.now();
    ztoolkit.log(`[TextChunker] Starting: input length=${text?.length || 0}`);

    if (!text || text.trim().length < this.options.minChunkSize) {
      ztoolkit.log(`[TextChunker] Text too short, returning empty`);
      return [];
    }

    // 1. Preprocess and quality check
    const { text: cleanText, quality } = TextQualityPreprocessor.process(text);

    if (!quality.shouldIndex) {
      ztoolkit.log(`[TextChunker] Quality too low (${quality.score}), skipping: ${quality.issues.join(', ')}`);
      return [];
    }

    if (quality.score < 60) {
      ztoolkit.log(`[TextChunker] Low quality warning: ${quality.score}, issues: ${quality.issues.join(', ')}`);
    }

    // 2. Detect document structure
    const structure = this.detectStructure(cleanText);
    ztoolkit.log(`[TextChunker] Structure: abstract=${structure.hasAbstract}, sections=${structure.sections.length}, refs=${structure.referencesStart !== null}`);

    // 3. Split into semantic units
    const units = this.splitByStructure(cleanText, structure);
    ztoolkit.log(`[TextChunker] Semantic units: ${units.length}`);

    // 4. Balance chunk sizes
    const chunks = this.balanceChunks(units);

    // 5. Extract text only
    const result = chunks
      .filter(c => c.quality >= this.options.qualityThreshold)
      .map(c => c.text);

    const elapsed = Date.now() - startTime;
    const avgSize = result.length > 0
      ? Math.round(result.reduce((a, c) => a + c.length, 0) / result.length)
      : 0;
    ztoolkit.log(`[TextChunker] Done: ${result.length} chunks, avg size=${avgSize}, time=${elapsed}ms`);

    return result;
  }

  /**
   * Chunk with full metadata
   */
  chunkWithMetadata(text: string): SemanticChunk[] {
    if (!text || text.trim().length < this.options.minChunkSize) {
      return [];
    }

    const { text: cleanText, quality } = TextQualityPreprocessor.process(text);
    if (!quality.shouldIndex) return [];

    const structure = this.detectStructure(cleanText);
    const units = this.splitByStructure(cleanText, structure);
    return this.balanceChunks(units);
  }

  /**
   * Legacy interface: chunk with positions
   */
  chunkWithPositions(text: string): TextChunk[] {
    const chunks = this.chunk(text);
    const result: TextChunk[] = [];
    let searchStart = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const startPos = text.indexOf(chunkText.substring(0, Math.min(50, chunkText.length)), searchStart);
      const endPos = startPos >= 0 ? startPos + chunkText.length : searchStart + chunkText.length;

      result.push({
        id: i,
        text: chunkText,
        startPos: startPos >= 0 ? startPos : searchStart,
        endPos
      });

      searchStart = startPos >= 0 ? startPos + 1 : searchStart + 1;
    }

    return result;
  }

  /**
   * Detect document structure (abstract, sections, references)
   */
  private detectStructure(text: string): DocumentStructure {
    const structure: DocumentStructure = {
      hasAbstract: false,
      hasKeywords: false,
      sections: [],
      referencesStart: null
    };

    // Detect abstract (Chinese and English)
    const abstractPatterns = [
      /^(摘\s*要|Abstract|ABSTRACT)[：:\s]*\n?([\s\S]*?)(?=\n\s*\n|关键词|Keywords|Key\s*words|1\s*[\.、]|一[、．.]|Introduction|引言)/im,
      /(摘\s*要|Abstract)[：:\s]*([\s\S]{50,800}?)(?=\n\s*\n)/im
    ];

    for (const pattern of abstractPatterns) {
      const match = text.match(pattern);
      if (match) {
        structure.hasAbstract = true;
        structure.abstractStart = match.index!;
        structure.abstractEnd = match.index! + match[0].length;
        break;
      }
    }

    // Detect keywords
    const keywordsMatch = text.match(
      /^(关键词|Keywords|Key\s*words)[：:\s]*([\s\S]*?)(?=\n\s*\n|\n[一二三四五1-9])/im
    );
    if (keywordsMatch) {
      structure.hasKeywords = true;
      structure.keywordsStart = keywordsMatch.index!;
      structure.keywordsEnd = keywordsMatch.index! + keywordsMatch[0].length;
    }

    // Detect section headers (Chinese numbered, Arabic numbered, Markdown)
    const sectionPatterns: Array<{ pattern: RegExp; levelFn: (m: string) => number }> = [
      {
        pattern: /^([一二三四五六七八九十]+)[、.．]\s*(.{2,50})$/gm,
        levelFn: () => 1
      },
      {
        pattern: /^(\d+)[\.．]\s*(.{2,50})$/gm,
        levelFn: (m) => m.length === 1 ? 1 : 2
      },
      {
        pattern: /^(\d+\.\d+)[\.．]?\s*(.{2,50})$/gm,
        levelFn: () => 2
      },
      {
        pattern: /^(#{1,3})\s*(.{2,50})$/gm,
        levelFn: (m) => m.length
      },
    ];

    for (const { pattern, levelFn } of sectionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        structure.sections.push({
          level: levelFn(match[1]),
          title: (match[2] || match[0]).trim(),
          position: match.index
        });
      }
    }

    // Sort sections by position
    structure.sections.sort((a, b) => a.position - b.position);

    // Detect references section
    const refPatterns = [
      /^(参考文献|References|Bibliography|REFERENCES)\s*$/im,
      /\n(参考文献|References)\s*\n/i
    ];
    for (const pattern of refPatterns) {
      const match = text.match(pattern);
      if (match) {
        structure.referencesStart = match.index!;
        break;
      }
    }

    return structure;
  }

  /**
   * Split text by document structure into semantic units
   */
  private splitByStructure(text: string, structure: DocumentStructure): SemanticChunk[] {
    const units: SemanticChunk[] = [];
    let processedEnd = 0;

    // 1. Abstract as high-importance unit
    if (structure.hasAbstract && structure.abstractEnd) {
      const abstractText = text.substring(structure.abstractStart || 0, structure.abstractEnd).trim();
      if (abstractText.length >= this.options.minChunkSize) {
        units.push({
          text: abstractText,
          type: 'abstract',
          importance: 'high',
          quality: 100
        });
        processedEnd = Math.max(processedEnd, structure.abstractEnd);
      }
    }

    // 2. Keywords (optional, often useful for search)
    if (structure.hasKeywords && structure.keywordsEnd) {
      const keywordsText = text.substring(structure.keywordsStart!, structure.keywordsEnd).trim();
      if (keywordsText.length >= 20) {
        units.push({
          text: keywordsText,
          type: 'keywords',
          importance: 'normal',
          quality: 100
        });
        processedEnd = Math.max(processedEnd, structure.keywordsEnd);
      }
    }

    // 3. Body content - by sections or paragraphs
    const bodyStart = processedEnd;
    const bodyEnd = structure.referencesStart || text.length;

    if (structure.sections.length > 0) {
      // Has section structure
      const bodySections = structure.sections.filter(
        s => s.position >= bodyStart && s.position < bodyEnd
      );

      for (let i = 0; i < bodySections.length; i++) {
        const section = bodySections[i];
        const nextPos = bodySections[i + 1]?.position || bodyEnd;
        const sectionText = text.substring(section.position, nextPos).trim();

        if (sectionText.length >= this.options.minChunkSize) {
          units.push({
            text: sectionText,
            type: 'section',
            title: section.title,
            importance: 'normal',
            quality: 90
          });
        }
      }

      // Content before first section
      if (bodySections.length > 0 && bodySections[0].position > bodyStart) {
        const preText = text.substring(bodyStart, bodySections[0].position).trim();
        if (preText.length >= this.options.minChunkSize) {
          units.push({
            text: preText,
            type: 'paragraph',
            importance: 'normal',
            quality: 80
          });
        }
      }
    } else {
      // No section structure, split by paragraphs
      const bodyText = text.substring(bodyStart, bodyEnd);
      const paragraphs = bodyText.split(/\n\s*\n+/);

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (trimmed.length >= this.options.minChunkSize) {
          units.push({
            text: trimmed,
            type: 'paragraph',
            importance: 'normal',
            quality: 80
          });
        }
      }
    }

    // 4. References (low importance, optionally skip)
    if (structure.referencesStart && !this.options.skipReferences) {
      const refText = text.substring(structure.referencesStart).trim();
      if (refText.length >= this.options.minChunkSize) {
        units.push({
          text: refText,
          type: 'references',
          importance: 'low',
          quality: 60
        });
      }
    }

    return units;
  }

  /**
   * Balance chunk sizes: merge small, split large
   */
  private balanceChunks(units: SemanticChunk[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];

    for (const unit of units) {
      if (unit.text.length <= this.options.maxChunkSize) {
        // Size OK, keep as is
        chunks.push(unit);
      } else {
        // Too large, split by sentences
        const subChunks = this.splitBySentences(unit);
        chunks.push(...subChunks);
      }
    }

    // Merge consecutive small chunks of same type
    const merged: SemanticChunk[] = [];
    let buffer: SemanticChunk | null = null;

    for (const chunk of chunks) {
      if (!buffer) {
        buffer = chunk;
        continue;
      }

      // Try to merge if same type and combined size is OK
      const canMerge = buffer.type === chunk.type
        && buffer.importance === chunk.importance
        && buffer.text.length + chunk.text.length + 2 <= this.options.maxChunkSize;

      if (canMerge) {
        buffer = {
          ...buffer,
          text: buffer.text + '\n\n' + chunk.text,
          quality: Math.min(buffer.quality, chunk.quality)
        };
      } else {
        if (buffer.text.length >= this.options.minChunkSize) {
          merged.push(buffer);
        }
        buffer = chunk;
      }
    }

    if (buffer && buffer.text.length >= this.options.minChunkSize) {
      merged.push(buffer);
    }

    return merged;
  }

  /**
   * Split unit by sentences with overlap
   */
  private splitBySentences(unit: SemanticChunk): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const sentences = this.extractSentences(unit.text);

    if (sentences.length === 0) {
      // Fallback: force split by characters
      return this.forceSplitByChars(unit);
    }

    let currentSentences: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (currentLength + sentence.length > this.options.maxChunkSize && currentSentences.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentSentences.join(' '),
          type: unit.type,
          title: unit.title,
          importance: unit.importance,
          quality: unit.quality
        });

        // Overlap: keep last N sentences
        const overlap = currentSentences.slice(-this.options.overlapSentences);
        currentSentences = [...overlap];
        currentLength = overlap.reduce((s, sent) => s + sent.length + 1, 0);
      }

      currentSentences.push(sentence);
      currentLength += sentence.length + 1;
    }

    // Last chunk
    if (currentSentences.length > 0 && currentLength >= this.options.minChunkSize) {
      chunks.push({
        text: currentSentences.join(' '),
        type: unit.type,
        title: unit.title,
        importance: unit.importance,
        quality: unit.quality
      });
    }

    return chunks;
  }

  /**
   * Extract sentences (Chinese and English)
   */
  private extractSentences(text: string): string[] {
    // Split by sentence-ending punctuation
    const sentences = text
      .split(/(?<=[。！？.!?;；])\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // If no sentences found (no punctuation), split by newlines
    if (sentences.length <= 1 && text.length > this.options.maxChunkSize) {
      return text
        .split(/\n+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    return sentences;
  }

  /**
   * Force split by characters when sentence split fails
   */
  private forceSplitByChars(unit: SemanticChunk): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const text = unit.text;
    const { maxChunkSize } = this.options;
    const overlap = 50;

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxChunkSize, text.length);

      // Try to find a good break point
      if (end < text.length) {
        const breakChars = [' ', '，', ',', '。', '.', '、', ';', '；', '\n'];
        for (let i = end - 1; i >= start + maxChunkSize - 100 && i >= start; i--) {
          if (breakChars.includes(text[i])) {
            end = i + 1;
            break;
          }
        }
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length >= this.options.minChunkSize) {
        chunks.push({
          text: chunkText,
          type: unit.type,
          title: unit.title,
          importance: unit.importance,
          quality: unit.quality - 10 // Lower quality for force-split
        });
      }

      start = end - overlap;
      if (start >= text.length - overlap) break;
    }

    return chunks;
  }

  /**
   * Estimate token count
   */
  estimateTokens(text: string): number {
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars * 1.5 + otherChars / 4);
  }

  /**
   * Detect primary language
   */
  detectLanguage(text: string): 'zh' | 'en' {
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && chineseChars / totalChars > 0.3 ? 'zh' : 'en';
  }
}

// ============== Singleton Factory ==============

let chunkerInstance: TextChunker | null = null;

export function getTextChunker(options?: Partial<ChunkerOptions>): TextChunker {
  if (!chunkerInstance || options) {
    chunkerInstance = new TextChunker(options);
  }
  return chunkerInstance;
}

export function resetTextChunker(): void {
  chunkerInstance = null;
}
