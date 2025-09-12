/**
 * Text Formatting Utilities for Zotero MCP Plugin
 * Handles conversion from HTML to well-formatted plain text while preserving structure
 */

declare let ztoolkit: ZToolkit;

export interface FormattingOptions {
  preserveParagraphs?: boolean;
  preserveHeadings?: boolean;
  preserveLists?: boolean;
  preserveEmphasis?: boolean;
  convertToMarkdown?: boolean;
  maxLineLength?: number;
  indentSize?: number;
}

export class TextFormatter {
  private static readonly DEFAULT_OPTIONS: FormattingOptions = {
    preserveParagraphs: true,
    preserveHeadings: true,
    preserveLists: true,
    preserveEmphasis: false,
    convertToMarkdown: false,
    maxLineLength: 0, // 0 means no line wrapping
    indentSize: 2
  };

  /**
   * Convert HTML to well-formatted plain text
   */
  static htmlToText(html: string, options: FormattingOptions = {}): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    try {
      let text = html;

      if (opts.convertToMarkdown) {
        text = this.htmlToMarkdown(text, opts);
      } else {
        text = this.htmlToPlainText(text, opts);
      }

      // Final cleanup and formatting
      text = this.cleanupWhitespace(text);
      
      if (opts.maxLineLength && opts.maxLineLength > 0) {
        text = this.wrapLines(text, opts.maxLineLength);
      }

      return text;
    } catch (error) {
      ztoolkit.log(`[TextFormatter] Error formatting text: ${error}`, 'error');
      // Fallback to simple tag removal
      return html.replace(/<[^>]*>/g, '').trim();
    }
  }

  /**
   * Convert HTML to Markdown format
   */
  private static htmlToMarkdown(html: string, options: FormattingOptions): string {
    let text = html;

    // Headers
    if (options.preserveHeadings) {
      text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, content) => {
        const hashes = '#'.repeat(parseInt(level));
        const cleanContent = this.stripTags(content).trim();
        return `\n\n${hashes} ${cleanContent}\n\n`;
      });
    }

    // Bold and emphasis
    if (options.preserveEmphasis) {
      text = text.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
      text = text.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*');
    }

    // Lists
    if (options.preserveLists) {
      // Ordered lists
      text = text.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
        let counter = 1;
        const listContent = content.replace(/<li[^>]*>(.*?)<\/li>/gi, (liMatch: string, liContent: string) => {
          const cleanContent = this.stripTags(liContent).trim();
          return `${counter++}. ${cleanContent}\n`;
        });
        return `\n${listContent}\n`;
      });

      // Unordered lists
      text = text.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
        const listContent = content.replace(/<li[^>]*>(.*?)<\/li>/gi, (liMatch: string, liContent: string) => {
          const cleanContent = this.stripTags(liContent).trim();
          return `• ${cleanContent}\n`;
        });
        return `\n${listContent}\n`;
      });
    }

    // Paragraphs and line breaks
    if (options.preserveParagraphs) {
      text = text.replace(/<\/p>/gi, '\n\n');
      text = text.replace(/<p[^>]*>/gi, '');
    }

    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Block elements
    text = text.replace(/<\/(div|section|article|header|footer|nav|blockquote)>/gi, '\n\n');
    text = text.replace(/<(div|section|article|header|footer|nav|blockquote)[^>]*>/gi, '');

    // Remove remaining HTML tags
    text = this.stripTags(text);

    return text;
  }

  /**
   * Convert HTML to plain text with preserved structure
   */
  private static htmlToPlainText(html: string, options: FormattingOptions): string {
    let text = html;

    // Headers - convert to emphasized text
    if (options.preserveHeadings) {
      text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, content) => {
        const cleanContent = this.stripTags(content).trim();
        const indent = '='.repeat(Math.max(1, 7 - parseInt(level)));
        return `\n\n${indent} ${cleanContent.toUpperCase()} ${indent}\n\n`;
      });
    }

    // Lists with proper indentation
    if (options.preserveLists) {
      // Ordered lists
      text = text.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
        let counter = 1;
        const listContent = content.replace(/<li[^>]*>(.*?)<\/li>/gi, (liMatch: string, liContent: string) => {
          const cleanContent = this.stripTags(liContent).trim();
          const indent = ' '.repeat(options.indentSize || 2);
          return `\n${indent}${counter++}. ${cleanContent}`;
        });
        return `\n${listContent}\n\n`;
      });

      // Unordered lists
      text = text.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
        const listContent = content.replace(/<li[^>]*>(.*?)<\/li>/gi, (liMatch: string, liContent: string) => {
          const cleanContent = this.stripTags(liContent).trim();
          const indent = ' '.repeat(options.indentSize || 2);
          return `\n${indent}• ${cleanContent}`;
        });
        return `\n${listContent}\n\n`;
      });
    }

    // Paragraphs with proper spacing
    if (options.preserveParagraphs) {
      text = text.replace(/<\/p>/gi, '\n\n');
      text = text.replace(/<p[^>]*>/gi, '');
    }

    // Line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Block elements with separation
    text = text.replace(/<\/(div|section|article|header|footer|nav)>/gi, '\n\n');
    text = text.replace(/<(div|section|article|header|footer|nav)[^>]*>/gi, '');

    // Blockquotes with indentation
    text = text.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
      const cleanContent = this.stripTags(content).trim();
      const indent = ' '.repeat(options.indentSize || 2);
      const indentedText = cleanContent.split('\n').map(line => 
        line.trim() ? `${indent}> ${line.trim()}` : ''
      ).join('\n');
      return `\n\n${indentedText}\n\n`;
    });

    // Remove remaining HTML tags
    text = this.stripTags(text);

    return text;
  }

  /**
   * Clean up whitespace while preserving intentional formatting
   */
  private static cleanupWhitespace(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      
      // Remove excessive blank lines (more than 2)
      .replace(/\n{4,}/g, '\n\n\n')
      
      // Clean up spaces but preserve intentional indentation
      .replace(/[ \t]+$/gm, '')  // Remove trailing spaces
      .replace(/^[ \t]+(?=[^ \t>•\d])/gm, '') // Remove leading spaces except for lists/quotes
      .replace(/[ \t]{3,}/g, '  ') // Normalize multiple spaces to max 2
      
      // Clean up around punctuation
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/([,.!?;:])\s{2,}/g, '$1 ')
      
      .trim();
  }

  /**
   * Wrap long lines while preserving structure
   */
  private static wrapLines(text: string, maxLength: number): string {
    return text.split('\n').map(line => {
      if (line.length <= maxLength) return line;
      
      // Don't wrap lines that look like headers, lists, or quotes
      if (/^[=\-#•>\d.]|\s+[•>\d]/.test(line)) return line;
      
      const words = line.split(' ');
      const wrappedLines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxLength) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      
      if (currentLine) wrappedLines.push(currentLine);
      return wrappedLines.join('\n');
    }).join('\n');
  }

  /**
   * Remove HTML tags while preserving content
   */
  private static stripTags(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Format raw PDF text by fixing common PDF extraction issues
   */
  static formatPDFText(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') {
      return '';
    }

    try {
      let text = rawText;

      // Fix line breaks that split words
      text = text.replace(/(\w)-\n(\w)/g, '$1$2'); // hyphenated words across lines
      text = text.replace(/(\w)\n(\w)/g, '$1 $2'); // words broken across lines

      // Normalize spaces and tabs
      text = text.replace(/\t/g, ' '); // tabs to spaces
      text = text.replace(/ {3,}/g, '  '); // multiple spaces to double space
      
      // Fix paragraph detection
      // Single newlines become spaces, double newlines become paragraph breaks
      text = text.replace(/\n\n+/g, '¶¶'); // temporarily mark real paragraph breaks
      text = text.replace(/\n/g, ' '); // single newlines become spaces
      text = text.replace(/¶¶/g, '\n\n'); // restore paragraph breaks
      
      // Clean up common PDF artifacts
      text = text.replace(/\f/g, '\n\n'); // form feeds to paragraph breaks
      text = text.replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' '); // various unicode spaces
      
      // Remove repeated headers/footers (simple heuristic)
      const lines = text.split('\n');
      if (lines.length > 10) {
        // Look for lines that repeat frequently (likely headers/footers)
        const lineFreq: { [key: string]: number } = {};
        lines.forEach(line => {
          const cleanLine = line.trim();
          if (cleanLine.length > 5 && cleanLine.length < 100) {
            lineFreq[cleanLine] = (lineFreq[cleanLine] || 0) + 1;
          }
        });

        // Remove lines that appear more than 3 times (likely headers/footers)
        const filteredLines = lines.filter(line => {
          const cleanLine = line.trim();
          return !lineFreq[cleanLine] || lineFreq[cleanLine] <= 3;
        });
        
        if (filteredLines.length < lines.length * 0.9) { // Only if we removed less than 10%
          text = filteredLines.join('\n');
        }
      }

      // Final cleanup
      text = this.cleanupWhitespace(text);

      return text;
    } catch (error) {
      ztoolkit.log(`[TextFormatter] Error formatting PDF text: ${error}`, 'error');
      return rawText.trim();
    }
  }

  /**
   * Smart truncation that preserves paragraph boundaries
   */
  static smartTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    // Try to cut at paragraph boundary
    const paragraphs = text.split('\n\n');
    let result = '';
    
    for (const paragraph of paragraphs) {
      if (result.length + paragraph.length + 2 <= maxLength) {
        result += (result ? '\n\n' : '') + paragraph;
      } else {
        // If we can't fit the whole paragraph, try to cut at sentence boundary
        if (result.length < maxLength * 0.8) {
          const sentences = paragraph.split(/[.!?]+\s/);
          for (const sentence of sentences) {
            if (result.length + sentence.length + 2 <= maxLength) {
              result += (result ? '\n\n' : '') + sentence + '.';
            } else {
              break;
            }
          }
        }
        break;
      }
    }
    
    // If still too long, cut at word boundary
    if (result.length > maxLength) {
      const words = result.split(' ');
      result = '';
      for (const word of words) {
        if (result.length + word.length + 1 <= maxLength) {
          result += (result ? ' ' : '') + word;
        } else {
          break;
        }
      }
    }
    
    return result.trim();
  }
}