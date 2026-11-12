/**
 * Raw-bytes attachment upload (#115).
 *
 * `POST /mcp/attachments?parentKey=ABCD1234&fileName=paper.pdf` with the file
 * as the request body. Meant for MCP clients that run on another machine and
 * reach Zotero through a tunnel, where `write_item` import cannot work
 * because it needs a path on the Zotero machine.
 *
 * Constraints (agreed in #115):
 * - gated by the same write switch as the `write_*` tools
 * - parent key and an explicit size limit
 * - returns the new attachment key
 * - only served to loopback peers, even when remote access is enabled
 *
 * Request validation lives in attachmentUploadRequest.ts, free of Zotero
 * globals, so it can be unit tested under plain mocha.
 */

import {
  commitNotifierQueue,
  createNotifierQueue,
  notifierSaveOptions,
  runSerializedWrite,
} from "./deferredNotifierCommitter";
import {
  DEFAULT_UPLOAD_MAX_BYTES,
  type UploadParams,
} from "./attachmentUploadRequest";

export const UPLOAD_MAX_BYTES_PREF =
  "extensions.zotero.zotero-mcp-plugin.upload.maxBytes";

export function getUploadMaxBytes(): number {
  const value = Zotero.Prefs.get(UPLOAD_MAX_BYTES_PREF, true);
  return typeof value === "number" && value > 0
    ? value
    : DEFAULT_UPLOAD_MAX_BYTES;
}

export interface UploadResult {
  attachmentKey: string;
  parentItemKey: string;
  libraryID: number;
  title: string;
  size: number;
}

/**
 * Write the bytes to a private temp directory and import them as a stored
 * attachment. Zotero copies the file into its storage, so the temp copy is
 * removed afterwards in every case.
 */
export function importUploadedAttachment(
  params: UploadParams,
  bytes: Uint8Array,
): Promise<UploadResult> {
  // Same queue as the write_* tools, so shutdown waits for the import.
  return runSerializedWrite(() => importSerialized(params, bytes));
}

async function importSerialized(
  params: UploadParams,
  bytes: Uint8Array,
): Promise<UploadResult> {
  const libraryID = params.libraryID ?? Zotero.Libraries.userLibraryID;
  const parentItem = await Zotero.Items.getByLibraryAndKeyAsync(
    libraryID,
    params.parentKey,
  );
  if (!parentItem) {
    throw new UploadError(
      404,
      "Not Found",
      `Parent item not found in library ${libraryID}: ${params.parentKey}`,
    );
  }
  if (!parentItem.isRegularItem()) {
    throw new UploadError(
      400,
      "Bad Request",
      `Parent ${params.parentKey} is not a regular item (type: ${parentItem.itemType}), cannot attach files`,
    );
  }

  const tempDir = PathUtils.join(
    Zotero.getTempDirectory().path,
    `zotero-mcp-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  await IOUtils.makeDirectory(tempDir, {
    createAncestors: true,
    ignoreExisting: false,
    // Zotero's temp dir is world-readable (/tmp/zotero, 0755); keep the
    // uploaded file name to this user.
    permissions: 0o700,
  });
  try {
    const tempFile = PathUtils.join(tempDir, params.fileName);
    await IOUtils.write(tempFile, bytes);

    const notifierQueue = createNotifierQueue();
    const attachment = await Zotero.Attachments.importFromFile({
      file: tempFile,
      parentItemID: parentItem.id,
      title: params.title || params.fileName,
      contentType: params.contentType,
      saveOptions: notifierSaveOptions(notifierQueue),
    } as any);
    await commitNotifierQueue(
      notifierQueue,
      `upload attachment ${attachment.key}`,
    );

    return {
      attachmentKey: attachment.key,
      parentItemKey: params.parentKey,
      libraryID,
      title: attachment.getField("title") as string,
      size: bytes.length,
    };
  } finally {
    try {
      await IOUtils.remove(tempDir, { recursive: true, ignoreAbsent: true });
    } catch (e) {
      ztoolkit.log(
        `[AttachmentUpload] Could not remove temp dir ${tempDir}: ${e}`,
        "warn",
      );
    }
  }
}

export class UploadError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
  ) {
    super(message);
  }
}
