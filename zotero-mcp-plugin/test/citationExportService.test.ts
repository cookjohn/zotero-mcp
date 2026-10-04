import { CitationExportService } from "../src/modules/citationExportService";

declare const expect: Chai.ExpectStatic;

const QUICK_COPY_PREF = "export.quickCopy.setting";
const APA_STYLE = "http://www.zotero.org/styles/apa";

function installFakeItem(itemKey: string): () => void {
  const items = Zotero.Items as any;
  const original = items.getByLibraryAndKeyAsync;
  const fakeItem = {
    key: itemKey,
    isAttachment: () => false,
    isNote: () => false,
  };

  items.getByLibraryAndKeyAsync = async (
    libraryID: number,
    requestedKey: string,
  ) => {
    if (requestedKey === itemKey) {
      return fakeItem;
    }
    return original.call(items, libraryID, requestedKey);
  };

  return () => {
    items.getByLibraryAndKeyAsync = original;
  };
}

describe("CitationExportService", function () {
  let previousZtoolkit: any;

  beforeEach(function () {
    previousZtoolkit = (globalThis as any).ztoolkit;
    (globalThis as any).ztoolkit = { log: () => undefined };
  });

  afterEach(function () {
    (globalThis as any).ztoolkit = previousZtoolkit;
  });

  it("keeps the original Better BibTeX export flow", async function () {
    const service = new CitationExportService();
    const calls: Array<{ method: string; params: any[] }> = [];

    (service as any).bbtRpc = async (method: string, params: any[]) => {
      calls.push({ method, params });
      if (method === "api.ready") {
        return { betterbibtex: "test", zotero: "7" };
      }
      if (method === "item.citationkey") {
        return { "12:ABCD1234": "Doe2026" };
      }
      if (method === "item.export") {
        return "@article{Doe2026, title={Example}}";
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    };

    const result = await service.exportBibliography({
      itemKeys: ["ABCD1234"],
      format: "biblatex",
      libraryID: 12,
    });

    expect(calls).to.deep.equal([
      { method: "api.ready", params: [] },
      { method: "item.citationkey", params: [["12:ABCD1234"]] },
      { method: "item.export", params: [["Doe2026"], "Better BibLaTeX", 12] },
    ]);
    expect(result.citationKeys).to.deep.equal(["Doe2026"]);
    expect(result.exportedCount).to.equal(1);
    expect(result.missingKeys).to.equal(undefined);
  });

  it("uses bibliography QuickCopy format and fourth argument for in-text citations", async function () {
    const service = new CitationExportService();
    (service as any).resolveStyle = () => ({
      styleID: APA_STYLE,
      title: "APA",
      hasBibliography: true,
    });

    const itemKey = "ABCD1234";
    const restoreItemLookup = installFakeItem(itemKey);

    const quickCopy = Zotero.QuickCopy as any;
    const original = quickCopy.getContentFromItems;
    let capturedArgs: any[] | undefined;
    quickCopy.getContentFromItems = (...args: any[]) => {
      capturedArgs = args;
      return { text: "(Test, 2026)", html: "<span>(Test, 2026)</span>" };
    };

    try {
      const result = await service.getCitation({
        itemKeys: [itemKey],
        style: APA_STYLE,
        mode: "citation",
        contentType: "text",
      });

      expect(capturedArgs).to.not.equal(undefined);
      expect(capturedArgs![1]).to.equal(`bibliography=${APA_STYLE}`);
      expect(capturedArgs![2]).to.equal(undefined);
      expect(capturedArgs![3]).to.equal(true);
      expect(result.content).to.equal("(Test, 2026)");
    } finally {
      quickCopy.getContentFromItems = original;
      restoreItemLookup();
    }
  });

  it("parses bibliography/html QuickCopy settings instead of falling back to APA", async function () {
    const service = new CitationExportService();
    const itemKey = "EFGH5678";
    const restoreItemLookup = installFakeItem(itemKey);

    const previous = Zotero.Prefs.get(QUICK_COPY_PREF) as any;
    const testStyle = "http://www.zotero.org/styles/review-test-style";
    Zotero.Prefs.set(QUICK_COPY_PREF, `bibliography/html=${testStyle}`);

    const quickCopy = Zotero.QuickCopy as any;
    const original = quickCopy.getContentFromItems;
    let capturedFormat: any;
    quickCopy.getContentFromItems = (_items: any[], format: any) => {
      capturedFormat = format;
      return { text: "text", html: "<span>html</span>" };
    };

    try {
      const result = await service.getCitation({
        itemKeys: [itemKey],
        mode: "bibliography",
        contentType: "html",
      });

      expect(capturedFormat).to.equal(`bibliography=${testStyle}`);
      expect(result.style).to.equal(testStyle);
      expect(result.content).to.equal("<span>html</span>");
    } finally {
      quickCopy.getContentFromItems = original;
      restoreItemLookup();
      if (previous === undefined || previous === null) {
        Zotero.Prefs.clear(QUICK_COPY_PREF);
      } else {
        Zotero.Prefs.set(QUICK_COPY_PREF, previous);
      }
    }
  });
});
