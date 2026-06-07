/**
 * citationInjector.ts
 *
 * Injects Zotero citations into Word .docx files.
 *
 * Workflow:
 *   1. Open a .docx file (which is a zip of XML files)
 *   2. Find <zcite key="ITEMKEY"/> placeholders in word/document.xml
 *   3. Look up each item in the local Zotero library
 *   4. Replace each placeholder with a native Zotero Word field code
 *      (ADDIN ZOTERO_ITEM CSL_CITATION ...) that Word + Zotero can manage
 *   5. Append a bibliography field code at the end of the document
 *   6. Save a new _cited.docx file
 *
 * Placeholder format:
 *   <zcite key="ITEMKEY"/>                  — single item
 *   <zcite keys="KEY1,KEY2"/>               — multiple items in one citation
 *   <zcite key="ITEMKEY" locator="5"/>      — with page locator
 *   <zcite key="ITEMKEY" prefix="see"/>     — with prefix text
 *   <zcite key="ITEMKEY" suffix="table 1"/> — with suffix text
 *   <zcite key="ITEMKEY" num="1"/>          — required for IEEE/Vancouver styles
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

declare let ztoolkit: ZToolkit;

// ─── CSL type definitions ─────────────────────────────────────────────────────

interface CSLName {
  family?: string;
  given?: string;
  literal?: string;
}

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

// ─── Zotero item type → CSL type mapping ─────────────────────────────────────

const ZOTERO_TO_CSL_TYPE: Record<string, string> = {
  journalArticle: "article-journal",
  book: "book",
  bookSection: "chapter",
  conferencePaper: "paper-conference",
  thesis: "thesis",
  report: "report",
  webpage: "webpage",
  preprint: "article",
  magazineArticle: "article-magazine",
  newspaperArticle: "article-newspaper",
  patent: "patent",
  dataset: "dataset",
  software: "software",
  blogPost: "post-weblog",
  forumPost: "post",
  email: "personal_communication",
  letter: "personal_communication",
  interview: "interview",
  film: "motion_picture",
  tvBroadcast: "broadcast",
  radioBroadcast: "broadcast",
  artwork: "graphic",
  map: "map",
  presentation: "speech",
  document: "document",
  encyclopediaArticle: "entry-encyclopedia",
  dictionaryEntry: "entry-dictionary",
};

// ─── Convert Zotero.Item to CSL JSON ─────────────────────────────────────────

export function itemToCSL(item: Zotero.Item, itemKey: string): CSLItem {
  const type = ZOTERO_TO_CSL_TYPE[item.itemType] || "document";
  const csl: CSLItem = { id: itemKey, type };

  const get = (field: string): string => {
    try {
      const v = item.getField(field);
      return v ? String(v) : "";
    } catch {
      return "";
    }
  };

  const title = get("title");
  if (title) csl.title = title;

  // Creators → CSL author / editor arrays
  const authors: CSLName[] = [];
  const editors: CSLName[] = [];
  try {
    for (const c of item.getCreators()) {
      const role = Zotero.CreatorTypes.getName(c.creatorTypeID);
      const name: CSLName = c.lastName
        ? { family: c.lastName, given: c.firstName || "" }
        : { literal: (c as any).name || "" };
      if (role === "editor") editors.push(name);
      else authors.push(name);
    }
  } catch {}
  if (authors.length) csl.author = authors;
  if (editors.length) csl.editor = editors;

  // Date → issued date-parts
  const date = get("date");
  if (date) {
    const yearMatch = date.match(/\d{4}/);
    if (yearMatch) csl.issued = { "date-parts": [[parseInt(yearMatch[0])]] };
  }

  // Container title (journal, book, proceedings, website, etc.)
  const container =
    get("publicationTitle") ||
    get("bookTitle") ||
    get("encyclopediaTitle") ||
    get("dictionaryTitle") ||
    get("proceedingsTitle") ||
    get("websiteTitle");
  if (container) csl["container-title"] = container;

  const volume = get("volume");
  const issue = get("issue");
  const pages = get("pages");
  const doi = get("DOI");
  const url = get("url");
  const publisher = get("publisher");
  const place = get("place");
  const abstract = get("abstractNote");

  if (volume) csl.volume = volume;
  if (issue) csl.issue = issue;
  if (pages) csl.page = pages;
  if (doi) csl.DOI = doi;
  if (url) csl.URL = url;
  if (publisher) csl.publisher = publisher;
  if (place) csl["publisher-place"] = place;
  if (abstract) csl.abstract = abstract;

  return csl;
}

// ─── Parse a <zcite> placeholder tag ─────────────────────────────────────────

interface ZciteTag {
  rawEscaped: string; // the XML-escaped form as it appears in the docx
  keys: string[];
  locator?: string;
  prefix?: string;
  suffix?: string;
  num?: number;
}

function parseZciteTag(rawEscaped: string): ZciteTag {
  // Unescape XML entities to parse attributes
  const unescaped = rawEscaped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

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

function formatCitationText(
  tag: ZciteTag,
  cslItems: CSLItem[],
  style: string,
): string {
  const isNumbered = ["ieee", "vancouver"].includes(style.toLowerCase());

  if (isNumbered) {
    return tag.num !== undefined ? `[${tag.num}]` : "[?]";
  }

  // Author-date styles (APA, Harvard, Chicago)
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

// ─── Generate Zotero OOXML field codes ────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateCitationFieldCode(
  tag: ZciteTag,
  cslItems: CSLItem[],
  formattedText: string,
  citationIndex: number,
): string {
  const citationId = `cit${citationIndex}`;

  const citationItems = tag.keys.map((key, i) => {
    const obj: Record<string, any> = {
      id: key,
      uris: [],
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

function generateBibliographyFieldCode(): string {
  const instruction =
    'ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY';
  return (
    `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ${xmlEscape(instruction)} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>[Bibliography will be generated by Zotero]</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
  );
}

// ─── Main injection function ───────────────────────────────────────────────────

export interface InjectionResult {
  outputPath: string;
  citationsInjected: number;
  itemsNotFound: string[];
  message: string;
}

export async function injectCitations(
  docxPath: string,
  style: string,
  libraryID?: number,
): Promise<InjectionResult> {
  const effectiveLibraryID = libraryID || Zotero.Libraries.userLibraryID;
  const normalizedStyle = (style || "apa").toLowerCase();

  ztoolkit.log(`[CitationInjector] Reading ${docxPath}`);

  // ── 1. Read and unzip the .docx ────────────────────────────────────────────
  let rawData: Uint8Array;
  try {
    rawData = await IOUtils.read(docxPath);
  } catch (e: any) {
    throw new Error(`Cannot read file: ${docxPath}. ${e.message}`);
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(rawData);
  } catch (e: any) {
    throw new Error(`File does not appear to be a valid .docx (zip). ${e.message}`);
  }

  if (!unzipped["word/document.xml"]) {
    throw new Error("Not a valid .docx file: word/document.xml not found inside zip.");
  }

  let docXml = strFromU8(unzipped["word/document.xml"]);
  ztoolkit.log(`[CitationInjector] document.xml length: ${docXml.length}`);

  // ── 2. Preprocess: split mixed-content runs ────────────────────────────────
  // If a single <w:r> text run contains multiple zcite tags (or zcite tags mixed
  // with surrounding text), split it into separate runs — one per segment — so
  // each zcite ends up alone in its own <w:r><w:t>...</w:t></w:r>. This ensures
  // soloRunPattern always matches cleanly in the injection loop.
  // IMPORTANT: use non-greedy *? so we don't swallow across multiple zcite tags.
  // &lt; and &gt; don't contain literal < or > chars, so greedy [^<>]* would
  // match straight through adjacent zcite tags and their surrounding text.
  const runWithZcite = /(<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>).)*?<\/w:rPr>)?<w:t[^>]*>)([^<]*(?:&lt;zcite[^<>]*?\/&gt;[^<]*)+)(<\/w:t><\/w:r>)/g;
  docXml = docXml.replace(runWithZcite, (_m, openRun, content, closeRun) => {
    const parts: string[] = content.split(/(&lt;zcite[^<>]*?\/&gt;)/);
    return parts.filter((p: string) => p !== "").map((p: string) => `${openRun}${p}${closeRun}`).join("");
  });
  ztoolkit.log(`[CitationInjector] Preprocessed runs, xml length now: ${docXml.length}`);

  // ── 3. Find all zcite placeholders ────────────────────────────────────────
  // Word XML-encodes < and > in text runs as &lt; and &gt;
  // Pattern matches: &lt;zcite ...attributes... /&gt;
  // Use non-greedy *? to avoid matching across multiple adjacent zcite tags.
  const zcitePattern = /&lt;zcite\s[^<>]*?\/&gt;/g;
  const rawMatches = [...docXml.matchAll(zcitePattern)];

  if (rawMatches.length === 0) {
    return {
      outputPath: docxPath,
      citationsInjected: 0,
      itemsNotFound: [],
      message:
        'No <zcite> placeholders found. Add placeholders like <zcite key="ITEMKEY"/> to your document, then run this tool.',
    };
  }

  ztoolkit.log(`[CitationInjector] Found ${rawMatches.length} zcite tags`);

  // ── 3. Parse tags and collect unique item keys ─────────────────────────────
  const tags: ZciteTag[] = rawMatches.map((m) => parseZciteTag(m[0]));
  const allKeys = new Set(tags.flatMap((t) => t.keys));

  // ── 4. Fetch items from local Zotero ──────────────────────────────────────
  const cslMap = new Map<string, CSLItem>();
  const itemsNotFound: string[] = [];

  for (const key of allKeys) {
    try {
      const item = Zotero.Items.getByLibraryAndKey(effectiveLibraryID, key);
      if (item && !item.isAttachment() && !item.isNote()) {
        cslMap.set(key, itemToCSL(item, key));
        ztoolkit.log(`[CitationInjector] Resolved key ${key}: ${item.getField("title")}`);
      } else {
        itemsNotFound.push(key);
        ztoolkit.log(`[CitationInjector] Key not found: ${key}`, "warn");
      }
    } catch (e) {
      itemsNotFound.push(key);
      ztoolkit.log(`[CitationInjector] Error fetching key ${key}: ${e}`, "error");
    }
  }

  // ── 5. Replace each zcite tag with a Word field code ──────────────────────
  let citationsInjected = 0;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const cslItems = tag.keys
      .map((k) => cslMap.get(k))
      .filter(Boolean) as CSLItem[];

    if (cslItems.length === 0) {
      ztoolkit.log(`[CitationInjector] Skipping tag with no resolved items: ${tag.keys.join(",")}`, "warn");
      continue;
    }

    const formattedText = formatCitationText(tag, cslItems, normalizedStyle);
    const fieldCode = generateCitationFieldCode(tag, cslItems, formattedText, i + 1);

    // Strategy: find the <w:r>...</w:r> element whose <w:t> contains this tag
    // and replace the whole run with our field code sequence.
    // The tag may have surrounding text, so we split the run if needed.
    const escapedTag = tag.rawEscaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Case A: run contains ONLY the zcite tag (most common when placeholder is alone)
    const soloRunPattern = new RegExp(
      `<w:r>(?:<w:rPr>(?:(?!<w:rPr>).)*?</w:rPr>)?<w:t(?:[^>]*)>${escapedTag}</w:t></w:r>`,
    );

    // Case B: tag is embedded in text — split the run
    const inlineRunPattern = new RegExp(
      `(<w:r>(?:<w:rPr>(?:(?!<w:rPr>).)*?</w:rPr>)?<w:t(?:[^>]*)>)([^<]*?)${escapedTag}([^<]*?)(</w:t></w:r>)`,
    );

    const before = docXml;

    if (soloRunPattern.test(docXml)) {
      docXml = docXml.replace(soloRunPattern, fieldCode);
    } else if (inlineRunPattern.test(docXml)) {
      docXml = docXml.replace(
        inlineRunPattern,
        (_match, openRun, textBefore, textAfter, closeRun) => {
          const before = textBefore
            ? `${openRun}${textBefore}${closeRun}`
            : "";
          const after = textAfter ? `${openRun}${textAfter}${closeRun}` : "";
          return `${before}${fieldCode}${after}`;
        },
      );
    } else {
      // Fallback: simple text substitution (less precise but catches edge cases)
      docXml = docXml.replace(tag.rawEscaped, fieldCode);
    }

    if (docXml !== before) {
      citationsInjected++;
    }
  }

  // ── 6. Append bibliography before </w:body> ────────────────────────────────
  if (citationsInjected > 0) {
    docXml = docXml.replace(
      "</w:body>",
      generateBibliographyFieldCode() + "</w:body>",
    );
  }

  // ── 7. Write output .docx ─────────────────────────────────────────────────
  unzipped["word/document.xml"] = strToU8(docXml);
  const zipped = zipSync(unzipped, { level: 6 });

  const outputPath = docxPath.replace(/\.docx$/i, "_cited.docx");
  await IOUtils.write(outputPath, zipped);

  ztoolkit.log(`[CitationInjector] Done. Wrote ${outputPath}`);

  const skipped = itemsNotFound.length;
  const message =
    citationsInjected === 0
      ? "No citations were injected. Check that the item keys in your placeholders exist in Zotero."
      : `Injected ${citationsInjected} citation(s). Open the _cited.docx in Word with Zotero running to refresh and reformat citations.` +
        (skipped > 0 ? ` Note: ${skipped} item key(s) were not found: ${itemsNotFound.join(", ")}.` : "");

  return { outputPath, citationsInjected, itemsNotFound, message };
}
