import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverPath = path.join(root, "src", "modules", "streamableMCPServer.ts");
const policyPath = path.join(root, "src", "modules", "mcpToolPolicy.ts");
const preferenceScriptPath = path.join(
  root,
  "src",
  "modules",
  "preferenceScript.ts",
);
const packagePath = path.join(root, "package.json");

const server = fs.readFileSync(serverPath, "utf8");
const policy = fs.readFileSync(policyPath, "utf8");
const preferenceScript = fs.readFileSync(preferenceScriptPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

function fail(message) {
  console.error(`[mcp-tool-check] ${message}`);
  process.exitCode = 1;
}

function extractArray(source, name) {
  const match = source.match(
    new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`),
  );
  if (!match) {
    fail(`Could not find array ${name}`);
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const toolSectionMatch = server.match(
  /const tools = \[([\s\S]*?)\n\s*\];\n\n\s*\/\/ Filter out semantic tools/,
);
if (!toolSectionMatch) {
  fail("Could not locate tools list in streamableMCPServer.ts");
}

const toolNames = toolSectionMatch
  ? [...toolSectionMatch[1].matchAll(/name:\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    )
  : [];
const caseNames = [...server.matchAll(/case\s+["']([^"']+)["']/g)].map(
  (m) => m[1],
);

const readTools = extractArray(policy, "READ_ONLY_TOOLS");
const collectionWriteTools = extractArray(policy, "COLLECTION_WRITE_TOOLS");
const itemWriteTools = extractArray(policy, "ITEM_WRITE_TOOLS");
const destructiveTools = extractArray(policy, "DESTRUCTIVE_TOOLS");
const dryRunWriteTools = ["import_by_identifier", "download_open_access_pdf"];
const policyTools = [
  ...readTools,
  ...collectionWriteTools,
  ...destructiveTools,
  ...itemWriteTools,
];
const writeTools = [
  ...collectionWriteTools,
  ...itemWriteTools,
  ...destructiveTools,
];

const duplicatedTools = toolNames.filter(
  (name, index) => toolNames.indexOf(name) !== index,
);
if (duplicatedTools.length) {
  fail(
    `Duplicate tools in tools/list: ${[...new Set(duplicatedTools)].join(", ")}`,
  );
}

const missingCases = toolNames.filter((name) => !caseNames.includes(name));
if (missingCases.length) {
  fail(`Tools missing tools/call handler cases: ${missingCases.join(", ")}`);
}

const missingPolicy = toolNames.filter((name) => !policyTools.includes(name));
if (missingPolicy.length) {
  fail(`Tools missing policy classification: ${missingPolicy.join(", ")}`);
}

const stalePolicy = policyTools.filter((name) => !toolNames.includes(name));
if (stalePolicy.length) {
  fail(`Policy references tools not in tools/list: ${stalePolicy.join(", ")}`);
}

const readWriteOverlap = readTools.filter((name) => writeTools.includes(name));
if (readWriteOverlap.length) {
  fail(
    `Tools cannot be both read-only and write: ${readWriteOverlap.join(", ")}`,
  );
}

for (const name of destructiveTools) {
  if (!writeTools.includes(name)) {
    fail(`Destructive tool is not covered by write tools: ${name}`);
  }
}

if (!server.includes("this.enforceWriteConfirmation(name, args || {})")) {
  fail("Missing central write confirmation guard in handleToolCall");
}

if (!policy.includes("addConfirmationSchema")) {
  fail("Missing confirmation schema augmentation in mcpToolPolicy");
}

if (!server.includes("private assertWriteEnabled()")) {
  fail("Missing shared assertWriteEnabled helper");
}

if (!server.includes("private normalizeHttpUrl(")) {
  fail("Missing HTTP/HTTPS URL validation helper");
}

if (
  !server.includes("DEFAULT_EXPORT_MAX_ITEMS") ||
  !server.includes("DEFAULT_EXPORT_MAX_OUTPUT_CHARS")
) {
  fail("Missing export item/output safety limits");
}

if (
  !preferenceScript.includes(
    `#zotero-prefpane-\${config.addonRef}-write-enabled`,
  )
) {
  fail("Preferences UI does not bind the write-enabled toggle");
}

if (!packageJson.scripts?.["test:mcp-smoke:upgraded"]) {
  fail("Missing installation gate script test:mcp-smoke:upgraded");
}

for (const name of dryRunWriteTools) {
  if (!itemWriteTools.includes(name)) {
    fail(`Dry-run write tool is missing from ITEM_WRITE_TOOLS: ${name}`);
  }
  if (
    !server.includes(`toolName === "${name}"`) &&
    !server.includes(`toolName === '${name}'`)
  ) {
    fail(`Dry-run write tool is missing central guard exemption: ${name}`);
  }
  if (
    !server.includes(`case "${name}"`) &&
    !server.includes(`case '${name}'`)
  ) {
    fail(`Dry-run write tool is missing tools/call case: ${name}`);
  }
}

if (
  !/toolName === ["']download_open_access_pdf["'] &&\s*args\?\.dryRun !== false/s.test(
    server,
  )
) {
  fail("download_open_access_pdf must default to dry-run at the write guard");
}

if (!/download_open_access_pdf[\s\S]*args\?\.dryRun === false/.test(server)) {
  fail(
    "download_open_access_pdf must only require write-enabled when dryRun is false",
  );
}

if (!process.exitCode) {
  console.log(`[mcp-tool-check] ${toolNames.length} tools validated`);
}
