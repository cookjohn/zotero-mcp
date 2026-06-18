# Tool Policy

This document defines how MCP tools in this project should be classified and
advertised to agent clients.

## Risk Levels

### Read

Read tools do not mutate Zotero data. They are safe for discovery, analysis,
summaries, and citation lookup.

Examples:

- `zotero_status`
- `search_library`
- `get_item_details`
- `get_content`
- `search_annotations`
- `get_annotations`
- `search_fulltext`
- `list_export_formats`
- `export_items`
- `format_citation`
- `better_bibtex_status`
- `semantic_search`
- `fulltext_database`

### Write

Write tools mutate Zotero data but are not inherently destructive. Agents should
show the planned change and ask the user before calling them.

Examples:

- `create_collection`
- `update_collection`
- `add_items_to_collection`
- `remove_items_from_collection`
- `write_note`
- `write_tag`
- `write_metadata`
- `write_item`
- `import_by_identifier`
- `attach_url`
- `download_open_access_pdf`
- `attach_file`

### Destructive

Destructive tools can delete, trash, or remove structures in a way that may be
harder to recover. Agents should require explicit confirmation.

Examples:

- `delete_collection`

Future attachment-trash or item-trash tools must also be classified as
destructive.

## MCP Annotations

Each tool returned from `tools/list` should include:

```json
{
  "annotations": {
    "title": "tool_name",
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

Write tools should use `readOnlyHint: false` and `idempotentHint: false`.
Destructive tools should use `destructiveHint: true`.
Most tools should use `openWorldHint: false`. Current exceptions are
`semantic_search`, `import_by_identifier`, `attach_url`, and
`download_open_access_pdf` because they may call a configured embedding
provider, Zotero translators, Zotero file resolvers, or remote URLs.

## Visibility Rules

When the Zotero MCP preference `write.enabled` is false, write and destructive
tools must not be advertised through `tools/list`.

When semantic search is disabled, semantic tools must not be advertised through
`tools/list`.

Execution handlers should still enforce the same checks because clients may have
cached an older tool list.

## Future Write Guard

All current write tools are guarded at the MCP call boundary. A real write call
must include:

```json
{
  "confirm": true
}
```

Destructive tools also require:

```json
{
  "confirmationText": "TARGET_KEY"
}
```

`import_by_identifier` with `dryRun: true` is exempt because it only parses
identifiers and returns the planned import without creating Zotero items.

`download_open_access_pdf` with `dryRun: true` is exempt because it inspects
Zotero file resolvers and candidate URLs without downloading or attaching
files.

`attach_url` accepts only `http:` and `https:` URLs. Local files should go
through `attach_file`, which is always a write tool and requires confirmation.

`export_items` is read-only but still bounded to protect agent transports from
large responses. Use `maxItems` and `maxOutputChars` deliberately for larger
exports.
