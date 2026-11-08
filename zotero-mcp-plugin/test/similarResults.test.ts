import { expect } from "chai";
import { bestHitPerItem } from "../src/modules/semantic/similarResults.ts";

interface Hit {
  itemKey: string;
  chunkId: number;
  score: number;
}

function hit(itemKey: string, chunkId: number, score: number): Hit {
  return { itemKey, chunkId, score };
}

describe("bestHitPerItem (find_similar ranking)", function () {
  it("returns other items even when the source item owns every top chunk", function () {
    // Regression for #108: with a `topK + 1` window, these two source chunks
    // plus one other chunk filtered down to a single result at best, and to
    // nothing whenever the source occupied the whole window.
    const hits = [
      hit("SRC", 0, 0.99),
      hit("SRC", 1, 0.98),
      hit("SRC", 2, 0.97),
      hit("OTHER", 0, 0.9),
    ];

    const result = bestHitPerItem(hits, "SRC");

    expect(result.map((r) => r.itemKey)).to.deep.equal(["OTHER"]);
  });

  it("keeps only the best chunk per item", function () {
    const hits = [
      hit("A", 0, 0.5),
      hit("A", 1, 0.8),
      hit("B", 0, 0.7),
      hit("A", 2, 0.2),
    ];

    const result = bestHitPerItem(hits, "SRC");

    expect(result.map((r) => [r.itemKey, r.chunkId])).to.deep.equal([
      ["A", 1],
      ["B", 0],
    ]);
  });

  it("sorts by score descending regardless of input order", function () {
    const hits = [hit("A", 0, 0.1), hit("B", 0, 0.9), hit("C", 0, 0.5)];

    const result = bestHitPerItem(hits, "SRC");

    expect(result.map((r) => r.itemKey)).to.deep.equal(["B", "C", "A"]);
  });

  it("returns an empty list when every hit belongs to the source item", function () {
    const hits = [hit("SRC", 0, 0.9), hit("SRC", 1, 0.8)];

    expect(bestHitPerItem(hits, "SRC")).to.deep.equal([]);
  });

  it("drops malformed hits instead of throwing", function () {
    const hits = [null, hit("A", 0, 0.4)];

    const result = bestHitPerItem(hits as Hit[], "SRC");

    expect(result.map((r) => r.itemKey)).to.deep.equal(["A"]);
  });
});
