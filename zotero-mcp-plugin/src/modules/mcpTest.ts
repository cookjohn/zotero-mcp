/**
 * Non-mutating MCP integration checks for the in-process Zotero MCP server.
 *
 * These tests intentionally exercise protocol, discovery, read-only citation
 * tooling, and guard-error paths. They must not create items, import
 * attachments, download files, or change the user's Zotero library.
 */

export interface MCPTestResult {
  testName: string;
  status: "PASSED" | "FAILED";
  duration: number;
  result?: any;
  error?: string;
}

interface MCPTestSummary {
  total: number;
  passed: number;
  failed: number;
  successRate: string;
}

interface MCPHTTPResponse {
  status: number;
  statusText: string;
  headers: any;
  body: string;
}

const UPGRADED_READ_TOOLS = [
  "zotero_status",
  "list_export_formats",
  "export_items",
  "format_citation",
  "better_bibtex_status",
];

const UPGRADED_WRITE_TOOLS = [
  "import_by_identifier",
  "attach_url",
  "download_open_access_pdf",
  "attach_file",
];

export async function testMCPIntegration(): Promise<{
  message: string;
  message_zh: string;
  testResults: {
    summary: MCPTestSummary;
    tests: MCPTestResult[];
    timestamp: string;
  };
}> {
  const tests: MCPTestResult[] = [];
  const startTime = Date.now();

  await runTest(
    "MCP initialize",
    async () => {
      const payload = await callMCP({
        jsonrpc: "2.0",
        id: "test-initialize",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "zotero-mcp-test", version: "1.0.0" },
        },
      });

      assert(payload.result?.protocolVersion === "2024-11-05", "bad protocol");
      assert(
        payload.result?.serverInfo?.version === "1.5.0-codex.1",
        `unexpected server version ${payload.result?.serverInfo?.version}`,
      );
      return { serverInfo: payload.result.serverInfo };
    },
    tests,
  );

  await runTest(
    "Tools list annotations and upgraded tools",
    async () => {
      const statusPayload = await callTool("zotero_status", {
        includeSemanticStats: false,
      });
      const status = parseToolContent(statusPayload);
      const toolsPayload = await callMCP({
        jsonrpc: "2.0",
        id: "test-tools-list",
        method: "tools/list",
        params: {},
      });
      const tools = toolsPayload.result?.tools || [];
      const toolNames = tools.map((tool: any) => tool.name);

      assert(Array.isArray(tools), "tools/list did not return an array");
      assert(
        toolNames.length === status.tools.activeCount,
        `tools/list count ${toolNames.length} != status count ${status.tools.activeCount}`,
      );
      assert(
        UPGRADED_READ_TOOLS.every((name) => toolNames.includes(name)),
        "missing upgraded read/citation tools",
      );

      for (const name of UPGRADED_WRITE_TOOLS) {
        if (status.preferences.writeEnabled) {
          assert(toolNames.includes(name), `missing write tool ${name}`);
        } else {
          assert(
            !toolNames.includes(name),
            `write tool visible while disabled ${name}`,
          );
        }
      }

      for (const tool of tools) {
        assert(tool.annotations, `missing annotations for ${tool.name}`);
        assert(
          typeof tool.annotations.readOnlyHint === "boolean",
          `missing readOnlyHint for ${tool.name}`,
        );
        assert(
          typeof tool.annotations.destructiveHint === "boolean",
          `missing destructiveHint for ${tool.name}`,
        );
        assert(
          typeof tool.annotations.openWorldHint === "boolean",
          `missing openWorldHint for ${tool.name}`,
        );
      }

      return {
        toolCount: toolNames.length,
        writeEnabled: status.preferences.writeEnabled,
        upgradedWriteToolsVisible: UPGRADED_WRITE_TOOLS.filter((name) =>
          toolNames.includes(name),
        ),
      };
    },
    tests,
  );

  await runTest(
    "Ping method",
    async () => {
      const payload = await callMCP({
        jsonrpc: "2.0",
        id: "test-ping",
        method: "ping",
        params: {},
      });

      assert(
        payload.result && Object.keys(payload.result).length === 0,
        "bad ping result",
      );
      return payload;
    },
    tests,
  );

  await runTest(
    "Write tools require explicit confirmation",
    async () => {
      const payload = await callMCP({
        jsonrpc: "2.0",
        id: "test-write-guard",
        method: "tools/call",
        params: {
          name: "attach_url",
          arguments: {
            url: "https://example.com/test.pdf",
            parentItemKey: "NOITEM00",
          },
        },
      });

      assert(payload.error?.code === -32603, "expected write guard error");
      assert(
        String(payload.error.message).includes("confirm=true"),
        `expected confirm=true guard, got ${payload.error.message}`,
      );
      return { error: payload.error.message };
    },
    tests,
  );

  await runTest(
    "Open-access download defaults to dry-run",
    async () => {
      const payload = await callMCP({
        jsonrpc: "2.0",
        id: "test-download-dry-run",
        method: "tools/call",
        params: {
          name: "download_open_access_pdf",
          arguments: {
            itemKey: "NOITEM00",
            resolveCandidates: false,
          },
        },
      });

      assert(payload.error?.code === -32603, "expected item lookup error");
      assert(
        !String(payload.error.message).includes("confirm=true"),
        `dry-run path should not require confirm=true: ${payload.error.message}`,
      );
      return { error: payload.error.message };
    },
    tests,
  );

  await runTest(
    "Real open-access download requires confirmation",
    async () => {
      const payload = await callMCP({
        jsonrpc: "2.0",
        id: "test-download-write-guard",
        method: "tools/call",
        params: {
          name: "download_open_access_pdf",
          arguments: {
            itemKey: "NOITEM00",
            dryRun: false,
            resolveCandidates: false,
          },
        },
      });

      assert(payload.error?.code === -32603, "expected write guard error");
      assert(
        String(payload.error.message).includes("confirm=true"),
        `expected confirm=true guard, got ${payload.error.message}`,
      );
      return { error: payload.error.message };
    },
    tests,
  );

  await runTest(
    "Initialized notification returns 202",
    async () => {
      const response = await callMCPHTTP({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      assert(response.status === 202, `expected 202, got ${response.status}`);
      assert(response.body === "", "notification body should be empty");
      return { status: response.status };
    },
    tests,
  );

  await runTest(
    "Invalid request without id is rejected",
    async () => {
      const response = await callMCPHTTP({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
      });
      const payload = JSON.parse(response.body);

      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(payload.error?.code === -32600, "expected -32600");
      assert(payload.id === null, "expected id null");
      return payload;
    },
    tests,
  );

  await runTest(
    "Batch requests are rejected",
    async () => {
      const response = await callMCPHTTP([
        {
          jsonrpc: "2.0",
          id: "test-batch",
          method: "ping",
          params: {},
        },
      ]);
      const payload = JSON.parse(response.body);

      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(payload.error?.code === -32600, "expected -32600");
      assert(payload.id === null, "expected id null");
      return payload;
    },
    tests,
  );

  const duration = Date.now() - startTime;
  const passed = tests.filter((test) => test.status === "PASSED").length;
  const failed = tests.length - passed;
  const summary = {
    total: tests.length,
    passed,
    failed,
    successRate: `${((passed / tests.length) * 100).toFixed(1)}%`,
  };

  logTest(
    `[MCPTest] Completed ${tests.length} non-mutating tests in ${duration}ms: ${passed} passed, ${failed} failed`,
  );

  return {
    message: "MCP integration test completed",
    message_zh: "MCP integration test completed",
    testResults: {
      summary,
      tests,
      timestamp: new Date().toISOString(),
    },
  };
}

async function callMCP(request: any): Promise<any> {
  const response = await callMCPHTTP(request);
  if (!response.body) {
    throw new Error(`Expected JSON response body for ${request.method}`);
  }
  return JSON.parse(response.body);
}

async function callTool(name: string, args: any): Promise<any> {
  return callMCP({
    jsonrpc: "2.0",
    id: `test-tool-${name}`,
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });
}

async function callMCPHTTP(request: any): Promise<MCPHTTPResponse> {
  ensureTestGlobals();
  const { StreamableMCPServer } = await import("./streamableMCPServer");
  const mcpServer = new StreamableMCPServer();
  return mcpServer.handleMCPRequest(JSON.stringify(request));
}

function ensureTestGlobals(): void {
  if (!(globalThis as any).ztoolkit) {
    (globalThis as any).ztoolkit = {
      log: (...args: any[]) => {
        if ((globalThis as any).Zotero?.debug) {
          (globalThis as any).Zotero.debug(
            args.map((arg) => String(arg)).join(" "),
          );
        } else {
          console.log(...args);
        }
      },
    };
  }
}

function parseToolContent(payload: any): any {
  const text = payload.result?.content?.[0]?.text;
  assert(typeof text === "string", "tool call did not return text content");
  return JSON.parse(text);
}

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTest(
  testName: string,
  testFunction: () => Promise<any>,
  tests: MCPTestResult[],
): Promise<void> {
  const startTime = Date.now();
  try {
    logTest(`[MCPTest] Running: ${testName}`);
    const result = await testFunction();
    const duration = Date.now() - startTime;

    tests.push({
      testName,
      status: "PASSED",
      duration,
      result,
    });

    logTest(`[MCPTest] PASS ${testName} in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    tests.push({
      testName,
      status: "FAILED",
      duration,
      error: errorMessage,
    });

    logTest(`[MCPTest] FAIL ${testName} in ${duration}ms: ${errorMessage}`);
  }
}

function logTest(message: string): void {
  const logger = (globalThis as any).ztoolkit;
  if (logger?.log) {
    logger.log(message);
  } else if ((globalThis as any).Zotero?.debug) {
    (globalThis as any).Zotero.debug(message);
  } else {
    console.log(message);
  }
}
