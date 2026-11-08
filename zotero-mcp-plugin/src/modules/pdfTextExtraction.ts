/**
 * Read PDF text for an attachment, choosing between Zotero's cached full text
 * and the plugin's pdf worker (see pdfSourceSelection.ts for the policy).
 */

import { PDFProcessor } from "./pdfProcessor";
import { TextFormatter } from "./textFormatter";
import { readZoteroCachedFulltext } from "./zoteroFulltextCache";
import { choosePdfSource, type PdfTextSource } from "./pdfSourceSelection";

declare const Zotero: any;
declare const ztoolkit: ZToolkit;

export type { PdfTextSource } from "./pdfSourceSelection";

export interface PdfTextResult {
  text: string;
  source: PdfTextSource;
  warnings: string[];
}

/** Structural view of PDFProcessor so callers and tests can supply a stub. */
export interface PdfWorkerLike {
  extractText(path: string): Promise<string>;
  fontDataFetchFailures: number;
  terminate(): void;
}

async function isCacheComplete(attachment: any): Promise<boolean> {
  const fulltext = Zotero?.Fulltext;
  try {
    // Preferred: Zotero's own notion of "fully indexed", which accounts for
    // the page cap, character limits and sync state.
    if (typeof fulltext?.isFullyIndexed === "function") {
      return (await fulltext.isFullyIndexed(attachment)) === true;
    }
    // Fallback: page counters. getPages() aliases totalPages to `total`.
    const pages = await fulltext?.getPages?.(attachment?.id);
    const total = pages?.totalPages ?? pages?.total;
    if (!total) {
      return true;
    }
    return (pages.indexedPages ?? 0) >= total;
  } catch (error) {
    // Unknown metadata: do not claim the cache is complete, otherwise long
    // PDFs silently come back truncated to Zotero's 600-page index.
    ztoolkit.log(
      `[PdfSource] Index completeness unknown for ${attachment?.key}: ${error}`,
      "warn",
    );
    return false;
  }
}

export async function extractPdfText(
  attachment: any,
  options: {
    filePath?: string | null;
    /** Reused worker; never terminated here. */
    processor?: PdfWorkerLike | null;
  } = {},
): Promise<PdfTextResult> {
  const attachmentLabel = attachment?.key ?? "attachment";
  const cachedText = await readZoteroCachedFulltext(attachment);
  const cacheComplete = cachedText ? await isCacheComplete(attachment) : false;
  const filePath = options.filePath ?? null;

  let workerText: string | null = null;
  let workerError: string | null = null;
  let fontDataFetchFailures = 0;

  const needsWorker = !cachedText || !cacheComplete;
  if (needsWorker && filePath) {
    const processor = options.processor ?? new PDFProcessor(ztoolkit);
    const ownsProcessor = !options.processor;
    // A shared processor accumulates failures across attachments, so only the
    // delta caused by this file may influence this file's decision.
    const failuresBefore = processor.fontDataFetchFailures;
    try {
      workerText = await processor.extractText(filePath);
    } catch (error) {
      workerError = error instanceof Error ? error.message : String(error);
    } finally {
      fontDataFetchFailures = processor.fontDataFetchFailures - failuresBefore;
      if (ownsProcessor) {
        processor.terminate();
      }
    }
  }

  const decision = choosePdfSource(
    {
      cachedText,
      cacheComplete,
      workerText,
      workerError,
      fontDataFetchFailures,
    },
    attachmentLabel,
  );

  if (!decision) {
    throw new Error(
      `PDF attachment ${attachmentLabel} has neither a readable file path nor a Zotero full-text cache`,
    );
  }

  return {
    text: TextFormatter.formatPDFText(decision.text),
    source: decision.source,
    warnings: decision.warnings,
  };
}
