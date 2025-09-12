/**
 * Unified Content Extractor for Zotero MCP Plugin
 * 
 * This replaces the overlapping functionality of:
 * - get_item_pdf_content
 * - get_item_fulltext  
 * - get_attachment_content
 */

import { PDFProcessor } from "./pdfProcessor";
import { MCPSettingsService } from "./mcpSettingsService";
import { IntelligentContentProcessor, ContentControl, ProcessingResult } from "./intelligentContentProcessor";
import { TextFormatter } from "./textFormatter";

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export interface ContentIncludeOptions {
  pdf?: boolean;
  attachments?: boolean;
  notes?: boolean;
  abstract?: boolean;
  webpage?: boolean;
}

export interface ContentResult {
  itemKey?: string;
  attachmentKey?: string;
  title?: string;
  content: any;
  metadata: {
    extractedAt: string;
    sources: string[];
    totalLength: number;
    mode?: string;
    appliedLimits?: {
      maxContentLength?: number;
      maxAttachments?: number;
      maxNotes?: number;
      truncated?: boolean;
    };
    intelligentProcessing?: {
      enabled: boolean;
      processingMethod: string;
      preservationRatio: number;
      averageImportance: number;
      expansionTriggered: boolean;
    };
  };
}

export class UnifiedContentExtractor {

  private intelligentProcessor = new IntelligentContentProcessor();

  /**
   * Extract content from an item with mode control and intelligent processing
   */
  async getItemContent(itemKey: string, include: ContentIncludeOptions = {}, mode?: string, contentControl?: ContentControl): Promise<ContentResult> {
    try {
      const item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);
      if (!item) {
        throw new Error(`Item with key ${itemKey} not found`);
      }

      ztoolkit.log(`[UnifiedContentExtractor] Getting content for item ${itemKey}`);

      // Get effective mode and settings
      const effectiveMode = mode || MCPSettingsService.get('content.mode');
      const modeConfig = this.getModeConfiguration(effectiveMode);
      
      ztoolkit.log(`[UnifiedContentExtractor] Using output mode: ${effectiveMode}`);

      // Default include all content types, but apply mode-based filtering
      const options = {
        pdf: true,
        attachments: true,
        notes: true,
        abstract: true,
        webpage: modeConfig.includeWebpage,
        ...include
      };

      const result: ContentResult = {
        itemKey,
        title: item.getDisplayTitle(),
        content: {},
        metadata: {
          extractedAt: new Date().toISOString(),
          sources: [],
          totalLength: 0,
          mode: effectiveMode,
          appliedLimits: {
            maxContentLength: modeConfig.maxContentLength,
            maxAttachments: modeConfig.maxAttachments,
            maxNotes: modeConfig.maxNotes,
            truncated: false
          }
        }
      };

      // Extract abstract
      if (options.abstract) {
        const abstract = this.extractAbstract(item);
        if (abstract) {
          result.content.abstract = {
            content: abstract,
            length: abstract.length,
            type: 'abstract'
          };
          result.metadata.sources.push('abstract');
          result.metadata.totalLength += abstract.length;
        }
      }

      // Extract attachments (PDF and others) with intelligent processing
      if (options.pdf || options.attachments) {
        const attachments = await this.extractAttachments(item, options, modeConfig, effectiveMode, contentControl);
        if (attachments.length > 0) {
          result.content.attachments = attachments;
          result.metadata.sources.push('attachments');
          result.metadata.totalLength += attachments.reduce((sum: number, att: any) => sum + att.length, 0);
        }
      }

      // Extract notes with intelligent processing
      if (options.notes) {
        const notes = await this.extractNotes(item, modeConfig, effectiveMode, contentControl);
        if (notes.length > 0) {
          result.content.notes = notes;
          result.metadata.sources.push('notes');
          result.metadata.totalLength += notes.reduce((sum: number, note: any) => sum + note.length, 0);
        }
      }

      // Extract webpage snapshots
      if (options.webpage) {
        const webpage = await this.extractWebpageContent(item);
        if (webpage) {
          result.content.webpage = webpage;
          result.metadata.sources.push('webpage');
          result.metadata.totalLength += webpage.length;
        }
      }

      ztoolkit.log(`[UnifiedContentExtractor] Extracted ${result.metadata.totalLength} characters from ${result.metadata.sources.length} sources`);
      return result;

    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error in getItemContent: ${error}`, "error");
      throw error;
    }
  }

  /**
   * Extract content from a specific attachment with mode control (replaces get_attachment_content)
   */
  async getAttachmentContent(attachmentKey: string, mode?: string, contentControl?: ContentControl): Promise<any> {
    try {
      const attachment = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, attachmentKey);
      if (!attachment?.isAttachment()) {
        throw new Error(`Attachment with key ${attachmentKey} not found`);
      }

      ztoolkit.log(`[UnifiedContentExtractor] Processing attachment: ${attachmentKey}`);

      // Get effective mode and configuration
      const effectiveMode = mode || MCPSettingsService.get('content.mode');
      const modeConfig = this.getModeConfiguration(effectiveMode);

      return await this.processAttachment(attachment, modeConfig, effectiveMode, contentControl);

    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error in getAttachmentContent: ${error}`, "error");
      throw error;
    }
  }

  /**
   * Extract abstract from item
   */
  private extractAbstract(item: any): string | null {
    try {
      const abstract = item.getField('abstractNote');
      return abstract && abstract.trim().length > 0 ? abstract.trim() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract content from all attachments with intelligent processing
   */
  private async extractAttachments(item: any, options: ContentIncludeOptions, modeConfig: any, mode: string, contentControl?: ContentControl): Promise<any[]> {
    const attachments = [];
    const attachmentIDs = item.getAttachments();

    // Apply attachment limit based on mode
    const limitedAttachmentIDs = modeConfig.maxAttachments > 0 
      ? attachmentIDs.slice(0, modeConfig.maxAttachments)
      : attachmentIDs;

    for (const attachmentID of limitedAttachmentIDs) {
      try {
        const attachment = Zotero.Items.get(attachmentID);
        const contentType = attachment.attachmentContentType;

        // Filter by type based on options
        const isPDF = this.isPDF(attachment, contentType);
        if (isPDF && !options.pdf) continue;
        if (!isPDF && !options.attachments) continue;

        const attachmentContent = await this.processAttachment(attachment, modeConfig, mode, contentControl);
        if (attachmentContent && attachmentContent.content) {
          attachments.push(attachmentContent);
        }
      } catch (error) {
        ztoolkit.log(`[UnifiedContentExtractor] Error extracting attachment ${attachmentID}: ${error}`, "warn");
      }
    }

    return attachments;
  }

  /**
   * Extract notes content with intelligent processing
   */
  private async extractNotes(item: any, modeConfig: any, mode: string, contentControl?: ContentControl): Promise<any[]> {
    const notes = [];
    const noteIDs = item.getNotes();

    // Apply notes limit based on mode
    const limitedNoteIDs = modeConfig.maxNotes > 0 
      ? noteIDs.slice(0, modeConfig.maxNotes)
      : noteIDs;

    for (const noteID of limitedNoteIDs) {
      try {
        const note = Zotero.Items.get(noteID);
        const noteContent = await this.extractNoteContent(note, modeConfig, mode, contentControl);
        if (noteContent) {
          notes.push(noteContent);
        }
      } catch (error) {
        ztoolkit.log(`[UnifiedContentExtractor] Error extracting note ${noteID}: ${error}`, "warn");
      }
    }

    return notes;
  }

  /**
   * Extract single note content with intelligent processing
   */
  private async extractNoteContent(note: any, modeConfig: any, mode: string, contentControl?: ContentControl): Promise<any> {
    try {
      if (!note || !note.isNote()) {
        return null;
      }

      const noteText = note.getNote();
      if (!noteText || noteText.trim().length === 0) {
        return null;
      }

      // Convert HTML to well-formatted text using user settings
      const settings = MCPSettingsService.getEffectiveSettings();
      let plainText = TextFormatter.htmlToText(noteText, {
        preserveParagraphs: settings.preserveFormatting,
        preserveHeadings: settings.preserveHeadings,
        preserveLists: settings.preserveLists,
        preserveEmphasis: settings.preserveEmphasis
      });
      
      // Apply intelligent processing if content is long enough
      let processedResult: ProcessingResult | null = null;
      let finalContent = plainText;
      
      if (plainText.length > 200 && mode !== 'complete') { // Use intelligent processing for longer notes
        try {
          processedResult = await this.intelligentProcessor.processContent(plainText, mode, contentControl);
          finalContent = processedResult.processedText;
        } catch (error) {
          ztoolkit.log(`[UnifiedContentExtractor] Intelligent processing failed for note, falling back: ${error}`, "warn");
          // Fallback to simple truncation
          if (modeConfig.maxContentLength > 0 && plainText.length > modeConfig.maxContentLength) {
            finalContent = this.smartTruncate(plainText, modeConfig.maxContentLength);
          }
        }
      } else if (modeConfig.maxContentLength > 0 && plainText.length > modeConfig.maxContentLength) {
        // Simple truncation for short content or full mode
        finalContent = this.smartTruncate(plainText, modeConfig.maxContentLength);
      }

      const result = {
        noteKey: note.key,
        title: note.getNoteTitle() || 'Untitled Note',
        content: finalContent,
        htmlContent: noteText,
        length: finalContent.length,
        originalLength: plainText.length,
        truncated: finalContent.length < plainText.length,
        dateModified: note.dateModified,
        type: 'note'
      };

      // Add intelligent processing metadata if used
      if (processedResult) {
        (result as any).intelligentProcessing = {
          enabled: true,
          processingMethod: processedResult.metadata.processingMethod,
          preservationRatio: processedResult.metadata.preservationRatio,
          averageImportance: processedResult.metadata.averageImportance,
          selectedSentences: processedResult.metadata.selectedSentences,
          totalSentences: processedResult.metadata.totalSentences
        };
      }

      return result;
    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error extracting note content: ${error}`, "error");
      return null;
    }
  }

  /**
   * Extract webpage content from snapshots
   */
  private async extractWebpageContent(item: any): Promise<any> {
    try {
      const url = item.getField('url');
      if (!url) {
        return null;
      }

      // Look for HTML snapshots
      const attachmentIDs = item.getAttachments();
      for (const attachmentID of attachmentIDs) {
        const attachment = Zotero.Items.get(attachmentID);
        if (attachment.attachmentContentType && attachment.attachmentContentType.includes('html')) {
          const content = await this.extractHTMLText(attachment.getFilePath());
          if (content && content.length > 0) {
            return {
              url,
              filename: attachment.attachmentFilename,
              filePath: attachment.getFilePath(),
              content: content.trim(),
              length: content.length,
              type: 'webpage_snapshot',
              extractedAt: new Date().toISOString()
            };
          }
        }
      }

      return null;
    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error extracting webpage content: ${error}`, "error");
      return null;
    }
  }

  /**
   * Process a single attachment with intelligent processing (unified logic)
   */
  private async processAttachment(attachment: any, modeConfig: any, mode: string, contentControl?: ContentControl): Promise<any> {
    const filePath = attachment.getFilePath();
    const contentType = attachment.attachmentContentType;
    const filename = attachment.attachmentFilename;

    if (!filePath) {
      ztoolkit.log(`[UnifiedContentExtractor] No file path for attachment ${attachment.key}`, "warn");
      return null;
    }

    ztoolkit.log(`[UnifiedContentExtractor] Processing attachment: ${filename} (${contentType})`);

    let content = '';
    let extractionMethod = 'unknown';

    try {
      // Unified extraction logic based on file type
      if (this.isPDF(attachment, contentType)) {
        content = await this.extractPDFText(filePath);
        extractionMethod = 'pdf_processor';
      } else if (this.isHTML(contentType)) {
        content = await this.extractHTMLText(filePath);
        extractionMethod = 'html_parsing';
      } else if (this.isText(contentType)) {
        content = await this.extractPlainText(filePath);
        extractionMethod = 'text_reading';
      }

      if (!content || content.trim().length === 0) {
        return null;
      }

      // Apply intelligent processing if content is substantial
      let processedResult: ProcessingResult | null = null;
      let finalContent = content.trim();
      const originalLength = finalContent.length;
      
      if (finalContent.length > 500 && mode !== 'complete') { // Use intelligent processing for longer content
        try {
          processedResult = await this.intelligentProcessor.processContent(finalContent, mode, contentControl);
          finalContent = processedResult.processedText;
        } catch (error) {
          ztoolkit.log(`[UnifiedContentExtractor] Intelligent processing failed for attachment, falling back: ${error}`, "warn");
          // Fallback to simple truncation
          if (modeConfig.maxContentLength > 0 && finalContent.length > modeConfig.maxContentLength) {
            finalContent = this.smartTruncate(finalContent, modeConfig.maxContentLength);
          }
        }
      } else if (modeConfig.maxContentLength > 0 && finalContent.length > modeConfig.maxContentLength) {
        // Simple truncation for shorter content or full mode
        finalContent = this.smartTruncate(finalContent, modeConfig.maxContentLength);
      }

      const result = {
        attachmentKey: attachment.key,
        filename,
        filePath,
        contentType,
        type: this.categorizeAttachmentType(contentType),
        content: finalContent,
        length: finalContent.length,
        originalLength,
        truncated: finalContent.length < originalLength,
        extractionMethod,
        extractedAt: new Date().toISOString()
      };

      // Add intelligent processing metadata if used
      if (processedResult) {
        (result as any).intelligentProcessing = {
          enabled: true,
          processingMethod: processedResult.metadata.processingMethod,
          preservationRatio: processedResult.metadata.preservationRatio,
          averageImportance: processedResult.metadata.averageImportance,
          selectedSentences: processedResult.metadata.selectedSentences,
          totalSentences: processedResult.metadata.totalSentences
        };
      }

      return result;

    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error processing attachment ${attachment.key}: ${error}`, "error");
      return null;
    }
  }

  /**
   * Extract text from PDF using PDFProcessor with formatting
   */
  private async extractPDFText(filePath: string): Promise<string> {
    const processor = new PDFProcessor(ztoolkit);
    try {
      const rawText = await processor.extractText(filePath);
      // Apply PDF-specific text formatting
      return TextFormatter.formatPDFText(rawText);
    } finally {
      processor.terminate();
    }
  }

  /**
   * Extract text from HTML files
   */
  private async extractHTMLText(filePath: string): Promise<string> {
    try {
      if (!filePath) return '';
      
      const htmlContent = await Zotero.File.getContentsAsync(filePath);
      const settings = MCPSettingsService.getEffectiveSettings();
      return TextFormatter.htmlToText(htmlContent, {
        preserveParagraphs: settings.preserveFormatting,
        preserveHeadings: settings.preserveHeadings,
        preserveLists: settings.preserveLists,
        preserveEmphasis: settings.preserveEmphasis
      });
    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error reading HTML file ${filePath}: ${error}`, "error");
      return '';
    }
  }

  /**
   * Extract text from plain text files
   */
  private async extractPlainText(filePath: string): Promise<string> {
    try {
      if (!filePath) return '';
      
      return await Zotero.File.getContentsAsync(filePath);
    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error reading text file ${filePath}: ${error}`, "error");
      return '';
    }
  }

  /**
   * Check if attachment is a PDF
   */
  private isPDF(attachment: any, contentType: string): boolean {
    // Check MIME type
    if (contentType && contentType.includes('pdf')) {
      return true;
    }
    
    // Check file extension
    const filename = attachment.attachmentFilename || '';
    if (filename.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    
    // Check path extension
    const path = attachment.getFilePath() || '';
    if (path.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if attachment is HTML
   */
  private isHTML(contentType: string): boolean {
    return !!(contentType && (contentType.includes('html') || contentType.includes('xml')));
  }

  /**
   * Check if attachment is plain text
   */
  private isText(contentType: string): boolean {
    return !!(contentType && contentType.includes('text') && !contentType.includes('html'));
  }

  /**
   * Categorize attachment type
   */
  private categorizeAttachmentType(contentType: string): string {
    if (!contentType) return 'unknown';
    
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('text')) return 'text';
    if (contentType.includes('word') || contentType.includes('document')) return 'document';
    
    return 'other';
  }

  /**
   * Convert structured result to plain text format
   */
  convertToText(result: ContentResult): string {
    const textParts = [];

    if (result.content.abstract) {
      textParts.push(`ABSTRACT:\n${result.content.abstract.content}\n`);
    }

    if (result.content.attachments) {
      for (const att of result.content.attachments) {
        textParts.push(`ATTACHMENT (${att.filename || att.type}):\n${att.content}\n`);
      }
    }

    if (result.content.notes) {
      for (const note of result.content.notes) {
        textParts.push(`NOTE (${note.title}):\n${note.content}\n`);
      }
    }

    if (result.content.webpage) {
      textParts.push(`WEBPAGE:\n${result.content.webpage.content}\n`);
    }

    return textParts.join('\n---\n\n');
  }

  /**
   * Get mode-specific configuration
   */
  private getModeConfiguration(mode: string): any {
    const presets = MCPSettingsService.getEffectiveSettings();
    
    // Mode-specific configurations based on SmartAnnotationExtractor patterns
    const modeConfigs = {
      'minimal': {
        maxContentLength: 500,
        maxAttachments: 2,
        maxNotes: 3,
        includeWebpage: false,
        enableCompression: true
      },
      'preview': {
        maxContentLength: 1500,
        maxAttachments: 5,
        maxNotes: 8,
        includeWebpage: false,
        enableCompression: true
      },
      'standard': {
        maxContentLength: 3000,
        maxAttachments: 10,
        maxNotes: 15,
        includeWebpage: true,
        enableCompression: true
      },
      'complete': {
        maxContentLength: -1, // No limit
        maxAttachments: -1,   // No limit
        maxNotes: -1,         // No limit
        includeWebpage: true,
        enableCompression: false
      }
    };

    return modeConfigs[mode as keyof typeof modeConfigs] || modeConfigs['standard'];
  }

  /**
   * Smart truncation that preserves sentence boundaries and meaning
   */
  private smartTruncate(content: string, maxLength: number): string {
    if (!content || content.length <= maxLength) {
      return content;
    }

    // Try to cut at sentence boundaries
    const truncated = content.substring(0, maxLength);
    const lastSentence = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    // If we found a sentence boundary in the last 30% of the text, use it
    if (lastSentence > maxLength * 0.7) {
      return truncated.substring(0, lastSentence + 1);
    }
    
    // Otherwise, try to cut at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    // Fallback: hard truncate
    return truncated + '...';
  }
}