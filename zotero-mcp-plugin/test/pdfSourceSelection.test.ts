import { expect } from "chai";
import {
  choosePdfSource,
  type PdfSourceInput,
} from "../src/modules/pdfSourceSelection.ts";

const SHORT_CACHE = "第一章 中文正文。".repeat(5);
const LONG_WORKER = "第一章 中文正文。".repeat(40);

function input(overrides: Partial<PdfSourceInput> = {}): PdfSourceInput {
  return {
    cachedText: null,
    cacheComplete: false,
    workerText: null,
    workerError: null,
    fontDataFetchFailures: 0,
    ...overrides,
  };
}

describe("choosePdfSource", function () {
  it("uses a complete cache without considering the worker", function () {
    const decision = choosePdfSource(
      input({ cachedText: SHORT_CACHE, cacheComplete: true, workerText: LONG_WORKER }),
      "ABCD",
    );

    expect(decision?.source).to.equal("zotero_cache");
    expect(decision?.text).to.equal(SHORT_CACHE);
    expect(decision?.warnings).to.deep.equal([]);
  });

  it("keeps the longer worker text when the cache is a partial index", function () {
    const decision = choosePdfSource(
      input({ cachedText: SHORT_CACHE, workerText: LONG_WORKER }),
      "ABCD",
    );

    expect(decision?.source).to.equal("pdf_worker");
    expect(decision?.text).to.equal(LONG_WORKER);
    expect(decision?.warnings).to.deep.equal([]);
  });

  it("prefers a longer partial cache over a shorter worker result", function () {
    const decision = choosePdfSource(
      input({ cachedText: LONG_WORKER, workerText: SHORT_CACHE }),
      "ABCD",
    );

    expect(decision?.source).to.equal("zotero_cache_partial");
    expect(decision?.text).to.equal(LONG_WORKER);
    expect(decision?.warnings.join(" ")).to.contain("only indexed part");
  });

  it("falls back to the partial cache when font assets failed to load", function () {
    const decision = choosePdfSource(
      input({ cachedText: SHORT_CACHE, workerText: LONG_WORKER, fontDataFetchFailures: 3 }),
      "ABCD",
    );

    expect(decision?.source).to.equal("zotero_cache_partial");
    expect(decision?.text).to.equal(SHORT_CACHE);
    expect(decision?.warnings.join(" ")).to.contain("CMap");
  });

  it("falls back to the cache when the worker throws", function () {
    const decision = choosePdfSource(
      input({ cachedText: SHORT_CACHE, workerError: "PDF worker error: boom" }),
      "ABCD",
    );

    expect(decision?.source).to.equal("zotero_cache_partial");
    expect(decision?.warnings.join(" ")).to.contain("boom");
  });

  it("reports a timeout placeholder when neither source is usable", function () {
    const decision = choosePdfSource(
      input({ workerError: "PDF processing timed out after 120000ms" }),
      "ABCD",
    );

    expect(decision?.source).to.equal("pdf_worker_timeout");
    expect(decision?.text).to.contain("timed out");
  });

  it("warns when an unindexed PDF drops font data", function () {
    const decision = choosePdfSource(
      input({ workerText: LONG_WORKER, fontDataFetchFailures: 1 }),
      "ABCD",
    );

    expect(decision?.source).to.equal("pdf_worker");
    expect(decision?.warnings.join(" ")).to.contain("CMap");
  });

  it("returns null when there is no cache and no worker output", function () {
    expect(choosePdfSource(input(), "ABCD")).to.equal(null);
  });
});
