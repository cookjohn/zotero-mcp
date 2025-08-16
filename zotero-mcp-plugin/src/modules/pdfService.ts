/**
 * pdfService.ts
 *
 * This service provides high-level functions for accessing PDF content.
 * It abstracts the details of finding attachments and using the PDFProcessor.
 */

import { PDFProcessor } from './pdfProcessor';

declare const Zotero: any;

export class PDFService {
  /**
   * Finds the first PDF attachment for a given Zotero item.
   * @param itemKey - The key of the Zotero item.
   * @returns The Zotero item object for the PDF attachment, or null if not found.
   */
  private async findPDFAttachment(itemKey: string): Promise<any | null> {
    const item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);
    if (!item) {
      return null;
    }

    const attachmentIDs = item.getAttachments();
    for (const id of attachmentIDs) {
      const attachment = Zotero.Items.get(id);
      if (attachment.attachmentContentType === 'application/pdf') {
        return attachment;
      }
    }

    return null;
  }

  /**
   * Retrieves the full text content of a PDF attachment for a given item.
   * @param itemKey - The key of the Zotero item.
   * @returns A promise that resolves to an array of strings, where each string is the text of a page.
   * @throws An error if the item or PDF attachment is not found, or if text extraction fails.
   */
  public async getPDFText(itemKey: string): Promise<string> {
    const attachment = await this.findPDFAttachment(itemKey);
    if (!attachment) {
      throw new Error(`PDF attachment not found for item ${itemKey}`);
    }

    const filePath = attachment.getFilePath();
    if (!filePath) {
      throw new Error(`File path not found for PDF attachment of item ${itemKey}`);
    }

    // Use the new PDFProcessor implementation
    const processor = new PDFProcessor(ztoolkit);
    try {
      // extractText returns the full text as a single string
      return await processor.extractText(filePath);
    } finally {
      processor.terminate();
    }
  }
}