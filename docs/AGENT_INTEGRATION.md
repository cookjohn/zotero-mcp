# Agent Integration

The Zotero MCP plugin exposes a local Streamable HTTP endpoint:

```text
http://127.0.0.1:<port>/mcp
```

The default upstream port is `23120`. On this machine the running Zotero MCP
endpoint was observed at `23121`, so use the port shown in Zotero MCP
preferences or `/mcp/status`.

## Codex

Add this to `~/.codex/config.toml` or to a trusted project
`.codex/config.toml`:

```toml
[mcp_servers.zotero-mcp]
url = "http://127.0.0.1:23121/mcp"
tool_timeout_sec = 120
```

For a read-only Codex profile, keep write operations disabled in Zotero MCP
preferences. The plugin will then hide write and destructive tools from
`tools/list`.

## Kimi Code

Add this to `~/.kimi-code/mcp.json` or a project `.kimi-code/mcp.json`:

```json
{
  "mcpServers": {
    "zotero-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:23121/mcp"
    }
  }
}
```

## Claude Code

Use the native HTTP MCP registration command:

```bash
claude mcp add --transport http zotero-mcp http://127.0.0.1:23121/mcp
```

Use `--scope user` if the server should be available across projects.

## First Call For Every Agent

After installing or upgrading the Zotero add-on, verify the live endpoint before
connecting agents:

```bash
npm run test:mcp-smoke:upgraded
```

The non-strict smoke command, `npm run test:mcp-smoke`, is only for discovering
what is currently running. It can succeed against an older installed plugin and
should not be used as the installation gate.

Every agent should call:

```text
zotero_status
```

If `zotero_status` is missing, the connected Zotero endpoint is still running an
older MCP plugin build.

This returns:

- server version and endpoint
- active preferences
- active tool names
- read/write/destructive tool policy
- recommended calling flow

## Literature Workflows

Read/citation workflow:

1. Use `search_library`, `semantic_search`, or `search_fulltext` to find items.
2. Use `get_item_details` and `get_content` to verify the selected papers.
3. Use `list_export_formats` when the user requests a specific export format or
   citation style.
4. Use `export_items` for BibTeX, BibLaTeX, RIS, CSL JSON, or another Zotero
   export translator. Large exports are bounded by `maxItems` and
   `maxOutputChars` so agents should export in smaller batches when needed.
5. Use `format_citation` for CSL bibliography entries or in-text citations.
   For insertion-oriented in-text citations, use `citationItems` with locator,
   label, prefix, suffix, or suppressAuthor as needed.
6. Use `better_bibtex_status` when citekey stability or Better BibTeX-specific
   behavior matters.

Import/download workflow:

1. Use `import_by_identifier` with `dryRun: true` to parse DOI/ISBN/PMID/arXiv
   identifiers before writing.
2. Re-run `import_by_identifier` without dry-run only after user confirmation.
3. Use `download_open_access_pdf` with `dryRun: true` before downloading a
   candidate PDF/EPUB for an existing item.
4. Re-run `download_open_access_pdf` without dry-run only after user
   confirmation. Keep `allowExistingFile: false` unless the user explicitly
   wants another PDF/EPUB copy attached.
5. Use `attach_url` to import or link a URL attachment to an existing item.
6. Prefer `attach_url` with `mode: "link"` when the user only wants a URL
   reference and does not need Zotero to download the file.
7. Use `attach_file` when the user has already downloaded a local PDF or other
   file and wants it copied into Zotero storage under an existing item.

Write safety:

- Real write tools require `confirm: true`.
- Destructive tools also require `confirmationText` to match the target key.
- Do not pass `confirm: true` until the user has approved the exact planned
  change.
- Tests against an existing Zotero library should use read-only tools or
  `dryRun: true` only.

## Tool Safety

The plugin now advertises MCP `annotations` for each tool:

- read-only tools have `readOnlyHint: true`
- write tools have `readOnlyHint: false`
- destructive tools have `destructiveHint: true`
- most tools are marked `openWorldHint: false` because Zotero access is local
- `semantic_search`, `import_by_identifier`, `attach_url`, and
  `download_open_access_pdf` are marked `openWorldHint: true` because they may
  call an embedding provider, Zotero translators, Zotero file resolvers, or
  remote URLs

Agents should still ask the user before calling write tools. Destructive tools
should require a separate explicit confirmation.
