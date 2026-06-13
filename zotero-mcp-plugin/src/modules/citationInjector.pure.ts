/**
 * citationInjector.pure.ts
 *
 * Pure, Gecko-free functions extracted from citationInjector.ts so they can be
 * exercised by the Mocha test suite running under Node.js.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CSLItem {
  id: string;
  type: string;
  title?: string;
  author?: CSLName[];
  editor?: CSLName[];
  issued?: { "date-parts": number[][] };
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  publisher?: string;
  "publisher-place"?: string;
  abstract?: string;
  [key: string]: any;
}

interface CSLName {
  family?: string;
  given?: string;
  literal?: string;
}

export interface ZciteTag {
  rawEscaped: string;
  keys: string[];
  locator?: string;
  prefix?: string;
  suffix?: string;
  num?: number;
}

// ─── XML entity helpers ───────────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Parse a <zcite> placeholder tag ─────────────────────────────────────────

export function parseZciteTag(rawEscaped: string): ZciteTag {
  // Unescape XML entities. &amp; must come last to avoid double-unescaping
  // &amp;quot; → &quot; → " (wrong) instead of &amp;quot; → &quot; (correct).
  const unescaped = rawEscaped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

  const keyMatch = unescaped.match(/keys?="([^"]+)"/);
  const locatorMatch = unescaped.match(/locator="([^"]+)"/);
  const prefixMatch = unescaped.match(/prefix="([^"]+)"/);
  const suffixMatch = unescaped.match(/suffix="([^"]+)"/);
  const numMatch = unescaped.match(/num="(\d+)"/);

  const keys = keyMatch
    ? keyMatch[1].split(/[\s,]+/).filter(Boolean)
    : [];

  return {
    rawEscaped,
    keys,
    locator: locatorMatch?.[1],
    prefix: prefixMatch?.[1],
    suffix: suffixMatch?.[1],
    num: numMatch ? parseInt(numMatch[1]) : undefined,
  };
}

// ─── Format the inline citation text ─────────────────────────────────────────

export function formatCitationText(
  tag: ZciteTag,
  cslItems: CSLItem[],
  style: string,
): string {
  const isNumbered = ["ieee", "vancouver"].includes(style.toLowerCase());

  if (isNumbered) {
    return tag.num !== undefined ? `[${tag.num}]` : "[?]";
  }

  const parts = cslItems.map((item) => {
    const authors = item.author || [];
    let authorStr: string;
    if (authors.length === 0) {
      authorStr = item.title
        ? `"${item.title.substring(0, 20)}..."`
        : "n.d.";
    } else if (authors.length === 1) {
      authorStr = authors[0].family || authors[0].literal || "";
    } else if (authors.length === 2) {
      authorStr = `${authors[0].family || authors[0].literal} & ${authors[1].family || authors[1].literal}`;
    } else {
      authorStr = `${authors[0].family || authors[0].literal} et al.`;
    }
    const year = item.issued?.["date-parts"]?.[0]?.[0] ?? "n.d.";
    return `${authorStr}, ${year}`;
  });

  const inner = parts.join("; ");
  const prefix = tag.prefix ? `${tag.prefix} ` : "";
  const suffix = tag.suffix ? `, ${tag.suffix}` : "";
  const locator = tag.locator ? `, p. ${tag.locator}` : "";
  return `(${prefix}${inner}${locator}${suffix})`;
}

// ─── Path validation ──────────────────────────────────────────────────────────

/**
 * Platform-agnostic path validator. The Gecko-specific PathUtils calls in
 * citationInjector.ts are replaced with standard Node.js path logic so this
 * function can run in both environments.
 */
export function validateDocxPath(docxPath: string, pathModule?: {
  isAbsolute(p: string): boolean;
  normalize(p: string): string;
  basename(p: string): string;
}): void {
  // Default to a no-op shim; the real implementation in citationInjector.ts
  // passes the Gecko PathUtils-compatible object.
  const path = pathModule || {
    isAbsolute: (p: string) => p.startsWith("/") || /^[A-Za-z]:\\/.test(p),
    normalize: (p: string) => p,
    basename: (p: string) => p.split(/[/\\]/).pop() || p,
  };

  if (!docxPath) {
    throw new Error("docxPath is required.");
  }

  if (!path.isAbsolute(docxPath)) {
    throw new Error(`docxPath must be an absolute path. Got: ${docxPath}`);
  }

  const normalized = path.normalize(docxPath);
  if (normalized !== docxPath && normalized.includes("..")) {
    throw new Error(`docxPath contains path traversal sequences: ${docxPath}`);
  }

  if (!docxPath.toLowerCase().endsWith(".docx")) {
    throw new Error(`docxPath must end in .docx. Got: ${docxPath}`);
  }

  const basename = path.basename(docxPath);
  if (basename.toLowerCase().endsWith("_cited.docx")) {
    throw new Error(
      `Refusing to process a file that is itself a _cited.docx output: ${docxPath}.`,
    );
  }
}

// ─── Generate Zotero OOXML field codes ────────────────────────────────────────

export function generateCitationFieldCode(
  tag: ZciteTag,
  cslItems: CSLItem[],
  formattedText: string,
  libraryID: number,
): string {
  // Use a seeded value in tests; in production, randomCitationId() is used.
  const citationId = "cit" + Math.random().toString(36).slice(2, 10);

  const citationItems = tag.keys.map((key, i) => {
    const obj: Record<string, any> = {
      id: key,
      uris: [`zotero://select/library/items/${key}`],
      itemData: cslItems[i] || { id: key, type: "document" },
    };
    if (tag.locator) {
      obj.locator = tag.locator;
      obj.label = "page";
    }
    if (tag.prefix) obj.prefix = tag.prefix;
    if (tag.suffix) obj.suffix = tag.suffix;
    return obj;
  });

  const cslCitation = {
    citationID: citationId,
    properties: {
      formattedCitation: formattedText,
      plainCitation: formattedText,
      noteIndex: 0,
    },
    citationItems,
    schema:
      "https://raw.githubusercontent.com/citation-style-language/schema/master/raw-json/csl-citation.json",
  };

  const instruction = `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify(cslCitation)}`;

  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ${xmlEscape(instruction)} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>${xmlEscape(formattedText)}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}
