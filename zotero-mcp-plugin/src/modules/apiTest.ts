/**
 * apiTest.ts
 *
 * This module provides a simple function to test the PDF content extraction API.
 */

declare const Zotero: any;
declare const ztoolkit: ZToolkit;

import { PDFService } from './pdfService';

/**
 * Runs a test case for the PDF content extraction API.
 * It tries to find an item with a PDF attachment and fetches its content.
 * @returns A promise that resolves to a string report of the test results.
 */
export async function testPDFExtraction(): Promise<string> {
  let report = 'API Test Report:\n\n';
  ztoolkit.log('[APITest] Starting PDF extraction tests...');

  try {
    // Step 1: Search for regular items (not attachments or notes)
    const search = new Zotero.Search();
    search.libraryID = Zotero.Libraries.userLibraryID;
    search.addCondition('itemType', 'isNot', 'attachment');
    search.addCondition('itemType', 'isNot', 'note');
    search.limit = 200; // Limit search to a reasonable number of items
    const regularItemIDs = await search.search();

    if (!regularItemIDs.length) {
      report += 'PDF Content Test: SKIPPED - No regular items found in the library.\n';
      ztoolkit.log('[APITest] No regular items found to check for PDFs.');
      return report;
    }

    // Step 2: Iterate through items to find one with a PDF attachment
    let itemWithPDF = null;
    ztoolkit.log(`[APITest] Checking ${regularItemIDs.length} items for PDF attachments...`);
    for (const itemID of regularItemIDs) {
      const item = Zotero.Items.get(itemID);
      if (!item || !item.isRegularItem()) continue;

      const attachmentIDs = item.getAttachments();
      for (const attachmentID of attachmentIDs) {
        const attachment = Zotero.Items.get(attachmentID);
        if (attachment && attachment.attachmentContentType === 'application/pdf') {
          itemWithPDF = item;
          break;
        }
      }
      if (itemWithPDF) {
        break;
      }
    }

    if (!itemWithPDF) {
      report += 'PDF Content Test: SKIPPED - No item with a PDF attachment found among the checked items.\n';
      ztoolkit.log('[APITest] No item with PDF attachment found.');
      return report;
    }

    const itemKey = itemWithPDF.key;
    report += `PDF Content Test: RUNNING for itemKey ${itemKey}\n`;
    ztoolkit.log(`[APITest] Testing with itemKey: ${itemKey}`);

    const pdfService = new PDFService();

    // Test: Get all text
    try {
      const allText = await pdfService.getPDFText(itemKey);
      report += `  - Get All Text: SUCCESS - Extracted ${allText.length} characters.\n`;
      ztoolkit.log(`[APITest] All text extracted. Preview: ${allText.substring(0, 100)}...`);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      report += `  - Get All Text: FAILED - ${error.message}\n`;
      ztoolkit.log(`[APITest] All text test failed: ${error.message}`, "error");
    }

  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    report += `\nAn unexpected error occurred during tests: ${error.message}\n`;
    ztoolkit.log(`[APITest] Unexpected error: ${error.message}`, "error");
  }

  ztoolkit.log('[APITest] API tests finished.');
  return report;
}