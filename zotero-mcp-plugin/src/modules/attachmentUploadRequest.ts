/**
 * Raw-bytes attachment upload (#115): request validation.
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
 * The request validation is kept free of Zotero globals so it can be unit
 * tested under plain mocha.
 */

export const UPLOAD_PATH = "/mcp/attachments";
export const DEFAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
/** Room for the request line and headers on top of the body limit. */
export const UPLOAD_HEADER_ALLOWANCE = 64 * 1024;
/** Uploads over a tunnel stall longer than a JSON-RPC call; ~10 s total. */
export const UPLOAD_MAX_WAIT_ATTEMPTS = 1000;

const ITEM_KEY = /^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/;
const MAX_FILE_NAME_LENGTH = 200;

export interface UploadRequest {
  method: string;
  query: URLSearchParams;
  headerText: string;
  contentLength: number;
  peerHost: string | undefined;
  writeEnabled: boolean;
  maxBytes: number;
}

export interface UploadParams {
  parentKey: string;
  fileName: string;
  title?: string;
  contentType?: string;
  libraryID?: number;
}

export type UploadValidation =
  | { ok: true; params: UploadParams }
  | { ok: false; status: number; statusText: string; error: string };

/** True when the request line targets the upload route. */
export function isUploadRequestLine(headerText: string): boolean {
  const requestLine = headerText.split("\r\n", 1)[0] || "";
  const target = requestLine.split(" ")[1] || "";
  // Same normalisation as the router (new URL), so an absolute target
  // cannot reach the route without the upload limits.
  try {
    return new URL(target, "http://127.0.0.1").pathname === UPLOAD_PATH;
  } catch {
    return false;
  }
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1") return true;
  const v4 = h.startsWith("::ffff:") ? h.slice(7) : h;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

function header(headerText: string, name: string): string | undefined {
  const match = headerText.match(
    new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, "im"),
  );
  return match ? match[1].trim() : undefined;
}

function fail(
  status: number,
  statusText: string,
  error: string,
): UploadValidation {
  return { ok: false, status, statusText, error };
}

/**
 * Access checks that need only the header block. The server runs them
 * before granting the larger upload buffer, so a refused caller never gets
 * more than the default 1 MiB read.
 */
export function checkUploadAccess(
  headerText: string,
  peerHost: string | undefined,
  writeEnabled: boolean,
): (UploadValidation & { ok: false }) | undefined {
  if (!isLoopbackHost(peerHost)) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      error: "Attachment upload is only served on loopback",
    };
  }
  // Browsers attach Origin to every cross-origin POST; a CLI client or an
  // MCP bridge does not. Refusing it keeps web pages on the Zotero machine
  // from writing into the library through this endpoint.
  if (header(headerText, "Origin") !== undefined) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      error: "Requests carrying an Origin header are refused",
    };
  }
  if (!writeEnabled) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      error: "Write operations are disabled in the plugin settings",
    };
  }
  return undefined;
}

/**
 * Check everything that can be checked before touching Zotero. Order
 * matters: access checks come first so an unauthorised caller learns
 * nothing about parameter rules.
 */
export function validateUploadRequest(req: UploadRequest): UploadValidation {
  if (req.method !== "POST") {
    return fail(
      405,
      "Method Not Allowed",
      "Use POST with the file as the request body",
    );
  }
  const denied = checkUploadAccess(
    req.headerText,
    req.peerHost,
    req.writeEnabled,
  );
  if (denied) return denied;

  // The reader frames the body by the first Content-Length it finds and
  // knows no chunked encoding; anything else could import a partial file.
  if (
    (req.headerText.match(/^Content-Length:/gim) || []).length > 1 ||
    header(req.headerText, "Transfer-Encoding") !== undefined
  ) {
    return fail(
      400,
      "Bad Request",
      "Send exactly one Content-Length and no Transfer-Encoding",
    );
  }

  const parentKey = (req.query.get("parentKey") || "").trim().toUpperCase();
  if (!ITEM_KEY.test(parentKey)) {
    return fail(
      400,
      "Bad Request",
      "parentKey must be an 8-character Zotero item key",
    );
  }

  const fileName = (req.query.get("fileName") || "").trim();
  if (!fileName) {
    return fail(400, "Bad Request", "fileName is required");
  }
  if (
    fileName.length > MAX_FILE_NAME_LENGTH ||
    /[\\/]/.test(fileName) ||
    hasControlCharacter(fileName) ||
    fileName === "." ||
    fileName === ".."
  ) {
    return fail(
      400,
      "Bad Request",
      "fileName must be a plain file name without path separators",
    );
  }

  if (req.contentLength <= 0) {
    return fail(
      400,
      "Bad Request",
      "Request body is empty; send the file bytes with Content-Length",
    );
  }
  if (req.contentLength > req.maxBytes) {
    return fail(
      413,
      "Payload Too Large",
      `File is ${req.contentLength} bytes, limit is ${req.maxBytes} (pref upload.maxBytes)`,
    );
  }

  let libraryID: number | undefined;
  const libraryParam = req.query.get("libraryID");
  if (libraryParam !== null) {
    libraryID = Number(libraryParam);
    if (!Number.isInteger(libraryID) || libraryID <= 0) {
      return fail(400, "Bad Request", "libraryID must be a positive integer");
    }
  }

  const contentType = header(req.headerText, "Content-Type");
  const title = req.query.get("title")?.trim() || undefined;

  return {
    ok: true,
    params: {
      parentKey,
      fileName,
      title,
      contentType:
        contentType && contentType !== "application/octet-stream"
          ? contentType.split(";")[0].trim()
          : undefined,
      libraryID,
    },
  };
}
