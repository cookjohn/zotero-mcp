/**
 * Unified Content Extractor for Zotero MCP Plugin
 * 
 * This replaces the overlapping functionality of:
 * - get_item_pdf_content
 * - get_item_fulltext  
 * - get_attachment_content
 */

import { PDFProcessor } from "./pdfProcessor";

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
  };
}

export class UnifiedContentExtractor {

  /**
   * Extract content from an item (replaces get_item_fulltext + get_item_pdf_content)
   */
  async getItemContent(itemKey: string, include: ContentIncludeOptions = {}): Promise<ContentResult> {
    try {
      const item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);
      if (!item) {
        throw new Error(`Item with key ${itemKey} not found`);
      }

      ztoolkit.log(`[UnifiedContentExtractor] Getting content for item ${itemKey}`);

      // Default include all content types
      const options = {
        pdf: true,
        attachments: true,
        notes: true,
        abstract: true,
        webpage: false,
        ...include
      };

      const result: ContentResult = {
        itemKey,
        title: item.getDisplayTitle(),
        content: {},
        metadata: {
          extractedAt: new Date().toISOString(),
          sources: [],
          totalLength: 0
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

      // Extract attachments (PDF and others)
      if (options.pdf || options.attachments) {
        const attachments = await this.extractAttachments(item, options);
        if (attachments.length > 0) {
          result.content.attachments = attachments;
          result.metadata.sources.push('attachments');
          result.metadata.totalLength += attachments.reduce((sum: number, att: any) => sum + att.length, 0);
        }
      }

      // Extract notes
      if (options.notes) {
        const notes = this.extractNotes(item);
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
   * Extract content from a specific attachment (replaces get_attachment_content)
   */
  async getAttachmentContent(attachmentKey: string): Promise<any> {
    try {
      const attachment = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, attachmentKey);
      if (!attachment?.isAttachment()) {
        throw new Error(`Attachment with key ${attachmentKey} not found`);
      }

      ztoolkit.log(`[UnifiedContentExtractor] Processing attachment: ${attachmentKey}`);

      return await this.processAttachment(attachment);

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
   * Extract content from all attachments
   */
  private async extractAttachments(item: any, options: ContentIncludeOptions): Promise<any[]> {
    const attachments = [];
    const attachmentIDs = item.getAttachments();

    for (const attachmentID of attachmentIDs) {
      try {
        const attachment = Zotero.Items.get(attachmentID);
        const contentType = attachment.attachmentContentType;

        // Filter by type based on options
        const isPDF = this.isPDF(attachment, contentType);
        if (isPDF && !options.pdf) continue;
        if (!isPDF && !options.attachments) continue;

        const attachmentContent = await this.processAttachment(attachment);
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
   * Extract notes content
   */
  private extractNotes(item: any): any[] {
    const notes = [];
    const noteIDs = item.getNotes();

    for (const noteID of noteIDs) {
      try {
        const note = Zotero.Items.get(noteID);
        const noteContent = this.extractNoteContent(note);
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
   * Extract single note content
   */
  private extractNoteContent(note: any): any {
    try {
      if (!note || !note.isNote()) {
        return null;
      }

      const noteText = note.getNote();
      if (!noteText || noteText.trim().length === 0) {
        return null;
      }

      // Strip HTML tags for plain text
      const plainText = noteText.replace(/<[^>]*>/g, '').trim();

      return {
        noteKey: note.key,
        title: note.getNoteTitle() || 'Untitled Note',
        content: plainText,
        htmlContent: noteText,
        length: plainText.length,
        dateModified: note.dateModified,
        type: 'note'
      };
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
   * Process a single attachment (unified logic)
   */
  private async processAttachment(attachment: any): Promise<any> {
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

      return {
        attachmentKey: attachment.key,
        filename,
        filePath,
        contentType,
        type: this.categorizeAttachmentType(contentType),
        content: content.trim(),
        length: content.length,
        extractionMethod,
        extractedAt: new Date().toISOString()
      };

    } catch (error) {
      ztoolkit.log(`[UnifiedContentExtractor] Error processing attachment ${attachment.key}: ${error}`, "error");
      return null;
    }
  }

  /**
   * Extract text from PDF using PDFProcessor
   */
  private async extractPDFText(filePath: string): Promise<string> {
    const processor = new PDFProcessor(ztoolkit);
    try {
      return await processor.extractText(filePath);
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
      return htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
}