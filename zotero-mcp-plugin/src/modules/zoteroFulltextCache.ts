/**
 * Read the full text that Zotero itself extracted for an attachment.
 *
 * Zotero caches converted PDF/EPUB text in a `.zotero-ft-cache` file next to
 * the stored attachment, and its own reader/search rely on that cache. Reading
 * it is both faster and more faithful than re-extracting the PDF ourselves:
 * the plugin-side pdf worker drops CJK glyphs whenever the CJK CMap or the
 * embedded font cannot be resolved (#116), and the loss is silent — the text
 * still looks valid, just missing whole paragraphs of Chinese.
 *
 * API history:
 * - Zotero 8-/7-: `Zotero.Fulltext.getItemContent(itemID)` returned
 *   `{ content, ... }`.
 * - Zotero 9/10: that method is gone. The cache is exposed as a file via
 *   `Zotero.Fulltext.getItemCacheFile(item)`, read with
 *   `Zotero.File.getContentsAsync()`.
 *
 * Both paths are tried; a missing cache is not an error.
 */

declare const Zotero: any;
declare const IOUtils: any;
declare const ztoolkit: ZToolkit;

async function fileExists(path: string): Promise<boolean> {
  try {
    if (typeof IOUtils !== "undefined" && IOUtils.exists) {
      return await IOUtils.exists(path);
    }
    if (Zotero?.File?.exists) {
      return await Zotero.File.exists(path);
    }
  } catch {
    // Unknown existence API: let the read itself decide.
    return true;
  }
  return true;
}

/**
 * @param attachment Zotero attachment item (PDF, EPUB or text file)
 * @returns the cached plain text, or null when the attachment has no cache yet
 */
export async function readZoteroCachedFulltext(
  attachment: any,
): Promise<string | null> {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const fulltext = Zotero?.Fulltext;

  try {
    // Zotero 9/10: cache file on disk.
    if (fulltext?.getItemCacheFile && Zotero?.File?.getContentsAsync) {
      const cacheFile = fulltext.getItemCacheFile(attachment);
      const path =
        typeof cacheFile === "string" ? cacheFile : (cacheFile?.path ?? null);
      if (path && (await fileExists(path))) {
        const content = await Zotero.File.getContentsAsync(path);
        if (typeof content === "string" && content.trim().length > 0) {
          return content;
        }
      }
    }
  } catch (error) {
    ztoolkit?.log?.(
      `[FulltextCache] Cache file read failed for ${attachment.key}: ${error}`,
      "warn",
    );
  }

  try {
    // Zotero 7/8: in-process accessor.
    if (fulltext?.getItemContent && attachment.id) {
      const cached = await fulltext.getItemContent(attachment.id);
      const content =
        typeof cached === "string" ? cached : (cached?.content ?? null);
      if (typeof content === "string" && content.trim().length > 0) {
        return content;
      }
    }
  } catch (error) {
    ztoolkit?.log?.(
      `[FulltextCache] getItemContent failed for ${attachment.key}: ${error}`,
      "warn",
    );
  }

  return null;
}
