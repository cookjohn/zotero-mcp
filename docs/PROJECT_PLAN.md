# Zotero MCP Upgrade Project

This repository is now treated as a full local Zotero-agent integration project,
not only as a packaged Zotero plugin fork.

## Goal

Build a local-first Zotero MCP server that lets coding and research agents such
as Codex, Kimi Code, Claude Code, and other MCP clients help with:

- literature discovery and filtering
- collection and tag management
- PDF/full-text reading
- annotation extraction and review
- citation and bibliography generation
- safe item, note, attachment, and metadata writes
- paper import and attachment download workflows

## Current Baseline

The plugin runs an in-process Streamable HTTP MCP server inside Zotero. It does
not require a separate Node/Python server for normal operation.

Confirmed current capability groups:

- server and library discovery
- metadata and library search
- full-text and cached full-text search
- PDF/content extraction
- annotation search and retrieval
- collection browse/search/update tools
- semantic search backed by a local vector store
- note/tag/metadata/item write tools
- client configuration generation

## Immediate Gaps Found

- `tools/list` did not expose MCP tool annotations, so agents could not reliably
  distinguish read-only, write, and destructive tools.
- Some collection write tools were still advertised when write operations were
  disabled, even though tool execution later rejected them.
- There was no MCP status tool for agents to inspect endpoint, enabled features,
  and tool policy from inside the protocol.
- Codex config generation used an older shape with `type` and `headers` instead
  of the current Streamable HTTP TOML style.
- Kimi Code was not represented as a first-class client profile.
- Citation/export, identifier import, and PDF download workflows are not yet
  first-class MCP tools.

## Upgrade Phases

### Phase 1: Agent-safe project baseline

Implemented in this branch:

- Add `zotero_status` MCP tool.
- Add central tool policy metadata in `mcpToolPolicy.ts`.
- Add MCP `annotations` to advertised tools.
- Hide all write/destructive tools when write operations are disabled.
- Require `confirm: true` for real write tools and matching `confirmationText`
  for destructive tools.
- Update Codex config generation.
- Add Kimi Code config generation.
- Add project documentation for future work.

### Phase 2: Citation and export tools

Implemented in this branch:

- `export_items`
  - Input: item keys, format (`bibtex`, `biblatex`, `ris`, `csljson`), notes/journal-abbreviation options.
  - Output: export text plus item-key mapping.
- `format_citation`
  - Input: item keys, CSL style, locale, output mode.
  - Output: citation and bibliography text.
- `list_export_formats`
  - Lists available Zotero export translators and visible CSL styles.
- `better_bibtex_status`
  - Detect Better BibTeX when installed and expose available citekeys for selected items.

Still planned:

- Better BibTeX-specific `item.export` / `item.bibliography` integration.

Implementation should prefer Zotero internal translators first, then use Better
BibTeX JSON-RPC when present.

Current `format_citation` implementation uses Zotero CiteProc directly so
locators, prefixes, suffixes, and suppress-author options can be supported
without Quick Copy drag-limit behavior.

### Phase 3: Import and download tools

Implemented in this branch:

- `import_by_identifier`
  - DOI, ISBN, PMID, arXiv, ADS, or other Zotero lookup identifiers.
- `attach_url`
  - Import an online PDF or web resource as an attachment.
- `download_open_access_pdf`
  - Use Zotero built-in file resolvers to find and attach legally available
    PDF/EPUB files for an existing item.
  - Defaults to `dryRun: true` and refuses duplicate PDF/EPUB downloads unless
    `allowExistingFile: true` is explicitly provided.
- `attach_file`
  - Dedicated wrapper for importing a local file as an attachment under a parent item.

Still planned:

- Better BibTeX-specific attachment/citekey export polish where needed.

All write/import tools should support preview/dry-run where practical and should
be clearly marked as write or destructive.

### Phase 4: Hardening

Implemented in this branch:

- Static MCP manifest/policy check via `npm run test:mcp-tools`.
- Scaffold runtime MCP checks via `zotero-plugin test --no-watch`.
- Read-only live endpoint smoke via `npm run test:mcp-smoke`.
- Installation gate smoke via `npm run test:mcp-smoke:upgraded`; this fails if
  the live Zotero endpoint is still an older plugin build.
- Preferences UI binding for the write-operation toggle.
- HTTP/HTTPS scheme validation for `attach_url`.
- Bounded `export_items` responses using `maxItems` and `maxOutputChars`.

Remaining improvements:

- Optional bearer token for remote/non-loopback access.
- CORS and Host validation policy.
- Rate limiting for MCP POST requests.
- Broader fixture-based tests for import/download flows inside an isolated
  Zotero test profile.

## Agent Operating Policy

Agents should follow this default workflow:

1. Call `zotero_status`.
2. Use read-only discovery tools to locate candidate items.
3. Show proposed writes to the user.
4. Call write tools only after explicit user confirmation.
5. Treat destructive tools as requiring a separate confirmation.
