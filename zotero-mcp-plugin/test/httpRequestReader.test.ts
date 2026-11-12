import { expect } from "chai";
import {
  drainRequestBody,
  readHttpRequest,
  type ByteReader,
} from "../src/modules/httpRequestReader.ts";

const encoder = new TextEncoder();

/**
 * Fake socket that hands out a byte buffer in caller-controlled slices,
 * so a test can place a chunk boundary anywhere - including inside a
 * multibyte UTF-8 sequence, which is what the real bug depended on.
 */
class FakeReader implements ByteReader {
  offset = 0;
  stallsLeft = 0;
  bytes: Uint8Array;
  chunkSize: number;
  stallEvery: number;

  constructor(bytes: Uint8Array, chunkSize: number, stallEvery = 0) {
    this.bytes = bytes;
    this.chunkSize = chunkSize;
    this.stallEvery = stallEvery;
  }

  available(): number {
    // Simulate a socket that has not yet received the next segment.
    if (this.stallEvery > 0 && this.stallsLeft > 0) {
      this.stallsLeft--;
      return 0;
    }
    const remaining = this.bytes.length - this.offset;
    return Math.min(remaining, this.chunkSize);
  }

  readBytes(count: number): Uint8Array {
    const end = Math.min(this.offset + count, this.bytes.length);
    const out = this.bytes.subarray(this.offset, end);
    this.offset = end;
    if (this.stallEvery > 0) this.stallsLeft = this.stallEvery;
    return out;
  }
}

function buildRequest(body: string, path = "/mcp"): Uint8Array {
  const bodyBytes = encoder.encode(body);
  const head = encoder.encode(
    `POST ${path} HTTP/1.1\r\n` +
      `Host: 127.0.0.1:23120\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${bodyBytes.length}\r\n` +
      `\r\n`,
  );
  const out = new Uint8Array(head.length + bodyBytes.length);
  out.set(head, 0);
  out.set(bodyBytes, head.length);
  return out;
}

/**
 * Delivers the header block, then reports an empty socket for a while, then
 * delivers the body. This is the exact shape that reproduced the v1.5.0
 * corruption 100% of the time: it forces the body read loop to execute
 * rather than letting the header-phase read swallow the whole request.
 */
class SplitSegmentReader implements ByteReader {
  head: Uint8Array;
  body: Uint8Array;
  offset = 0;
  gap: number;

  constructor(head: Uint8Array, body: Uint8Array, gap = 3) {
    this.head = head;
    this.body = body;
    this.gap = gap;
  }

  available(): number {
    if (this.offset < this.head.length) return this.head.length - this.offset;
    if (this.gap > 0) {
      this.gap--;
      return 0; // body segment has not arrived yet
    }
    return this.head.length + this.body.length - this.offset;
  }

  readBytes(count: number): Uint8Array {
    const all = new Uint8Array(this.head.length + this.body.length);
    all.set(this.head, 0);
    all.set(this.body, this.head.length);
    const end = Math.min(this.offset + count, all.length);
    const out = all.slice(this.offset, end);
    this.offset = end;
    return out;
  }
}

const noSleep = () => Promise.resolve();

// The regression: an accented body corrupted ~50% of the time depending
// on where TCP happened to split the stream.
const ACCENTED_BODY = JSON.stringify({
  method: "tools/call",
  params: {
    name: "create_collection",
    arguments: { name: "Café Théorie littéraire — révisée" },
  },
});

describe("readHttpRequest", function () {
  describe("body integrity across chunk boundaries", function () {
    it("round-trips a non-ASCII body at every chunk size", async function () {
      // 1 byte at a time guarantees a boundary inside every multibyte sequence.
      for (const chunkSize of [1, 2, 3, 5, 17, 64, 4096]) {
        const raw = buildRequest(ACCENTED_BODY);
        const result = await readHttpRequest(new FakeReader(raw, chunkSize), {
          sleep: noSleep,
        });

        expect(result.complete, `chunk ${chunkSize}`).to.equal(true);
        expect(result.body, `chunk ${chunkSize}`).to.equal(ACCENTED_BODY);
        expect(JSON.parse(result.body)).to.deep.equal(
          JSON.parse(ACCENTED_BODY),
        );
      }
    });

    it("round-trips a body split exactly inside a multibyte sequence", async function () {
      const body = JSON.stringify({ name: "é" });
      const raw = buildRequest(body);
      // Header is a fixed size; walk the boundary through the whole body.
      for (let cut = 1; cut < raw.length; cut++) {
        const reader = new FakeReader(raw, cut);
        const result = await readHttpRequest(reader, { sleep: noSleep });
        expect(result.body, `cut at ${cut}`).to.equal(body);
      }
    });

    it("round-trips 4-byte sequences (emoji / surrogate pairs)", async function () {
      const body = JSON.stringify({ name: "Étude 🧪🔬 données" });
      const raw = buildRequest(body);
      for (const chunkSize of [1, 3, 7, 4096]) {
        const result = await readHttpRequest(new FakeReader(raw, chunkSize), {
          sleep: noSleep,
        });
        expect(result.body, `chunk ${chunkSize}`).to.equal(body);
      }
    });

    it("round-trips CJK bodies", async function () {
      const body = JSON.stringify({ name: "文献管理集合" });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 3), {
        sleep: noSleep,
      });
      expect(result.body).to.equal(body);
    });

    it("round-trips a pure ASCII body (the case that always worked)", async function () {
      const body = JSON.stringify({ name: "Literary Theory" });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 1), {
        sleep: noSleep,
      });
      expect(result.body).to.equal(body);
    });

    it("handles a body larger than one read budget", async function () {
      const body = JSON.stringify({ name: "é".repeat(20000) });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 1500), {
        sleep: noSleep,
      });
      expect(result.complete).to.equal(true);
      expect(result.body).to.equal(body);
    });
  });

  describe("Content-Length accounting", function () {
    it("measures the body in bytes, not UTF-16 code units", async function () {
      const body = JSON.stringify({ name: "café" });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 4096), {
        sleep: noSleep,
      });
      // "café" is 5 chars but 6 bytes; Content-Length is byte-denominated.
      expect(result.contentLength).to.equal(new TextEncoder().encode(body).length);
      expect(result.contentLength).to.be.greaterThan(body.length);
      expect(result.complete).to.equal(true);
    });

    it("does not consume bytes beyond Content-Length", async function () {
      const first = buildRequest(JSON.stringify({ n: "é" }));
      const second = buildRequest(JSON.stringify({ n: "à" }));
      const pipelined = new Uint8Array(first.length + second.length);
      pipelined.set(first, 0);
      pipelined.set(second, first.length);

      const result = await readHttpRequest(new FakeReader(pipelined, 4096), {
        sleep: noSleep,
      });
      // Read-ahead into the next request is allowed, but the body must be cut
      // exactly at Content-Length and the overshoot reported, never folded in.
      expect(result.body).to.equal(JSON.stringify({ n: "é" }));
      expect(result.trailingBytes).to.equal(second.length);
      expect(result.complete).to.equal(true);
    });

    it("stops reading at Content-Length once the body length is known", async function () {
      // Small chunks mean the header phase cannot overshoot; the body phase
      // must then stop dead on the boundary rather than draining the socket.
      const first = buildRequest(JSON.stringify({ n: "é" }));
      const second = buildRequest(JSON.stringify({ n: "à" }));
      const pipelined = new Uint8Array(first.length + second.length);
      pipelined.set(first, 0);
      pipelined.set(second, first.length);

      const result = await readHttpRequest(new FakeReader(pipelined, 8), {
        sleep: noSleep,
      });
      expect(result.body).to.equal(JSON.stringify({ n: "é" }));
      expect(result.trailingBytes).to.equal(0);
      expect(result.totalBytesRead).to.equal(first.length);
    });
  });

  describe("body in its own TCP segment (the v1.5.0 repro)", function () {
    it("round-trips French, CJK and emoji when the body arrives separately", async function () {
      const payloads = [
        JSON.stringify({ name: "Café Théorie littéraire — révisée" }),
        JSON.stringify({ name: "文献管理集合 中文测试 学术研究" }),
        JSON.stringify({ name: "Étude 🧪 données" }),
        JSON.stringify({ name: "Literary Theory" }),
      ];

      for (const payload of payloads) {
        const bodyBytes = encoder.encode(payload);
        const head = encoder.encode(
          `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:23120\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${bodyBytes.length}\r\n\r\n`,
        );
        const result = await readHttpRequest(
          new SplitSegmentReader(head, bodyBytes),
          { sleep: noSleep },
        );

        expect(result.complete, payload).to.equal(true);
        expect(result.body, payload).to.equal(payload);
        expect(() => JSON.parse(result.body)).to.not.throw();
      }
    });
  });

  describe("stalled sockets", function () {
    it("waits out a socket that reports no data between segments", async function () {
      const body = JSON.stringify({ name: "Théorie" });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 4, 2), {
        sleep: noSleep,
      });
      expect(result.complete).to.equal(true);
      expect(result.body).to.equal(body);
    });

    it("reports incompleteness instead of returning a truncated body", async function () {
      const body = JSON.stringify({ name: "Théorie" });
      const raw = buildRequest(body);
      // Drop the last 3 bytes: Content-Length can never be satisfied.
      const truncated = raw.subarray(0, raw.length - 3);
      const result = await readHttpRequest(new FakeReader(truncated, 4096), {
        sleep: noSleep,
        maxWaitAttempts: 3,
      });
      expect(result.complete).to.equal(false);
      expect(result.incompleteReason).to.equal("body-truncated");
      // The caller needs the real figure to report 400 instead of parsing.
      expect(result.bodyBytesRead).to.be.lessThan(result.contentLength);
      expect(result.bodyBytesRead).to.equal(result.contentLength - 3);
    });
  });

  describe("header parsing", function () {
    it("exposes headers separately from the body", async function () {
      const body = JSON.stringify({ name: "Mcp-Session-Id: spoofed" });
      const raw = buildRequest(body);
      const result = await readHttpRequest(new FakeReader(raw, 4096), {
        sleep: noSleep,
      });
      // A header lookup must not be satisfiable by body content.
      expect(result.headerText).to.not.contain("spoofed");
      expect(result.headerText.split("\r\n")[0]).to.equal("POST /mcp HTTP/1.1");
    });

    it("handles a GET with no body", async function () {
      const raw = encoder.encode(
        "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
      );
      const result = await readHttpRequest(new FakeReader(raw, 4096), {
        sleep: noSleep,
      });
      expect(result.complete).to.equal(true);
      expect(result.contentLength).to.equal(0);
      expect(result.body).to.equal("");
    });

    it("returns empty for a connection that sends nothing", async function () {
      const result = await readHttpRequest(
        new FakeReader(new Uint8Array(0), 4096),
        { sleep: noSleep, maxWaitAttempts: 2 },
      );
      expect(result.totalBytesRead).to.equal(0);
      expect(result.headerText).to.equal("");
      expect(result.complete).to.equal(false);
    });
  });

  describe("per-request limits (#115)", function () {
    function binaryRequest(size: number, path = "/mcp/attachments?parentKey=ABCD2345&fileName=a.pdf"): { raw: Uint8Array; body: Uint8Array } {
      const body = new Uint8Array(size);
      // Every byte value, including invalid UTF-8 lead bytes.
      for (let i = 0; i < size; i++) body[i] = (i * 31 + 7) & 0xff;
      const head = encoder.encode(
        `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1:23120\r\n` +
          `Content-Type: application/pdf\r\nContent-Length: ${size}\r\n\r\n`,
      );
      const raw = new Uint8Array(head.length + body.length);
      raw.set(head, 0);
      raw.set(body, head.length);
      return { raw, body };
    }

    it("raises the cap for a route and returns the body bytes untouched", async function () {
      const { raw, body } = binaryRequest(3 * 1024 * 1024 + 5);
      const result = await readHttpRequest(new FakeReader(raw, 65536), {
        sleep: noSleep,
        maxRequestSize: 1024 * 1024,
        limitsForHeaders: () => ({ maxRequestSize: 4 * 1024 * 1024, rawBody: true }),
      });
      expect(result.complete).to.equal(true);
      expect(result.body).to.equal("");
      expect(result.bodyBytes.length).to.equal(body.length);
      expect(Buffer.from(result.bodyBytes).equals(Buffer.from(body))).to.equal(true);
    });

    it("stops before the body when the declared length exceeds the cap", async function () {
      const { raw } = binaryRequest(2 * 1024 * 1024);
      const reader = new FakeReader(raw, 4096);
      const result = await readHttpRequest(reader, {
        sleep: noSleep,
        maxRequestSize: 1024 * 1024,
      });
      expect(result.complete).to.equal(false);
      expect(result.incompleteReason).to.equal("too-large");
      // Only the header chunk was consumed, not a megabyte of body.
      expect(reader.offset).to.be.lessThan(8192);
    });

    it("keeps the default cap when the hook returns nothing", async function () {
      const { raw } = binaryRequest(1024 * 1024 + 1, "/mcp");
      const result = await readHttpRequest(new FakeReader(raw, 65536), {
        sleep: noSleep,
        limitsForHeaders: () => undefined,
      });
      expect(result.incompleteReason).to.equal("too-large");
    });

    it("still decodes and exposes bodyBytes for normal JSON requests", async function () {
      const raw = buildRequest(ACCENTED_BODY);
      const result = await readHttpRequest(new FakeReader(raw, 7), { sleep: noSleep });
      expect(result.body).to.equal(ACCENTED_BODY);
      expect(result.bodyBytes.length).to.equal(encoder.encode(ACCENTED_BODY).length);
    });

    it("tolerates longer stalls when the route asks for it", async function () {
      const { raw, body } = binaryRequest(20000);
      const head = raw.subarray(0, raw.length - body.length);
      const reader = new SplitSegmentReader(head, body, 120);
      const result = await readHttpRequest(reader, {
        sleep: noSleep,
        maxWaitAttempts: 50,
        limitsForHeaders: () => ({ maxWaitAttempts: 1000, rawBody: true }),
      });
      expect(result.complete).to.equal(true);
      expect(result.bodyBytes.length).to.equal(20000);
    });
  });

  describe("drainRequestBody", function () {
    /** Clock that advances by `step` ms on every sleep, like a slow sender. */
    function fakeClock(step: number) {
      let t = 0;
      return {
        now: () => t,
        sleep: () => {
          t += step;
          return Promise.resolve();
        },
      };
    }

    it("stops at the announced remainder and leaves later bytes unread", async function () {
      const reader = new FakeReader(new Uint8Array(10000), 4096);
      const clock = fakeClock(1);
      const discarded = await drainRequestBody(reader, { remainingBytes: 6000, ...clock });
      expect(discarded).to.equal(6000);
      expect(reader.offset).to.equal(6000);
    });

    it("keeps reading a slow but steady sender past the old 5 s window", async function () {
      // 20 chunks, one per simulated second: the body arrives over 20 s.
      const reader = new FakeReader(new Uint8Array(20 * 1000), 1000);
      const clock = fakeClock(1000);
      const discarded = await drainRequestBody(reader, {
        remainingBytes: 20 * 1000,
        quietMs: 1500,
        maxMs: 60000,
        ...clock,
      });
      expect(discarded).to.equal(20 * 1000);
    });

    it("gives up after maxMs even if the peer keeps sending", async function () {
      const reader = new FakeReader(new Uint8Array(100 * 1000), 1000);
      const clock = fakeClock(1000);
      const discarded = await drainRequestBody(reader, {
        remainingBytes: 100 * 1000,
        quietMs: 1500,
        maxMs: 10000,
        ...clock,
      });
      expect(discarded).to.be.below(100 * 1000);
      expect(discarded).to.be.at.most(11 * 1000);
    });

    it("stops once the peer goes quiet", async function () {
      const reader = new FakeReader(new Uint8Array(3000), 1000);
      const clock = fakeClock(100);
      const discarded = await drainRequestBody(reader, {
        remainingBytes: 1024 * 1024,
        quietMs: 500,
        ...clock,
      });
      expect(discarded).to.equal(3000);
    });
  });
});
