declare const PathUtils: any;

export interface CreatorData {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface IdentifierAttachment {
  title: string;
  url: string;
  mimeType: string;
  path?: string;
  size?: number;
  downloadStatus?: "downloaded" | "failed";
  downloadError?: string;
}

export interface IdentifierItem {
  itemType: string;
  title: string;
  creators: CreatorData[];
  abstractNote?: string;
  date?: string;
  DOI?: string;
  url?: string;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  repository?: string;
  archiveID?: string;
  number?: string;
  extra?: string;
  libraryCatalog?: string;
  tags: Array<string | { tag: string }>;
  attachments: IdentifierAttachment[];
}

export interface IdentifierLookupResult {
  input: string;
  identifier: {
    type: "arXiv" | "DOI";
    value: string;
    version?: string;
  };
  items: IdentifierItem[];
  writeItemPayloads: {
    create: any;
    importAttachments: any[];
  };
}

export interface IdentifierLookupOptions {
  downloadPDF?: boolean;
  attachmentDir?: string;
  libraryID?: number;
}

const ARXIV_CATEGORY_LABELS: Record<string, string> = {
  cs: "Computer Science",
  "cs.LG": "Machine Learning",
};

export async function lookupIdentifier(
  input: string,
  options: IdentifierLookupOptions = {},
): Promise<IdentifierLookupResult> {
  const identifier = extractIdentifier(input);
  let item: IdentifierItem;

  if (identifier.type === "arXiv") {
    item = await lookupArXiv(identifier.value);
  } else {
    item = await lookupDOI(identifier.value);
  }

  if (options.downloadPDF === true) {
    await downloadPDFAttachments(
      item,
      options.attachmentDir || getDefaultAttachmentDir(),
    );
  }

  return {
    input,
    identifier,
    items: [item],
    writeItemPayloads: buildWriteItemPayloads(item, options),
  };
}

export async function addItemByIdentifier(
  input: string,
  options: IdentifierLookupOptions = {},
): Promise<any> {
  const lookup = await lookupIdentifier(input, {
    ...options,
    downloadPDF: options.downloadPDF !== false,
  });
  const lookupItem = lookup.items[0];
  const libraryID = options.libraryID || Zotero.Libraries.userLibraryID;
  const item = new Zotero.Item(lookupItem.itemType as any);
  item.libraryID = libraryID;

  const skippedFields: Array<{ field: string; error: string }> = [];
  for (const [fieldName, value] of Object.entries(itemToFields(lookupItem))) {
    try {
      item.setField(fieldName, String(value));
    } catch (error) {
      skippedFields.push({
        field: fieldName,
        error: String(error),
      });
    }
  }

  if (lookupItem.creators.length) {
    item.setCreators(
      lookupItem.creators.map((creator) => ({
        creatorType: creator.creatorType || "author",
        ...(creator.name
          ? { name: creator.name }
          : {
              firstName: creator.firstName || "",
              lastName: creator.lastName || "",
            }),
      })) as any,
    );
  }

  for (const tag of normalizeTags(lookupItem.tags)) {
    item.addTag(tag, 0);
  }

  await item.saveTx();

  const importedAttachments = [];
  for (const attachment of lookupItem.attachments || []) {
    if (attachment.mimeType !== "application/pdf" || !attachment.path) {
      continue;
    }
    try {
      const imported = await Zotero.Attachments.importFromFile({
        file: attachment.path,
        parentItemID: item.id,
        title: attachment.title || "Full Text PDF",
      });
      importedAttachments.push({
        key: imported.key,
        title: imported.getField("title"),
        path: attachment.path,
        sourceURL: attachment.url,
      });
    } catch (error) {
      importedAttachments.push({
        success: false,
        path: attachment.path,
        sourceURL: attachment.url,
        error: String(error),
      });
    }
  }

  return {
    action: "add_item_by_identifier",
    success: true,
    data: {
      itemKey: item.key,
      itemType: lookupItem.itemType,
      title: lookupItem.title,
      creatorsCount: lookupItem.creators.length,
      tagsCount: normalizeTags(lookupItem.tags).length,
      importedAttachments,
      skippedFields,
      dateCreated: item.dateAdded,
    },
    lookup,
    metadata: {
      extractedAt: new Date().toISOString(),
      message: `Item created from identifier ${lookup.identifier.value} (key: ${item.key})`,
    },
  };
}

function extractIdentifier(
  input: string,
): IdentifierLookupResult["identifier"] {
  const text = String(input || "").trim();
  if (!text) {
    throw new Error("No identifier provided");
  }

  const arXiv = extractArXivID(text);
  if (arXiv) {
    return { type: "arXiv", value: arXiv.id, version: arXiv.version };
  }

  const doi = cleanDOI(text);
  if (doi) {
    return { type: "DOI", value: doi };
  }

  throw new Error(`Unsupported identifier: ${text}`);
}

async function lookupArXiv(arXivID: string): Promise<IdentifierItem> {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arXivID)}&max_results=1`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "zotero-mcp-identifier-lookup/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`arXiv lookup failed: HTTP ${response.status}`);
  }

  const atom = await response.text();
  const entry = atom.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) {
    throw new Error(`No arXiv record found for ${arXivID}`);
  }

  return arXivEntryToItem(entry[1], arXivID);
}

async function lookupDOI(doi: string): Promise<IdentifierItem> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const [response, landingURL] = await Promise.all([
    fetch(url, {
      headers: {
        "User-Agent": "zotero-mcp-identifier-lookup/0.1",
      },
    }),
    resolveDOIURL(doi),
  ]);
  if (!response.ok) {
    throw new Error(`Crossref lookup failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  const work = data.message;
  const item: IdentifierItem = {
    itemType: crossrefTypeToZoteroType(work.type),
    title: first(work.title) || "",
    creators: (work.author || []).map((author: any) => ({
      creatorType: "author",
      firstName: author.given || "",
      lastName: author.family || author.name || "",
    })),
    abstractNote: stripTags(work.abstract || ""),
    date: datePartsToZoteroDate(work.issued?.["date-parts"]?.[0] || []),
    DOI: doi,
    url: landingURL || work.URL || `https://doi.org/${doi}`,
    publicationTitle: first(work["container-title"]) || "",
    volume: work.volume || "",
    issue: work.issue || "",
    pages: work.page || "",
    publisher: work.publisher || "",
    libraryCatalog: "Crossref",
    tags: [],
    attachments: [],
  };
  item.attachments = getPDFAttachmentsForDOIItem(item, work);
  return item;
}

async function resolveDOIURL(doi: string): Promise<string> {
  try {
    const response = await fetch(`https://doi.org/${encodeURIComponent(doi)}`, {
      redirect: "manual",
      headers: {
        "User-Agent": "zotero-mcp-identifier-lookup/0.1",
      },
    });
    return response.headers.get("location") || "";
  } catch (_) {
    return "";
  }
}

function getPDFAttachmentsForDOIItem(
  item: IdentifierItem,
  work: any = {},
): IdentifierAttachment[] {
  const attachments: IdentifierAttachment[] = [];
  const ieeeDocumentID = getIEEEDocumentID(item.url);
  for (const link of work.link || []) {
    if (
      !isCrossrefPDFLink(link) ||
      isDuplicateIEEEPDFLink(link, ieeeDocumentID)
    ) {
      continue;
    }
    addPDFAttachment(
      attachments,
      normalizePublisherPDFURL(link.URL, item, work) || link.URL,
    );
  }

  if (ieeeDocumentID) {
    addPDFAttachment(
      attachments,
      `https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=${ieeeDocumentID}&ref=`,
    );
  }

  addPDFAttachment(attachments, getScienceDirectPDFURL(item, work));
  addPDFAttachment(attachments, getSpringerPDFURL(item));
  addPDFAttachment(attachments, getMDPIPDFURL(item, work));

  return attachments;
}

function addPDFAttachment(attachments: IdentifierAttachment[], url: string) {
  if (!url) {
    return;
  }
  if (
    attachments.some(
      (attachment) => canonicalURL(attachment.url) === canonicalURL(url),
    )
  ) {
    return;
  }
  attachments.push({
    title: "Full Text PDF",
    url,
    mimeType: "application/pdf",
  });
}

function isCrossrefPDFLink(link: any): boolean {
  const url = String(link.URL || "");
  const contentType = String(link["content-type"] || "").toLowerCase();
  return (
    contentType === "application/pdf" ||
    /(?:\.pdf(?:[?#]|$)|\/pdf(?:[?#]|$)|\/pdfft(?:[?#]|$))/i.test(url)
  );
}

function isDuplicateIEEEPDFLink(link: any, ieeeDocumentID: string): boolean {
  return !!ieeeDocumentID && /ieee|xplore/i.test(String(link.URL || ""));
}

function normalizePublisherPDFURL(
  url: string,
  item: IdentifierItem,
  work: any,
): string {
  if (/\.mdpi\.com\/.+\/pdf(?:[?#]|$)/i.test(String(url || ""))) {
    return getMDPIPDFURL(item, work);
  }
  return url;
}

function getScienceDirectPDFURL(item: IdentifierItem, work: any): string {
  let pii = getScienceDirectPII(item.url);
  if (!pii) {
    for (const link of work.link || []) {
      pii = getScienceDirectPII(link.URL);
      if (pii) {
        break;
      }
    }
  }
  if (!pii) {
    return "";
  }
  return `https://www.sciencedirect.com/science/article/pii/${pii}/pdfft?isDTMRedir=true&download=true`;
}

function getScienceDirectPII(url?: string): string {
  const match = String(url || "").match(
    /(?:retrieve\/pii\/|science\/article\/pii\/|PII:)([A-Z0-9]+)/i,
  );
  return match ? match[1] : "";
}

function getSpringerPDFURL(item: IdentifierItem): string {
  const doi = String(item.DOI || "");
  if (/^10\.1007\//i.test(doi)) {
    return `https://link.springer.com/content/pdf/${doi}.pdf`;
  }
  if (/^10\.1038\//i.test(doi)) {
    return `https://www.nature.com/articles/${doi.replace(/^10\.1038\//i, "")}.pdf`;
  }
  return "";
}

function getMDPIPDFURL(item: IdentifierItem, work: any): string {
  if (!isMDPIItem(item, work)) {
    return "";
  }

  const journal = first(work["short-container-title"]) || item.publicationTitle;
  const volume = work.volume || item.volume;
  const articleNumber = work.page || work["article-number"] || item.pages;
  if (!journal || !volume || !articleNumber) {
    return "";
  }

  const journalSlug = slugifyJournal(journal);
  const articleID = String(articleNumber).replace(/\D/g, "").padStart(5, "0");
  if (!journalSlug || !articleID) {
    return "";
  }

  const stem = `${journalSlug}-${volume}-${articleID}`;
  return `https://mdpi-res.com/d_attachment/${journalSlug}/${stem}/article_deploy/${stem}-v2.pdf`;
}

function isMDPIItem(item: IdentifierItem, work: any): boolean {
  return (
    /MDPI/i.test(String(work.publisher || "")) ||
    /\.mdpi\.com\//i.test(String(item.url || ""))
  );
}

function slugifyJournal(journal: string): string {
  return String(journal || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalURL(url?: string): string {
  return String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function getIEEEDocumentID(url?: string): string {
  const match = String(url || "").match(
    /ieeexplore\.ieee\.org\/document\/(\d+)/i,
  );
  return match ? match[1] : "";
}

async function downloadPDFAttachments(
  item: IdentifierItem,
  attachmentDir: string,
) {
  const pdfAttachments = (item.attachments || []).filter(
    (attachment) => attachment.mimeType === "application/pdf",
  );
  if (!pdfAttachments.length) {
    return;
  }

  await IOUtils.makeDirectory(attachmentDir, {
    createAncestors: true,
    ignoreExisting: true,
  });
  for (const attachment of pdfAttachments) {
    try {
      const response = await fetch(attachment.url, {
        headers: {
          Accept: "application/pdf,*/*;q=0.8",
          "User-Agent": "zotero-mcp-identifier-lookup/0.1",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isPDF(bytes)) {
        const contentType =
          response.headers.get("content-type") || "unknown content type";
        throw new Error(`not a PDF (${contentType})`);
      }

      const filePath = PathUtils.join(
        attachmentDir,
        safeFileName(`${item.title || item.DOI || "attachment"}.pdf`),
      );
      await IOUtils.write(filePath, bytes);
      attachment.path = filePath;
      attachment.size = bytes.byteLength;
      attachment.downloadStatus = "downloaded";
    } catch (error) {
      attachment.downloadStatus = "failed";
      attachment.downloadError =
        error instanceof Error ? error.message : String(error);
    }
  }
}

function isPDF(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function safeFileName(fileName: string): string {
  return fileName
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getDefaultAttachmentDir(): string {
  return PathUtils.join(PathUtils.tempDir, "zotero-mcp-identifier-lookup");
}

function datePartsToZoteroDate(parts: number[]): string {
  if (!parts.length) {
    return "";
  }
  const [year, month, day] = parts;
  if (year && month && day) {
    return `${month}/${day}/${year}`;
  }
  if (year && month) {
    return `${month}/${year}`;
  }
  return String(year || "");
}

function arXivEntryToItem(entry: string, requestedID: string): IdentifierItem {
  const versionedURL =
    getText(entry, "id") || `http://arxiv.org/abs/${requestedID}`;
  const versionedID = extractArXivID(versionedURL)?.id || requestedID;
  const arXivURL = versionedURL.replace(/v\d+$/, "");
  const articleID =
    (arXivURL.match(/\/abs\/(.+)$/) || [])[1] ||
    versionedID.replace(/v\d+$/, "");
  const version = (versionedID.match(/v(\d+)$/) || [])[1];
  const pdfURL = versionedURL.replace("/abs/", "/pdf/");
  const primaryCategory =
    getAttribute(entry, "arxiv:primary_category", "term") ||
    getAttribute(entry, "primary_category", "term") ||
    "";
  const primaryField = primaryCategory
    .replace(/^.+?:/, "")
    .replace(/\..+$/, "");
  const doi = getText(entry, "arxiv:doi") || getText(entry, "doi");
  let extra = `arXiv:${articleID}`;
  if (primaryField) {
    extra += ` [${primaryField}]`;
  }
  if (version) {
    extra += `\nversion: ${version}`;
  }

  return {
    itemType: "preprint",
    title: normalizeText(getText(entry, "title")),
    creators: getAuthorNames(entry).map((name) => cleanAuthor(name)),
    abstractNote: normalizeText(getText(entry, "summary")),
    date: isoDate(getText(entry, "updated") || getText(entry, "published")),
    DOI: doi || `10.48550/arXiv.${articleID}`,
    url: arXivURL,
    repository: "arXiv",
    archiveID: `arXiv:${articleID}`,
    number: `arXiv:${articleID}`,
    extra,
    libraryCatalog: "arXiv.org",
    tags: getCategories(entry)
      .map(formatArXivCategory)
      .map((tag) => ({ tag })),
    attachments: [
      {
        title: "Preprint PDF",
        url: pdfURL,
        mimeType: "application/pdf",
      },
      {
        title: "Snapshot",
        url: arXivURL,
        mimeType: "text/html",
      },
    ],
  };
}

function buildWriteItemPayloads(
  item: IdentifierItem,
  options: IdentifierLookupOptions,
) {
  const create: any = {
    action: "create",
    itemType: item.itemType,
    fields: itemToFields(item),
    creators: item.creators,
    tags: normalizeTags(item.tags),
  };
  if (options.libraryID != null) {
    create.libraryID = options.libraryID;
  }

  const importAttachments = (item.attachments || [])
    .filter(
      (attachment) =>
        attachment.mimeType === "application/pdf" && attachment.path,
    )
    .map((attachment) => ({
      action: "import",
      parentItemKey: "<created-item-key>",
      filePath: attachment.path,
      title: attachment.title || "Full Text PDF",
      ...(options.libraryID != null ? { libraryID: options.libraryID } : {}),
    }));

  return {
    create,
    importAttachments,
  };
}

function itemToFields(item: IdentifierItem): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const field of [
    "title",
    "abstractNote",
    "date",
    "DOI",
    "url",
    "publicationTitle",
    "volume",
    "issue",
    "pages",
    "publisher",
    "repository",
    "archiveID",
    "number",
    "extra",
  ]) {
    const value = item[field as keyof IdentifierItem];
    if (typeof value === "string" && value) {
      fields[field] = value;
    }
  }
  return fields;
}

function normalizeTags(tags: Array<string | { tag: string }>): string[] {
  return tags
    .map((tag) => (typeof tag === "string" ? tag : tag.tag))
    .filter(Boolean);
}

function extractArXivID(text: string): { id: string; version?: string } | null {
  let match = text.match(/arxiv\.org\/(?:abs|pdf)\/([^?#\s]+)/i);
  let id = match ? match[1] : null;
  if (!id) {
    match = text.match(
      /(?:^|\s)arXiv:([A-Za-z.-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/i,
    );
    if (match) {
      id = match[1] + (match[2] || "");
    }
  }
  if (!id) {
    match = text.match(
      /(?:^|\s)([A-Za-z.-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?(?:\s|$)/i,
    );
    if (match) {
      id = match[1] + (match[2] || "");
    }
  }
  if (!id) {
    return null;
  }
  id = id.replace(/\.pdf$/i, "").replace(/\/$/, "");
  const version = (id.match(/v(\d+)$/) || [])[1];
  return { id, version };
}

function cleanDOI(text: string): string | null {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch (_) {
    // Keep original text if it is not URI-encoded cleanly.
  }
  const match = decoded.match(
    /10(?:\.[0-9]{4,})?\/[^\s<>"']*[^\s<>"'.,;:)\]}]/,
  );
  return match ? match[0] : null;
}

function getText(xml: string, tagName: string): string {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? decodeXML(match[1]) : "";
}

function getAttribute(xml: string, tagName: string, attrName: string): string {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttr = attrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<${escapedTag}[^>]*\\s${escapedAttr}="([^"]*)"`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? decodeXML(match[1]) : "";
}

function getAuthorNames(entry: string): string[] {
  return [
    ...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi),
  ]
    .map((match) => normalizeText(decodeXML(match[1])))
    .filter(Boolean);
}

function getCategories(entry: string): string[] {
  return [...entry.matchAll(/<category[^>]*\sterm="([^"]+)"/gi)]
    .map((match) => decodeXML(match[1]))
    .filter(Boolean);
}

function formatArXivCategory(term: string): string {
  const mainCategory = term.split(".")[0];
  if (
    mainCategory !== term &&
    ARXIV_CATEGORY_LABELS[mainCategory] &&
    ARXIV_CATEGORY_LABELS[term]
  ) {
    return `${ARXIV_CATEGORY_LABELS[mainCategory]} - ${ARXIV_CATEGORY_LABELS[term]}`;
  }
  return ARXIV_CATEGORY_LABELS[term] || term;
}

function cleanAuthor(name: string): CreatorData {
  if (name.includes(",")) {
    const [lastName, ...rest] = name.split(",");
    return {
      creatorType: "author",
      firstName: rest.join(",").trim(),
      lastName: lastName.trim(),
    };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return {
      creatorType: "author",
      lastName: parts[0],
    };
  }
  return {
    creatorType: "author",
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function normalizeText(text: string): string {
  return decodeXML(text).replace(/\s+/g, " ").trim();
}

function decodeXML(text: string): string {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function isoDate(value: string): string {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function first(value: any): string {
  return Array.isArray(value) ? value[0] : value;
}

function stripTags(value: string): string {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function crossrefTypeToZoteroType(type: string): string {
  if (type === "book" || type === "monograph") {
    return "book";
  }
  if (type === "book-chapter") {
    return "bookSection";
  }
  if (type === "posted-content") {
    return "preprint";
  }
  return "journalArticle";
}
