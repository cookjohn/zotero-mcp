import { expect } from "chai";
import { readZoteroCachedFulltext } from "../src/modules/zoteroFulltextCache.ts";

const CACHE_TEXT = "第1章 引言\n中文正文，混杂 English 与数字 123。";

function stubGlobals(zotero: unknown): void {
  (globalThis as Record<string, unknown>).ztoolkit = { log: () => undefined };
  (globalThis as Record<string, unknown>).Zotero = zotero;
}

describe("readZoteroCachedFulltext", function () {
  // These stubs replace real globals. Under `zotero-plugin test` they are the
  // live Zotero/IOUtils objects the test runner itself depends on, so they
  // must be put back after every test or the run hangs.
  const STUBBED = ["ztoolkit", "Zotero", "IOUtils"] as const;
  let saved: Array<PropertyDescriptor | undefined> = [];

  beforeEach(function () {
    saved = STUBBED.map((name) =>
      Object.getOwnPropertyDescriptor(globalThis, name),
    );
  });

  afterEach(function () {
    STUBBED.forEach((name, i) => {
      const descriptor = saved[i];
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    });
  });

  it("reads the .zotero-ft-cache file used by Zotero 9/10", async function () {
    const calls: string[] = [];
    stubGlobals({
      Fulltext: {
        getItemCacheFile: () => ({ path: "/storage/ABCD/.zotero-ft-cache" }),
      },
      File: {
        getContentsAsync: async (path: string) => {
          calls.push(path);
          return CACHE_TEXT;
        },
      },
    });
    (globalThis as Record<string, unknown>).IOUtils = { exists: async () => true };

    const content = await readZoteroCachedFulltext({ key: "ABCD", id: 42 });

    expect(content).to.equal(CACHE_TEXT);
    expect(calls).to.deep.equal(["/storage/ABCD/.zotero-ft-cache"]);
  });

  it("falls back to getItemContent on older Zotero versions", async function () {
    stubGlobals({
      Fulltext: {
        getItemContent: async (id: number) =>
          id === 42 ? { content: CACHE_TEXT } : null,
      },
      File: {},
    });
    (globalThis as Record<string, unknown>).IOUtils = { exists: async () => false };

    const content = await readZoteroCachedFulltext({ key: "ABCD", id: 42 });

    expect(content).to.equal(CACHE_TEXT);
  });

  it("returns null when the attachment has not been indexed", async function () {
    stubGlobals({ Fulltext: {}, File: {} });
    (globalThis as Record<string, unknown>).IOUtils = { exists: async () => false };

    const content = await readZoteroCachedFulltext({ key: "ABCD", id: 42 });

    expect(content).to.equal(null);
  });

  it("treats an empty cache file as missing", async function () {
    stubGlobals({
      Fulltext: {
        getItemCacheFile: () => ({ path: "/storage/ABCD/.zotero-ft-cache" }),
      },
      File: { getContentsAsync: async () => "   \n" },
    });
    (globalThis as Record<string, unknown>).IOUtils = { exists: async () => true };

    const content = await readZoteroCachedFulltext({ key: "ABCD", id: 42 });

    expect(content).to.equal(null);
  });

  it("returns null instead of throwing when reading the cache fails", async function () {
    stubGlobals({
      Fulltext: {
        getItemCacheFile: () => ({ path: "/storage/ABCD/.zotero-ft-cache" }),
      },
      File: {
        getContentsAsync: async () => {
          throw new Error("NS_ERROR_FILE_NOT_FOUND");
        },
      },
    });
    (globalThis as Record<string, unknown>).IOUtils = { exists: async () => true };

    const content = await readZoteroCachedFulltext({ key: "ABCD", id: 42 });

    expect(content).to.equal(null);
  });
});
