/**
 * Permanent erase service for the Zotero MCP Plugin.
 *
 * trash_item only flags an item as deleted; Zotero frees `storage/<key>`
 * exclusively through `erase()` (see _eraseData in Zotero's item.js). Nothing
 * else in the plugin can delete a stored file, so this module is the single
 * place where erasure happens — kept separate so no existing handler changes.
 *
 * Guards, all enforced here: the write.erase.enabled preference must be true
 * (default off), the caller must pass confirm: true, only attachments and
 * notes are accepted, every item must already be trashed, and a call carries
 * at most MAX_ERASE_KEYS keys.
 */

declare let ztoolkit: ZToolkit;

const PREFS_PREFIX = "extensions.zotero.zotero-mcp-plugin";

/** Preference gate for permanent erase. Defaults to off. */
export const ERASE_ENABLED_PREF = `${PREFS_PREFIX}.write.erase.enabled`;

/** Upper bound on keys per call, to keep a single mistake small. */
export const MAX_ERASE_KEYS = 20;

interface HttpResponse {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string;
}

function jsonResponse(
  status: number,
  statusText: string,
  payload: unknown,
): HttpResponse {
  return {
    status,
    statusText,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

/**
 * Bytes held under `storage/<itemKey>`, the directory Zotero removes on erase
 * (_eraseData → removeDir). Linked attachments have one too — it holds the
 * extracted-text cache, not a copy of the linked file.
 */
async function storageBytesFor(item: Zotero.Item): Promise<number> {
  if (!item.isAttachment()) {
    // Notes have no storage directory.
    return 0;
  }
  try {
    const dir = Zotero.Attachments.getStorageDirectory(item).path;
    if (!(await IOUtils.exists(dir))) {
      return 0;
    }
    let total = 0;
    for (const child of await IOUtils.getChildren(dir)) {
      try {
        total += (await IOUtils.stat(child)).size ?? 0;
      } catch {
        // Vanished or unreadable child: nothing to add.
      }
    }
    return total;
  } catch (e) {
    ztoolkit.log(`[EraseService] size probe failed for ${item.key}: ${e}`, "warn");
    return 0;
  }
}

/**
 * Erase already-trashed attachments/notes. Mirrors handleTrashItems: same
 * HttpResponse shape, so the MCP layer unwraps the body the same way.
 */
export async function handleEraseItems(
  _params: Record<string, string>,
  body: { itemKeys?: string[]; libraryID?: number; confirm?: boolean },
): Promise<HttpResponse> {
  try {
    // Preference gate: off unless the user opted in, and fail-closed when the
    // pref was never written.
    if (Zotero.Prefs.get(ERASE_ENABLED_PREF, true) !== true) {
      return jsonResponse(403, "Forbidden", {
        error:
          'Permanent erase is disabled. erase_item only reclaims storage held by already-trashed attachments; it is not part of an attachment conversion, which ends at the Trash. Default policy: leave the Trash alone, the user empties it when they want. Do not ask the user to enable "Allow Permanent Erase"; just report which copies are waiting in the Trash.',
      });
    }

    // Explicit confirmation, so a stray call cannot destroy data.
    if (body.confirm !== true) {
      return jsonResponse(400, "Bad Request", {
        error:
          "erase_item permanently destroys data and cannot be undone. Pass confirm: true to proceed.",
      });
    }

    // Batch size: dedupe first, then bound how much one mistake can reach.
    const keys = Array.isArray(body.itemKeys)
      ? [
          ...new Set(
            body.itemKeys.map((key) => String(key).trim()).filter(Boolean),
          ),
        ]
      : [];

    if (keys.length === 0) {
      return jsonResponse(400, "Bad Request", {
        error: "itemKeys array is required",
      });
    }

    if (keys.length > MAX_ERASE_KEYS) {
      return jsonResponse(400, "Bad Request", {
        error: `At most ${MAX_ERASE_KEYS} item keys can be erased per call, received ${keys.length}. Split the batch.`,
      });
    }

    const libraryID = body.libraryID ?? Zotero.Libraries.userLibraryID;
    const notFound: string[] = [];
    const refused: Array<{ key: string; reason: string }> = [];
    const candidates: Zotero.Item[] = [];

    for (const key of keys) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
      if (!item) {
        notFound.push(key);
        continue;
      }

      // Attachments and notes only; regular items are never erased here.
      if (!item.isAttachment() && !item.isNote()) {
        refused.push({
          key,
          reason: `itemType "${Zotero.ItemTypes.getName(item.itemTypeID)}" is not an attachment or note; regular items are never erased by this tool`,
        });
        continue;
      }

      // Must already be trashed: enforces the trash_item → erase_item flow, so
      // every erasure stays recoverable up to the moment it happens.
      if (item.deleted !== true) {
        refused.push({
          key,
          reason:
            "item is not in the Zotero Trash; call trash_item first, then erase_item",
        });
        continue;
      }

      candidates.push(item);
    }

    if (candidates.length === 0) {
      return jsonResponse(notFound.length === keys.length ? 404 : 400,
        notFound.length === keys.length ? "Not Found" : "Bad Request", {
          error:
            notFound.length === keys.length
              ? `No items found in library ${libraryID}`
              : "No item passed the erase guards",
          notFound,
          refused,
        });
    }

    // Erase. Measure first: eraseTx removes the directory we are measuring.
    const erased: Array<{
      key: string;
      title: string;
      itemType: string;
      linkMode?: number;
      storageFreed: number;
    }> = [];
    const failed: Array<{ key: string; error: string }> = [];
    let totalStorageFreed = 0;

    for (const item of candidates) {
      const summary = {
        key: item.key,
        title: item.getDisplayTitle ? item.getDisplayTitle() : "",
        itemType: Zotero.ItemTypes.getName(item.itemTypeID),
        linkMode: item.isAttachment() ? item.attachmentLinkMode : undefined,
      };

      const storageFreed = await storageBytesFor(item);

      try {
        // eraseTx runs in its own transaction and, for stored attachments,
        // removes storage/<key> (Zotero item.js _eraseData).
        await item.eraseTx();
        erased.push({ ...summary, storageFreed });
        totalStorageFreed += storageFreed;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failed.push({ key: item.key, error: message });
        ztoolkit.log(`[EraseService] erase failed for ${item.key}: ${message}`, "error");
      }
    }

    ztoolkit.log(
      `[EraseService] erased ${erased.length}/${candidates.length} item(s), freed ${totalStorageFreed} bytes`,
    );

    const ok = erased.length > 0 && failed.length === 0;
    return jsonResponse(ok ? 200 : failed.length > 0 ? 500 : 400,
      ok ? "OK" : failed.length > 0 ? "Internal Server Error" : "Bad Request", {
        success: failed.length === 0,
        erasedCount: erased.length,
        erased,
        totalStorageFreed,
        refused,
        failed,
        notFound,
      });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    Zotero.logError(error);
    return jsonResponse(500, "Internal Server Error", { error: error.message });
  }
}
