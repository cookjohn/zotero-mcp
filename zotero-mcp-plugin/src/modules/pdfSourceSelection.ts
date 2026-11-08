/**
 * Pure decision table for picking between Zotero's cached full text and the
 * plugin's pdf worker output. Kept free of Gecko imports so it stays testable
 * under plain Node.
 *
 * Why the choice exists:
 * - Zotero's `.zotero-ft-cache` is faithful for CJK — the pdf worker silently
 *   drops glyphs when a font/CMap asset fails to load (#116).
 * - Zotero caps PDF indexing at 600 pages, so a cache can be a prefix of the
 *   PDF; preferring it unconditionally truncates long documents.
 */

export type PdfTextSource =
  | "zotero_cache"
  | "zotero_cache_partial"
  | "pdf_worker"
  | "pdf_worker_timeout";

export interface PdfSourceInput {
  cachedText: string | null;
  cacheComplete: boolean;
  /** null when the worker was not run or threw. */
  workerText: string | null;
  workerError: string | null;
  fontDataFetchFailures: number;
}

export interface PdfSourceDecision {
  source: PdfTextSource;
  /** Raw text before formatting; empty only for the timeout placeholder. */
  text: string;
  warnings: string[];
}

function partialWarning(attachmentLabel: string): string {
  return (
    `Zotero only indexed part of this PDF (${attachmentLabel}); the returned ` +
    `text is Zotero's partial index rather than the whole document.`
  );
}

/**
 * @param attachmentLabel human-readable attachment identifier for warnings
 * @returns the decision, or null when no usable text exists (caller throws)
 */
export function choosePdfSource(
  input: PdfSourceInput,
  attachmentLabel: string,
): PdfSourceDecision | null {
  const { cachedText, cacheComplete, workerText, workerError, fontDataFetchFailures } =
    input;

  if (cachedText && cacheComplete) {
    return { source: "zotero_cache", text: cachedText, warnings: [] };
  }

  if (workerText === null) {
    if (workerError !== null && workerError.includes("timed out")) {
      if (cachedText) {
        return {
          source: "zotero_cache_partial",
          text: cachedText,
          warnings: [
            `PDF extraction timed out; fell back to Zotero's partial index.`,
            partialWarning(attachmentLabel),
          ],
        };
      }
      return {
        source: "pdf_worker_timeout",
        text: "[PDF extraction timed out - file may be too large. Try indexing the PDF in Zotero first.]",
        warnings: [],
      };
    }
    if (cachedText) {
      return {
        source: "zotero_cache_partial",
        text: cachedText,
        warnings: [
          `PDF extraction failed (${workerError ?? "unknown error"}); fell back to Zotero's partial index.`,
          partialWarning(attachmentLabel),
        ],
      };
    }
    return null;
  }

  // Worker produced text. Font/CMap failures mean invisible glyph loss, so any
  // cache — even a partial one — is the safer source.
  if (fontDataFetchFailures > 0 && cachedText) {
    return {
      source: "zotero_cache_partial",
      text: cachedText,
      warnings: [
        `PDF font/CMap data failed to load ${fontDataFetchFailures} time(s); the pdf worker's text may be missing characters, so Zotero's index was used instead.`,
        partialWarning(attachmentLabel),
      ],
    };
  }

  if (cachedText && cachedText.length > workerText.length) {
    return {
      source: "zotero_cache_partial",
      text: cachedText,
      warnings: [partialWarning(attachmentLabel)],
    };
  }

  if (fontDataFetchFailures > 0) {
    return {
      source: "pdf_worker",
      text: workerText,
      warnings: [
        `PDF font/CMap data could not be loaded (${fontDataFetchFailures} fetch failure(s)); ` +
          `characters — typically CJK — may be missing. Run Zotero's own full-text indexing ` +
          `on this attachment and retry to use Zotero's text cache instead.`,
      ],
    };
  }

  return { source: "pdf_worker", text: workerText, warnings: [] };
}
