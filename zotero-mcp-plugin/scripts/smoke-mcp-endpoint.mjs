const url = process.env.ZOTERO_MCP_URL || "http://127.0.0.1:23121/mcp";
const expectUpgraded =
  process.env.ZOTERO_MCP_EXPECT_UPGRADED === "1" ||
  process.argv.includes("--expect-upgraded");

const requiredTools = [
  "zotero_status",
  "list_export_formats",
  "export_items",
  "format_citation",
  "better_bibtex_status",
  "import_by_identifier",
  "attach_url",
  "download_open_access_pdf",
  "attach_file",
];

async function rpc(method, params = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} HTTP ${response.status}: ${text}`);
  }
  const json = JSON.parse(text);
  if (json.error) {
    throw new Error(`${method} JSON-RPC error: ${json.error.message}`);
  }
  return json.result;
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "zotero-mcp-smoke", version: "0.1.0" },
  });
  const toolsResult = await rpc("tools/list");
  const tools = toolsResult.tools || [];
  const toolNames = tools.map((tool) => tool.name);

  console.log(`[mcp-smoke] endpoint=${url}`);
  console.log(
    `[mcp-smoke] server=${init.serverInfo?.name || "unknown"} ${init.serverInfo?.version || ""}`.trim(),
  );
  console.log(`[mcp-smoke] tools=${toolNames.length}`);

  const missing = requiredTools.filter((tool) => !toolNames.includes(tool));
  if (missing.length) {
    const message = `[mcp-smoke] upgraded tools not visible: ${missing.join(", ")}`;
    if (expectUpgraded) {
      throw new Error(message);
    }
    console.warn(
      `${message} (non-fatal; installed Zotero plugin may not be upgraded yet)`,
    );
  }

  if (toolNames.includes("zotero_status")) {
    await rpc("tools/call", {
      name: "zotero_status",
      arguments: { includeToolPolicy: true, includeSemanticStats: false },
    });
    console.log("[mcp-smoke] zotero_status read-only call passed");
  }
} catch (error) {
  console.error(
    `[mcp-smoke] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
