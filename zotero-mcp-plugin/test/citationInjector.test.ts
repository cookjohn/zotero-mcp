/**
 * Unit tests for citationInjector pure functions.
 *
 * These tests run under plain Node.js Mocha — no Zotero runtime needed.
 * Only the functions in citationInjector.pure.ts are tested here; the full
 * injectCitations() function requires a running Zotero instance.
 *
 * Run: npm test
 */

import { expect } from "chai";
import {
  parseZciteTag,
  formatCitationText,
  generateCitationFieldCode,
  validateDocxPath,
  xmlEscape,
  type ZciteTag,
  type CSLItem,
} from "../src/modules/citationInjector.pure.js";

// ─── xmlEscape ────────────────────────────────────────────────────────────────

describe("xmlEscape", () => {
  it("escapes & < > \"", () => {
    expect(xmlEscape('a & b < c > d "e"')).to.equal(
      "a &amp; b &lt; c &gt; d &quot;e&quot;",
    );
  });

  it("leaves safe characters unchanged", () => {
    expect(xmlEscape("hello world 123")).to.equal("hello world 123");
  });

  it("escapes & before < so &lt; is not double-escaped", () => {
    // Ensures we don't turn &lt; into &amp;lt;
    const input = "&lt;";
    const result = xmlEscape(input);
    expect(result).to.equal("&amp;lt;");
  });
});

// ─── parseZciteTag ────────────────────────────────────────────────────────────

describe("parseZciteTag", () => {
  it("parses a single key (key attribute)", () => {
    const tag = parseZciteTag("&lt;zcite key=&quot;ABC123&quot;/&gt;");
    expect(tag.keys).to.deep.equal(["ABC123"]);
    expect(tag.locator).to.be.undefined;
    expect(tag.prefix).to.be.undefined;
  });

  it("parses multiple keys (keys attribute, comma-separated)", () => {
    const tag = parseZciteTag("&lt;zcite keys=&quot;A1,B2,C3&quot;/&gt;");
    expect(tag.keys).to.deep.equal(["A1", "B2", "C3"]);
  });

  it("parses locator, prefix, suffix, num", () => {
    const raw =
      "&lt;zcite key=&quot;K1&quot; locator=&quot;5&quot; prefix=&quot;see&quot; suffix=&quot;table 1&quot; num=&quot;3&quot;/&gt;";
    const tag = parseZciteTag(raw);
    expect(tag.keys).to.deep.equal(["K1"]);
    expect(tag.locator).to.equal("5");
    expect(tag.prefix).to.equal("see");
    expect(tag.suffix).to.equal("table 1");
    expect(tag.num).to.equal(3);
  });

  it("does NOT double-unescape &amp;quot; — critical order check", () => {
    // If &amp; were replaced before &quot;, then &amp;quot; → &quot; → "
    // (dropping the literal & in the attribute value).
    // Correct order: &amp;quot; stays as &quot; (one unescape step only).
    const raw = "&lt;zcite key=&quot;AB&amp;CD&quot;/&gt;";
    const tag = parseZciteTag(raw);
    // After correct unescaping: key="AB&CD"
    expect(tag.keys).to.deep.equal(["AB&CD"]);
  });

  it("preserves rawEscaped verbatim", () => {
    const raw = "&lt;zcite key=&quot;XYZ&quot;/&gt;";
    expect(parseZciteTag(raw).rawEscaped).to.equal(raw);
  });
});

// ─── formatCitationText ───────────────────────────────────────────────────────

describe("formatCitationText", () => {
  const singleAuthor: CSLItem = {
    id: "K1",
    type: "article-journal",
    author: [{ family: "Spira", given: "A" }],
    issued: { "date-parts": [[2007]] },
  };

  const twoAuthors: CSLItem = {
    id: "K2",
    type: "article-journal",
    author: [
      { family: "Spira", given: "A" },
      { family: "Lenburg", given: "M" },
    ],
    issued: { "date-parts": [[2009]] },
  };

  const manyAuthors: CSLItem = {
    id: "K3",
    type: "article-journal",
    author: [
      { family: "Beane", given: "J" },
      { family: "Spira", given: "A" },
      { family: "Lenburg", given: "M" },
    ],
    issued: { "date-parts": [[2011]] },
  };

  const noAuthor: CSLItem = {
    id: "K4",
    type: "report",
    title: "Lung Cancer Report 2020",
    issued: { "date-parts": [[2020]] },
  };

  it("formats single author, APA style", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K1"] };
    expect(formatCitationText(tag, [singleAuthor], "apa")).to.equal(
      "(Spira, 2007)",
    );
  });

  it("formats two authors with &", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K2"] };
    expect(formatCitationText(tag, [twoAuthors], "apa")).to.equal(
      "(Spira & Lenburg, 2009)",
    );
  });

  it("formats 3+ authors as et al.", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K3"] };
    expect(formatCitationText(tag, [manyAuthors], "apa")).to.equal(
      "(Beane et al., 2011)",
    );
  });

  it("falls back to title excerpt when no authors", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K4"] };
    const result = formatCitationText(tag, [noAuthor], "apa");
    expect(result).to.match(/^\("/);
    expect(result).to.include("2020");
  });

  it("formats multiple items in one citation", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K1", "K2"] };
    const result = formatCitationText(tag, [singleAuthor, twoAuthors], "apa");
    expect(result).to.equal("(Spira, 2007; Spira & Lenburg, 2009)");
  });

  it("applies locator", () => {
    const tag: ZciteTag = {
      rawEscaped: "",
      keys: ["K1"],
      locator: "42",
    };
    expect(formatCitationText(tag, [singleAuthor], "apa")).to.equal(
      "(Spira, 2007, p. 42)",
    );
  });

  it("applies prefix and suffix", () => {
    const tag: ZciteTag = {
      rawEscaped: "",
      keys: ["K1"],
      prefix: "see",
      suffix: "table 1",
    };
    expect(formatCitationText(tag, [singleAuthor], "apa")).to.equal(
      "(see Spira, 2007, table 1)",
    );
  });

  it("formats IEEE numbered style using num", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K1"], num: 3 };
    expect(formatCitationText(tag, [singleAuthor], "ieee")).to.equal("[3]");
  });

  it("formats Vancouver numbered style using num", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K1"], num: 1 };
    expect(formatCitationText(tag, [singleAuthor], "vancouver")).to.equal("[1]");
  });

  it("uses [?] placeholder for numbered style when num is missing", () => {
    const tag: ZciteTag = { rawEscaped: "", keys: ["K1"] };
    expect(formatCitationText(tag, [singleAuthor], "ieee")).to.equal("[?]");
  });

  it("handles missing year with n.d.", () => {
    const noDate: CSLItem = { id: "K5", type: "document", author: [{ family: "Smith" }] };
    const tag: ZciteTag = { rawEscaped: "", keys: ["K5"] };
    expect(formatCitationText(tag, [noDate], "apa")).to.equal("(Smith, n.d.)");
  });
});

// ─── validateDocxPath ─────────────────────────────────────────────────────────

import nodePath from "path";

const pathModule = {
  isAbsolute: nodePath.isAbsolute.bind(nodePath),
  normalize: nodePath.normalize.bind(nodePath),
  basename: nodePath.basename.bind(nodePath),
};

describe("validateDocxPath", () => {
  it("accepts a valid absolute .docx path", () => {
    expect(() =>
      validateDocxPath("/Users/marc/Documents/paper.docx", pathModule),
    ).not.to.throw();
  });

  it("rejects empty string", () => {
    expect(() => validateDocxPath("", pathModule)).to.throw("required");
  });

  it("rejects relative paths", () => {
    expect(() =>
      validateDocxPath("Documents/paper.docx", pathModule),
    ).to.throw("absolute");
  });

  it("rejects non-.docx extensions", () => {
    expect(() =>
      validateDocxPath("/Users/marc/paper.pdf", pathModule),
    ).to.throw(".docx");
  });

  it("rejects _cited.docx output files", () => {
    expect(() =>
      validateDocxPath("/Users/marc/paper_cited.docx", pathModule),
    ).to.throw("_cited.docx");
  });

  it("rejects paths with .. traversal after normalization", () => {
    // Construct a path that normalize() changes and introduces ..
    // We stub normalize to simulate traversal detection
    const traversalPath = {
      isAbsolute: () => true,
      normalize: (_p: string) => "/etc/passwd.docx/../evil",
      basename: () => "test.docx",
    };
    expect(() =>
      validateDocxPath("/some/path/test.docx", traversalPath),
    ).to.throw("traversal");
  });
});

// ─── generateCitationFieldCode ────────────────────────────────────────────────

describe("generateCitationFieldCode", () => {
  const item: CSLItem = {
    id: "K1",
    type: "article-journal",
    title: "Airway Gene Expression",
    author: [{ family: "Spira", given: "A" }],
    issued: { "date-parts": [[2007]] },
  };

  const tag: ZciteTag = { rawEscaped: "", keys: ["K1"] };

  it("produces field code with begin/separate/end fldChar elements", () => {
    const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
    expect(code).to.include('w:fldCharType="begin"');
    expect(code).to.include('w:fldCharType="separate"');
    expect(code).to.include('w:fldCharType="end"');
  });

  it("includes ADDIN ZOTERO_ITEM in instrText", () => {
    const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
    expect(code).to.include("ADDIN ZOTERO_ITEM CSL_CITATION");
  });

  it("embeds the formatted text as visible content", () => {
    const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
    expect(code).to.include("(Spira, 2007)");
  });

  it("populates uris[] with zotero://select URI (not empty)", () => {
    const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
    // Decode the XML-escaped JSON in instrText to check uris
    const instrMatch = code.match(/&lt;instrText[^>]*&gt;(.+?)&lt;\/instrText&gt;/);
    // URIs are embedded in the JSON inside the field code
    expect(code).to.include("zotero://select/library/items/K1");
  });

  it("produces distinct citationIDs on repeated calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
      // The JSON is XML-escaped in instrText, so quotes appear as &quot;
      const match = code.match(/&quot;citationID&quot;:&quot;([^&]+)&quot;/);
      if (match) ids.add(match[1]);
    }
    // Very unlikely to get fewer than 5 distinct IDs out of 50 calls
    expect(ids.size).to.be.greaterThan(5);
  });

  it("includes locator when tag specifies one", () => {
    const locatorTag: ZciteTag = { rawEscaped: "", keys: ["K1"], locator: "5" };
    const code = generateCitationFieldCode(locatorTag, [item], "(Spira, 2007, p. 5)", 1);
    // JSON is XML-escaped in instrText; quotes appear as &quot;
    expect(code).to.include("&quot;locator&quot;:&quot;5&quot;");
    expect(code).to.include("&quot;label&quot;:&quot;page&quot;");
  });

  it("XML-escapes special characters in the instruction text", () => {
    // The JSON in the instruction will contain double quotes; they must appear
    // as &quot; in the XML attribute context inside instrText
    const code = generateCitationFieldCode(tag, [item], "(Spira, 2007)", 1);
    // instrText content should not contain bare unescaped < or >
    const instrOpen = code.indexOf("<w:instrText");
    const instrClose = code.indexOf("</w:instrText>");
    const instrContent = code.slice(instrOpen, instrClose);
    expect(instrContent).not.to.match(/<(?!w:instrText)/);
  });
});

// ─── Preprocessing regex (run splitting) ─────────────────────────────────────

describe("Preprocessing regex: split multi-zcite runs", () => {
  // This regex is defined inline in injectCitations(). Test it independently.
  const runWithZcite =
    /(<w:r[^>]*>(?:<w:rPr>(?:(?!<\/w:rPr>).)*?<\/w:rPr>)?<w:t[^>]*>)([^<]*(?:&lt;zcite[^<>]*?\/&gt;[^<]*)+)(<\/w:t><\/w:r>)/g;

  function splitRun(xml: string): string {
    return xml.replace(
      runWithZcite,
      (_m: string, openRun: string, content: string, closeRun: string) => {
        const parts = content.split(/(&lt;zcite[^<>]*?\/&gt;)/);
        return parts
          .filter((p: string) => p !== "")
          .map((p: string) => `${openRun}${p}${closeRun}`)
          .join("");
      },
    );
  }

  it("splits a run containing two zcite tags into two runs", () => {
    const xml =
      `<w:r><w:t>&lt;zcite key=&quot;A1&quot;/&gt;&lt;zcite key=&quot;B2&quot;/&gt;</w:t></w:r>`;
    const result = splitRun(xml);
    expect(result).to.include("&lt;zcite key=&quot;A1&quot;/&gt;");
    expect(result).to.include("&lt;zcite key=&quot;B2&quot;/&gt;");
    // The two tags should now be in separate <w:r> elements
    expect(result.match(/<w:r>/g)?.length).to.equal(2);
  });

  it("handles <w:r> with attributes (e.g. w:rsidR)", () => {
    const xml =
      `<w:r w:rsidR="008D0167"><w:t>&lt;zcite key=&quot;A1&quot;/&gt;&lt;zcite key=&quot;B2&quot;/&gt;</w:t></w:r>`;
    const result = splitRun(xml);
    expect(result.match(/<w:r w:rsidR="008D0167">/g)?.length).to.equal(2);
  });

  it("leaves a run with a single zcite tag unchanged (no split needed)", () => {
    const xml = `<w:r><w:t>&lt;zcite key=&quot;A1&quot;/&gt;</w:t></w:r>`;
    const result = splitRun(xml);
    // Still one run
    expect(result.match(/<w:r>/g)?.length).to.equal(1);
  });

  it("does not greedily match across two separate runs", () => {
    // Two separate runs should not be merged by the regex
    const xml =
      `<w:r><w:t>&lt;zcite key=&quot;A1&quot;/&gt;</w:t></w:r>` +
      `<w:r><w:t>&lt;zcite key=&quot;B2&quot;/&gt;</w:t></w:r>`;
    const result = splitRun(xml);
    // No change expected — they're already separate
    expect(result).to.equal(xml);
  });
});
