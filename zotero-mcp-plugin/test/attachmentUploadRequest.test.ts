import { expect } from "chai";
import {
  DEFAULT_UPLOAD_MAX_BYTES,
  checkUploadAccess,
  isLoopbackHost,
  isUploadRequestLine,
  validateUploadRequest,
  type UploadRequest,
} from "../src/modules/attachmentUploadRequest.ts";

function request(
  overrides: Partial<UploadRequest> = {},
  query = "parentKey=ABCD2345&fileName=paper.pdf",
): UploadRequest {
  return {
    method: "POST",
    query: new URLSearchParams(query),
    headerText:
      "POST /mcp/attachments?" +
      query +
      " HTTP/1.1\r\n" +
      "Host: 127.0.0.1:23120\r\n" +
      "Content-Type: application/pdf\r\n" +
      "Content-Length: 1234",
    contentLength: 1234,
    peerHost: "127.0.0.1",
    writeEnabled: true,
    maxBytes: DEFAULT_UPLOAD_MAX_BYTES,
    ...overrides,
  };
}

describe("attachment upload request (#115)", function () {
  it("accepts a well-formed loopback upload", function () {
    const v = validateUploadRequest(request());
    expect(v.ok).to.equal(true);
    if (v.ok) {
      expect(v.params).to.deep.equal({
        parentKey: "ABCD2345",
        fileName: "paper.pdf",
        title: undefined,
        contentType: "application/pdf",
        libraryID: undefined,
      });
    }
  });

  it("refuses non-loopback peers even with write enabled", function () {
    for (const host of [
      "100.64.0.5",
      "192.168.1.20",
      "::ffff:10.0.0.1",
      undefined,
    ]) {
      const v = validateUploadRequest(request({ peerHost: host }));
      expect(v.ok, String(host)).to.equal(false);
      if (!v.ok) expect(v.status).to.equal(403);
    }
  });

  it("refuses browser requests that carry an Origin header", function () {
    const r = request();
    r.headerText += "\r\nOrigin: https://evil.example";
    const v = validateUploadRequest(r);
    expect(v.ok).to.equal(false);
    if (!v.ok) expect(v.status).to.equal(403);
  });

  it("is gated by the write switch", function () {
    const v = validateUploadRequest(request({ writeEnabled: false }));
    expect(v.ok).to.equal(false);
    if (!v.ok) {
      expect(v.status).to.equal(403);
      expect(v.error).to.match(/disabled/);
    }
  });

  it("checks access before parameters", function () {
    const v = validateUploadRequest(
      request({ peerHost: "10.0.0.2" }, "fileName=x.pdf"),
    );
    expect(v.ok).to.equal(false);
    if (!v.ok) expect(v.status).to.equal(403);
  });

  it("requires POST", function () {
    const v = validateUploadRequest(request({ method: "GET" }));
    expect(v.ok).to.equal(false);
    if (!v.ok) expect(v.status).to.equal(405);
  });

  it("validates parentKey", function () {
    for (const q of [
      "fileName=a.pdf",
      "parentKey=ABC&fileName=a.pdf",
      "parentKey=ABCD0000&fileName=a.pdf",
    ]) {
      const v = validateUploadRequest(request({}, q));
      expect(v.ok, q).to.equal(false);
      if (!v.ok) expect(v.status).to.equal(400);
    }
  });

  it("refuses file names with path parts", function () {
    for (const name of [
      "../evil.pdf",
      "a/b.pdf",
      "a\\b.pdf",
      "..",
      "",
      "x".repeat(201),
    ]) {
      const q = new URLSearchParams({
        parentKey: "ABCD2345",
        fileName: name,
      }).toString();
      const v = validateUploadRequest(request({}, q));
      expect(v.ok, name).to.equal(false);
      if (!v.ok) expect(v.status).to.equal(400);
    }
  });

  it("enforces the size limit and refuses an empty body", function () {
    const big = validateUploadRequest(
      request({ contentLength: 11, maxBytes: 10 }),
    );
    expect(big.ok).to.equal(false);
    if (!big.ok) expect(big.status).to.equal(413);
    const empty = validateUploadRequest(request({ contentLength: 0 }));
    expect(empty.ok).to.equal(false);
    if (!empty.ok) expect(empty.status).to.equal(400);
  });

  it("passes title, libraryID and drops a generic content type", function () {
    const r = request(
      {},
      "parentKey=abcd2345&fileName=p.pdf&title=Volltext&libraryID=3",
    );
    r.headerText = r.headerText.replace(
      "application/pdf",
      "application/octet-stream",
    );
    const v = validateUploadRequest(r);
    expect(v.ok).to.equal(true);
    if (v.ok) {
      expect(v.params.parentKey).to.equal("ABCD2345");
      expect(v.params.title).to.equal("Volltext");
      expect(v.params.libraryID).to.equal(3);
      expect(v.params.contentType).to.equal(undefined);
    }
  });

  it("recognises the route from the request line only", function () {
    expect(
      isUploadRequestLine(
        "POST /mcp/attachments?parentKey=X HTTP/1.1\r\nHost: a",
      ),
    ).to.equal(true);
    expect(isUploadRequestLine("POST /mcp/attachments HTTP/1.1")).to.equal(
      true,
    );
    expect(
      isUploadRequestLine("POST /mcp HTTP/1.1\r\nX-Path: /mcp/attachments"),
    ).to.equal(false);
    expect(isUploadRequestLine("POST /mcp/attachmentsX HTTP/1.1")).to.equal(
      false,
    );
  });

  it("recognises an absolute request target", function () {
    expect(
      isUploadRequestLine(
        "POST http://127.0.0.1:23120/mcp/attachments?parentKey=X HTTP/1.1",
      ),
    ).to.equal(true);
    expect(
      isUploadRequestLine("POST http://127.0.0.1:23120/mcp HTTP/1.1"),
    ).to.equal(false);
  });

  it("refuses ambiguous framing", function () {
    const base = request().headerText;
    const dup = validateUploadRequest(
      request({ headerText: base + "\r\nContent-Length: 6" }),
    );
    expect(dup.ok).to.equal(false);
    if (!dup.ok) expect(dup.status).to.equal(400);
    const chunked = validateUploadRequest(
      request({ headerText: base + "\r\nTransfer-Encoding: chunked" }),
    );
    expect(chunked.ok).to.equal(false);
    if (!chunked.ok) expect(chunked.status).to.equal(400);
  });

  it("checks access from headers alone, before the body is read", function () {
    const headers = request().headerText;
    expect(checkUploadAccess(headers, "127.0.0.1", true)).to.equal(undefined);
    expect(checkUploadAccess(headers, "192.168.1.20", true)?.status).to.equal(
      403,
    );
    expect(checkUploadAccess(headers, "127.0.0.1", false)?.status).to.equal(
      403,
    );
    expect(
      checkUploadAccess(
        headers + "\r\nOrigin: https://evil.example",
        "127.0.0.1",
        true,
      )?.status,
    ).to.equal(403);
  });

  it("knows loopback addresses", function () {
    expect(isLoopbackHost("127.0.0.1")).to.equal(true);
    expect(isLoopbackHost("127.8.9.10")).to.equal(true);
    expect(isLoopbackHost("::1")).to.equal(true);
    expect(isLoopbackHost("[::1]")).to.equal(true);
    expect(isLoopbackHost("::ffff:127.0.0.1")).to.equal(true);
    expect(isLoopbackHost("0.0.0.0")).to.equal(false);
    expect(isLoopbackHost("128.0.0.1")).to.equal(false);
  });
});
