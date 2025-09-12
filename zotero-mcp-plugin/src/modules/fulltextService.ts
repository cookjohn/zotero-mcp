/**
 * Fulltext Service for Zotero MCP Plugin
 * Handles extraction and retrieval of full-text content from various sources
 */

declare let Zotero: any;
declare let ztoolkit: ZToolkit;

export class FulltextService {
  
  /**
   * Get comprehensive fulltext content for an item
   * @param itemKey - The item key
   * @returns Object containing all available text content
   */
  async getItemFulltext(itemKey: string): Promise<any> {
    try {
      const item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);
      if (!item) {
        throw new Error(`Item with key ${itemKey} not found`);
      }

      ztoolkit.log(`[FulltextService] Getting fulltext for item ${itemKey}`);

      const result = {
        itemKey,
        title: item.getDisplayTitle(),
        itemType: item.itemType,
        abstract: this.getItemAbstract(item),
        fulltext: {
          attachments: [] as any[],
          notes: [] as any[],
          webpage: null,
          total_length: 0
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          sources: [] as string[]
        }
      };

      // Get fulltext from attachments
      const attachments = item.getAttachments();
      for (const attachmentID of attachments) {
        try {
          const attachment = Zotero.Items.get(attachmentID);
          const attachmentText = await this.getAttachmentContent(attachment);
          if (attachmentText && attachmentText.content) {
            result.fulltext.attachments.push(attachmentText);
            result.fulltext.total_length += attachmentText.content.length;
            (result.metadata.sources as string[]).push(attachmentText.type);
          }
        } catch (error) {
          ztoolkit.log(`[FulltextService] Error extracting attachment ${attachmentID}: ${error}`, "warn");
        }
      }

      // Get notes content
      const notes = item.getNotes();
      for (const noteID of notes) {
        try {
          const note = Zotero.Items.get(noteID);
          const noteContent = this.getNoteContent(note);
          if (noteContent) {
            result.fulltext.notes.push(noteContent);
            result.fulltext.total_length += noteContent.content.length;
          }
        } catch (error) {
          ztoolkit.log(`[FulltextService] Error extracting note ${noteID}: ${error}`, "warn");
        }
      }

      // Get webpage snapshot if available
      const webpageContent = await this.getWebpageContent(item);
      if (webpageContent) {
        result.fulltext.webpage = webpageContent;
        result.fulltext.total_length += webpageContent.content.length;
        (result.metadata.sources as string[]).push('webpage');
      }

      ztoolkit.log(`[FulltextService] Extracted ${result.fulltext.total_length} characters from ${result.metadata.sources.length} sources`);

      return result;
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error in getItemFulltext: ${error}`, "error");
      throw error;
    }
  }

  /**
   * Get content from a specific attachment
   * @param attachment - Zotero attachment item
   * @returns Object with attachment content and metadata
   */
  async getAttachmentContent(attachment: any): Promise<any> {
    if (!attachment || !attachment.isAttachment()) {
      return null;
    }

    try {
      const attachmentType = attachment.attachmentContentType;
      const filename = attachment.attachmentFilename;
      const path = attachment.getFilePath();

      ztoolkit.log(`[FulltextService] Processing attachment: ${filename} (${attachmentType})`);

      let content = '';
      let extractionMethod = 'unknown';

      // Handle different attachment types
      if (this.isPDFAttachment(attachment, attachmentType)) {
        // Use PDFProcessor directly for PDF files
        try {
          const { PDFProcessor } = await import('./pdfProcessor');
          const { TextFormatter } = await import('./textFormatter');
          const processor = new PDFProcessor(ztoolkit);
          
          const filePath = attachment.getFilePath();
          if (filePath) {
            try {
              const rawText = await processor.extractText(filePath);
              content = TextFormatter.formatPDFText(rawText);
              extractionMethod = 'pdf_processor';
            } catch (fileError) {
              ztoolkit.log(`[FulltextService] PDF file not accessible at path: ${filePath} - ${fileError}`, "warn");
            } finally {
              processor.terminate();
            }
          } else {
            ztoolkit.log(`[FulltextService] No file path available for PDF attachment ${attachment.key}`, "warn");
          }
        } catch (pdfError) {
          ztoolkit.log(`[FulltextService] PDF extraction failed for ${attachment.key}: ${pdfError}`, "warn");
          content = '';
        }
      } else if (attachmentType && (
        attachmentType.includes('html') || 
        attachmentType.includes('text') ||
        attachmentType.includes('xml')
      )) {
        // Handle HTML/text files
        content = await this.extractTextFromFile(path, attachmentType);
        extractionMethod = 'file_reading';
      } else if (attachment.isWebAttachment()) {
        // Handle web attachments
        content = await this.extractWebAttachmentContent(attachment);
        extractionMethod = 'web_extraction';
      } else {
        // Try Zotero's built-in fulltext extraction
        const fulltextContent = await this.getZoteroFulltext(attachment);
        if (fulltextContent) {
          content = fulltextContent;
          extractionMethod = 'zotero_builtin';
        }
      }

      if (!content || content.trim().length === 0) {
        return null;
      }

      return {
        attachmentKey: attachment.key,
        filename,
        filePath: path || attachment.getFilePath(),
        contentType: attachmentType,
        type: this.categorizeAttachmentType(attachmentType),
        content: content.trim(),
        length: content.length,
        extractionMethod,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error extracting attachment content: ${error}`, "error");
      return null;
    }
  }

  /**
   * Get item abstract
   * @param item - Zotero item
   * @returns Abstract text or null
   */
  getItemAbstract(item: any): string | null {
    try {
      const abstract = item.getField('abstractNote');
      return abstract && abstract.trim().length > 0 ? abstract.trim() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get note content
   * @param note - Zotero note item
   * @returns Note content object
   */
  getNoteContent(note: any): any {
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
      ztoolkit.log(`[FulltextService] Error extracting note content: ${error}`, "error");
      return null;
    }
  }

  /**
   * Get webpage content from snapshots
   * @param item - Zotero item
   * @returns Webpage content or null
   */
  async getWebpageContent(item: any): Promise<any> {
    try {
      const url = item.getField('url');
      if (!url) {
        return null;
      }

      // Look for HTML snapshots
      const attachments = item.getAttachments();
      for (const attachmentID of attachments) {
        const attachment = Zotero.Items.get(attachmentID);
        if (attachment.attachmentContentType && attachment.attachmentContentType.includes('html')) {
          const content = await this.extractTextFromFile(attachment.getFilePath(), 'text/html');
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
      ztoolkit.log(`[FulltextService] Error extracting webpage content: ${error}`, "error");
      return null;
    }
  }

  /**
   * Search within fulltext content
   * @param query - Search query
   * @param options - Search options
   * @returns Search results with context
   */
  async searchFulltext(query: string, options: any = {}): Promise<any> {
    try {
      const {
        itemKeys = null,
        contextLength = 200,
        maxResults = 50,
        caseSensitive = false
      } = options;

      ztoolkit.log(`[FulltextService] Searching fulltext for: "${query}"`);

      const results = [];
      const searchRegex = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
        caseSensitive ? 'g' : 'gi'
      );

      // Get items to search
      let itemsToSearch;
      if (itemKeys && Array.isArray(itemKeys)) {
        itemsToSearch = itemKeys.map(key => 
          Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, key)
        ).filter(item => item);
      } else {
        // Search all items (limit for performance)
        const allItems = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
        itemsToSearch = allItems.slice(0, 1000); // Limit for performance
      }

      for (const item of itemsToSearch) {
        if (results.length >= maxResults) break;

        try {
          const fulltext = await this.getItemFulltext(item.key);
          const matches = [];

          // Search in different content types
          const searchSources = [
            { content: fulltext.abstract, type: 'abstract' },
            ...fulltext.fulltext.attachments.map((att: any) => ({ content: att.content, type: 'attachment', filename: att.filename })),
            ...fulltext.fulltext.notes.map((note: any) => ({ content: note.content, type: 'note', title: note.title }))
          ];

          if (fulltext.fulltext.webpage) {
            searchSources.push({ content: fulltext.fulltext.webpage.content, type: 'webpage' });
          }

          for (const source of searchSources) {
            if (!source.content) continue;

            const sourceMatches = [...source.content.matchAll(searchRegex)];
            for (const match of sourceMatches) {
              const startPos = Math.max(0, match.index - contextLength);
              const endPos = Math.min(source.content.length, match.index + match[0].length + contextLength);
              const context = source.content.substring(startPos, endPos);

              matches.push({
                type: source.type,
                filename: source.filename || source.title || null,
                match: match[0],
                context: context.trim(),
                position: match.index
              });
            }
          }

          if (matches.length > 0) {
            results.push({
              itemKey: item.key,
              title: item.getDisplayTitle(),
              itemType: item.itemType,
              totalMatches: matches.length,
              matches: matches.slice(0, 10), // Limit matches per item
              relevanceScore: matches.length
            });
          }
        } catch (error) {
          ztoolkit.log(`[FulltextService] Error searching item ${item.key}: ${error}`, "warn");
        }
      }

      // Sort by relevance
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        query,
        totalResults: results.length,
        results: results.slice(0, maxResults),
        searchOptions: options,
        searchedAt: new Date().toISOString()
      };
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error in searchFulltext: ${error}`, "error");
      throw error;
    }
  }

  /**
   * Extract text from file based on content type
   * @param filePath - Path to file
   * @param contentType - MIME content type
   * @returns Extracted text content
   */
  private async extractTextFromFile(filePath: string, contentType: string): Promise<string> {
    try {
      if (!filePath) {
        return '';
      }

      if (contentType.includes('html') || contentType.includes('xml')) {
        // Read HTML/XML and strip tags
        const htmlContent = await Zotero.File.getContentsAsync(filePath);
        return htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else if (contentType.includes('text')) {
        // Read plain text
        return await Zotero.File.getContentsAsync(filePath);
      }

      return '';
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error reading file ${filePath}: ${error}`, "error");
      return '';
    }
  }

  /**
   * Extract content from web attachments
   * @param attachment - Web attachment item
   * @returns Extracted content
   */
  private async extractWebAttachmentContent(attachment: any): Promise<string> {
    try {
      const url = attachment.getField('url');
      if (!url) return '';

      // Try to get cached web content or snapshot
      const filePath = attachment.getFilePath();
      if (filePath) {
        try {
          return await this.extractTextFromFile(filePath, 'text/html');
        } catch (error) {
          ztoolkit.log(`[FulltextService] Could not read web attachment file: ${filePath} - ${error}`, "warn");
        }
      }

      return '';
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error extracting web attachment: ${error}`, "error");
      return '';
    }
  }

  /**
   * Use Zotero's built-in fulltext extraction
   * @param attachment - Attachment item
   * @returns Fulltext content or null
   */
  private async getZoteroFulltext(attachment: any): Promise<string | null> {
    try {
      // Use Zotero's fulltext API if available
      if (Zotero.Fulltext && Zotero.Fulltext.getItemContent) {
        const content = await Zotero.Fulltext.getItemContent(attachment.id);
        return content && content.content ? content.content : null;
      }
      return null;
    } catch (error) {
      ztoolkit.log(`[FulltextService] Error using Zotero fulltext: ${error}`, "warn");
      return null;
    }
  }

  /**
   * Check if attachment is a PDF file
   * @param attachment - Attachment item
   * @param contentType - MIME content type
   * @returns True if attachment is PDF
   */
  private isPDFAttachment(attachment: any, contentType: string): boolean {
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
   * Categorize attachment type for better organization
   * @param contentType - MIME content type
   * @returns Category string
   */
  private categorizeAttachmentType(contentType: string): string {
    if (!contentType) return 'unknown';
    
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('text')) return 'text';
    if (contentType.includes('word') || contentType.includes('document')) return 'document';
    if (contentType.includes('image')) return 'image';
    if (contentType.includes('xml')) return 'xml';
    
    return 'other';
  }
}

export const fulltextService = new FulltextService();