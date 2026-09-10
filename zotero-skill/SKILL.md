---
name: zotero-mcp
description: Communicate with Zotero from the command line on Windows/macOS/Linux via the zotero-mcp plugin. Use for single-PDF import, folder batch import, importing into an existing collection, listing collections, and verifying connector health. Full MCP integration for full-text search, semantic search, notes, tags, and metadata editing. Requires Zotero desktop with zotero-mcp-plugin installed.
---

# Zotero Local Import & MCP Skill (Windows / macOS / Linux)

This skill provides unified MCP-based operation for PDF import and library management via the [zotero-mcp](https://github.com/cookjohn/zotero-mcp) plugin.

## Prerequisites

Before using this skill, make sure Zotero Desktop is open and configured:

### MCP Server Setup
1. Install the [zotero-mcp-plugin](https://github.com/cookjohn/zotero-mcp/releases) in Zotero 7
   - Download `.xpi` file from Releases
   - Zotero → Tools → Add-ons → Install Add-on From File
2. Restart Zotero
3. Open **Zotero → Edit → Preferences → Zotero MCP Plugin**
4. Enable **Start integrated MCP server**
5. Note the MCP port (default `23120`)

### Zotero Local Connector (for PDF imports)
The zotero-mcp plugin internally uses Zotero's Local Connector (port 23119) for PDF imports. Ensure:
1. Open **Zotero → Settings → Advanced**
2. Enable: **Allow other applications on this computer to communicate with Zotero**

> This skill only imports into **existing collections**. It does **not** create collections.
> If `--collection` is not provided, imports default to **My Library**.

## Script location

- `zotero-skill/scripts/zotero_tool.py`

## Features

### PDF Import (via MCP `import_pdf` tool)
1. Import a single PDF
2. Import all PDFs in a folder (optional recursive mode)
3. Import into an existing collection
4. List local Zotero collections (via MCP `list_collections` tool)
5. Check connector health (via MCP `connector_health` tool)

### MCP Server Operations (port 23120)
1. **Search & Query**: Full-text search, annotation search, metadata search
2. **Semantic Search**: AI-powered concept matching (requires OpenAI/Ollama)
3. **Collection Management**: Browse collections, subcollections, items
4. **Note Management**: Create, read, update notes (Markdown → HTML)
5. **Tag Management**: Add, remove, replace tags on items
6. **Metadata Editing**: Update titles, abstracts, DOI, creators
7. **Item Creation**: Create new items or reparent standalone PDFs
8. **Content Extraction**: Get PDF full-text, abstracts, webpage snapshots

## Agent pre-execution contract (foolproof mode)

The agent must support all of the following user input forms and complete import automatically:

1. A folder path
2. A single PDF path
3. Multiple PDF paths
4. A few PDFs inside a folder (user can provide file names such as `x.pdf, y.pdf, z.pdf`)

The agent must also collect:

- Zotero MCP port (default: 23120)
- Optional collection name (if omitted, default to My Library)

Required execution flow for imports:

1. Run `doctor --auto-install-deps`
2. If successful, run `import`

Natural-language parsing (paths, file names, port, collection) must be handled by the **agent**, not by the script. The script accepts structured arguments only.

## Command usage

Run from repository root (or use absolute script path):

```bash
python zotero-skill/scripts/zotero_tool.py --help
```

### 0) Environment check (mandatory)

```bash
python zotero-skill/scripts/zotero_tool.py doctor \
  --mcp-port <MCP_PORT> \
  --auto-install-deps
```

This checks and auto-handles:

- Python runtime availability
- `requests` dependency (auto-installs if missing)
- MCP server ping (`http://127.0.0.1:<mcp-port>/mcp`)
- Zotero Local Connector health via MCP proxy

If auto-install fails, the agent should surface the error and suggest:

```bash
python -m pip install requests>=2.31.0
```

---

## PDF Import Commands (via MCP)

### NL) Natural-language input policy (agent-side parsing only)

Users may say things like:

- "Import `x.pdf, y.pdf, z.pdf` from `<folder>`, port `xxxx`, collection `xxxx`"
- "Import this PDF: `<absolute path>`, port `xxxx`"

The agent must convert NL input into structured CLI args, then call `import`:

- Folder mode: `--dir` + optional `--pick`
- Single/multiple PDF mode: repeated `--pdf`
- Port: `--mcp-port`
- Collection: optional `--collection` (defaults to My Library)

### A) Import a single PDF

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --pdf "<ABSOLUTE_PDF_PATH>" \
  --mcp-port <MCP_PORT>
```

### A2) Import multiple PDFs (repeat `--pdf`)

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --pdf "<PDF_PATH_1>" \
  --pdf "<PDF_PATH_2>" \
  --pdf "<PDF_PATH_3>" \
  --mcp-port <MCP_PORT>
```

### B) Batch import a folder (non-recursive)

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --dir "<ABSOLUTE_FOLDER_PATH>" \
  --mcp-port <MCP_PORT>
```

### C) Batch import a folder (recursive)

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --dir "<ABSOLUTE_FOLDER_PATH>" \
  --recursive \
  --mcp-port <MCP_PORT>
```

### D) Import into a specific existing collection

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --dir "<ABSOLUTE_FOLDER_PATH>" \
  --recursive \
  --collection "<EXISTING_COLLECTION_NAME>" \
  --mcp-port <MCP_PORT>
```

### D2) Import selected PDFs from a folder (CSV file names)

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --dir "<ABSOLUTE_FOLDER_PATH>" \
  --pick "x.pdf,y.pdf,z.pdf" \
  --collection "<EXISTING_COLLECTION_NAME>" \
  --mcp-port <MCP_PORT>
```

Or repeat `--pick`:

```bash
python zotero-skill/scripts/zotero_tool.py import \
  --dir "<ABSOLUTE_FOLDER_PATH>" \
  --pick "x.pdf" \
  --pick "y.pdf" \
  --pick "z.pdf" \
  --mcp-port <MCP_PORT>
```

### E) List local collections (via MCP)

```bash
python zotero-skill/scripts/zotero_tool.py list-collections --mcp-port <MCP_PORT>
```

### F) Check connector health (via MCP)

```bash
python zotero-skill/scripts/zotero_tool.py doctor --mcp-port <MCP_PORT>
```

---

## MCP Server Commands (Search, Notes, Tags, Metadata)

> All MCP commands require `--mcp-port` (default: 23120)

### Search Commands

#### Search library (multi-dimensional)

```bash
python zotero-skill/scripts/zotero_tool.py mcp-search \
  --mcp-port <MCP_PORT> \
  --query "machine learning" \
  --mode "title,creator,year,tags,fulltext" \
  --limit 20
```

#### Search annotations/highlights

```bash
python zotero-skill/scripts/zotero_tool.py mcp-search-annotations \
  --mcp-port <MCP_PORT> \
  --query "neural networks" \
  --color "yellow" \
  --limit 10
```

#### Full-text search

```bash
python zotero-skill/scripts/zotero_tool.py mcp-search-fulltext \
  --mcp-port <MCP_PORT> \
  --query "transformer architecture" \
  --limit 10
```

#### Semantic search (requires embedding setup)

```bash
python zotero-skill/scripts/zotero_tool.py mcp-semantic-search \
  --mcp-port <MCP_PORT> \
  --query "attention mechanisms in NLP" \
  --limit 10
```

#### Find similar items

```bash
python zotero-skill/scripts/zotero_tool.py mcp-find-similar \
  --mcp-port <MCP_PORT> \
  --item-key "ABC123XYZ" \
  --limit 10
```

### Item Details Commands

#### Get item details

```bash
python zotero-skill/scripts/zotero_tool.py mcp-item-details \
  --mcp-port <MCP_PORT> \
  --item-key "ABC123XYZ"
```

#### Get item abstract

```bash
python zotero-skill/scripts/zotero_tool.py mcp-item-abstract \
  --mcp-port <MCP_PORT> \
  --item-key "ABC123XYZ"
```

#### Get content (PDF text, notes, abstracts)

```bash
python zotero-skill/scripts/zotero_tool.py mcp-get-content \
  --mcp-port <MCP_PORT> \
  --item-key "ABC123XYZ" \
  --mode "standard"
```

Modes: `minimal`, `preview`, `standard`, `complete`

### Collection Commands

#### List all collections

```bash
python zotero-skill/scripts/zotero_tool.py mcp-collections \
  --mcp-port <MCP_PORT>
```

#### Get collection details

```bash
python zotero-skill/scripts/zotero_tool.py mcp-collection-details \
  --mcp-port <MCP_PORT> \
  --collection-key "COLLECTION_KEY"
```

#### Get items in collection

```bash
python zotero-skill/scripts/zotero_tool.py mcp-collection-items \
  --mcp-port <MCP_PORT> \
  --collection-key "COLLECTION_KEY" \
  --limit 50
```

#### Get subcollections

```bash
python zotero-skill/scripts/zotero_tool.py mcp-subcollections \
  --mcp-port <MCP_PORT> \
  --collection-key "COLLECTION_KEY" \
  --recursive
```

### Note Management Commands

#### Create or update note

```bash
python zotero-skill/scripts/zotero_tool.py mcp-write-note \
  --mcp-port <MCP_PORT> \
  --item-key "PARENT_ITEM_KEY" \
  --note "# My Notes\n\nThis is a markdown note.\n\n- Point 1\n- Point 2"
```

Or from file:

```bash
python zotero-skill/scripts/zotero_tool.py mcp-write-note \
  --mcp-port <MCP_PORT> \
  --item-key "PARENT_ITEM_KEY" \
  --note-file "/path/to/notes.md"
```

#### Read note

```bash
python zotero-skill/scripts/zotero_tool.py mcp-read-note \
  --mcp-port <MCP_PORT> \
  --note-key "NOTE_KEY"
```

### Tag Management Commands

#### Add tags to item

```bash
python zotero-skill/scripts/zotero_tool.py mcp-add-tags \
  --mcp-port <MCP_PORT> \
  --item-key "ITEM_KEY" \
  --tags "machine-learning,deep-learning,transformers"
```

#### Remove tags from item

```bash
python zotero-skill/scripts/zotero_tool.py mcp-remove-tags \
  --mcp-port <MCP_PORT> \
  --item-key "ITEM_KEY" \
  --tags "old-tag,obsolete-tag"
```

#### Replace all tags on item

```bash
python zotero-skill/scripts/zotero_tool.py mcp-replace-tags \
  --mcp-port <MCP_PORT> \
  --item-key "ITEM_KEY" \
  --tags "new-tag-1,new-tag-2,new-tag-3"
```

### Metadata Commands

#### Update item metadata

```bash
python zotero-skill/scripts/zotero_tool.py mcp-update-metadata \
  --mcp-port <MCP_PORT> \
  --item-key "ITEM_KEY" \
  --title "New Title" \
  --abstract "New abstract text" \
  --doi "10.1234/example"
```

#### Update creators (authors)

```bash
python zotero-skill/scripts/zotero_tool.py mcp-update-creators \
  --mcp-port <MCP_PORT> \
  --item-key "ITEM_KEY" \
  --creators '[{"firstName":"John","lastName":"Doe","creatorType":"author"}]'
```

### Item Creation Commands

#### Create new item

```bash
python zotero-skill/scripts/zotero_tool.py mcp-create-item \
  --mcp-port <MCP_PORT> \
  --item-type "journalArticle" \
  --title "Article Title" \
  --url "https://example.com/paper"
```

#### Reparent standalone PDF

```bash
python zotero-skill/scripts/zotero_tool.py mcp-reparent-pdf \
  --mcp-port <MCP_PORT> \
  --pdf-key "PDF_ITEM_KEY" \
  --parent-key "PARENT_ITEM_KEY"
```

### Semantic Search Status

```bash
python zotero-skill/scripts/zotero_tool.py mcp-semantic-status \
  --mcp-port <MCP_PORT>
```

### Full-text Database Commands

```bash
# List full-text entries
python zotero-skill/scripts/zotero_tool.py mcp-fulltext-db \
  --mcp-port <MCP_PORT> \
  --action list \
  --limit 20

# Search full-text database
python zotero-skill/scripts/zotero_tool.py mcp-fulltext-db \
  --mcp-port <MCP_PORT> \
  --action search \
  --query "search term" \
  --limit 10

# Get specific item full-text
python zotero-skill/scripts/zotero_tool.py mcp-fulltext-db \
  --mcp-port <MCP_PORT> \
  --action get \
  --item-key "ITEM_KEY"

# Get full-text stats
python zotero-skill/scripts/zotero_tool.py mcp-fulltext-db \
  --mcp-port <MCP_PORT> \
  --action stats
```

---

## Key parameters

### MCP Server Parameters
- `--mcp-port`: Zotero MCP server port (default: `ZOTERO_MCP_PORT` env var, fallback `23120`)
- `--timeout`: HTTP timeout in seconds (default `30` for MCP operations, `90` for imports)
- `--collection`: target existing collection name
- `--limit`: Result limit for search/list operations (default varies by command)
- `--query`: Search query string
- `--item-key`: Zotero item key (alphanumeric identifier)
- `--collection-key`: Zotero collection key
- `--mode`: Content extraction mode (`minimal`, `preview`, `standard`, `complete`)

## Platform notes

- Windows: supported by default
- macOS: requires `open`
- Linux: requires `xdg-open`

## Failure handling

### MCP Server
- `error=mcp_server_not_found`: verify zotero-mcp plugin is installed and MCP server is enabled
- `error=connector_health`: verify Zotero desktop is running and Local Connector is enabled
- Write operations disabled: check Zotero MCP preferences to enable write operations
- Semantic search unavailable: verify OpenAI/Ollama embedding API is configured

### Import Failures
- Connection failures: verify Zotero is running and MCP server is enabled
- Import failures: retry with one PDF first, then run batch import
- `error=collection not found`: create the collection manually in Zotero first

## Quick Reference: Common Workflows

### Import and tag PDFs
```bash
# 1. Import PDFs
python zotero-skill/scripts/zotero_tool.py import --pdf "paper.pdf" --mcp-port 23120

# 2. Search for the item to get its key
python zotero-skill/scripts/zotero_tool.py mcp-search --mcp-port 23120 --query "paper" --limit 5

# 3. Add tags to the item
python zotero-skill/scripts/zotero_tool.py mcp-add-tags --mcp-port 23120 --item-key "ITEM_KEY" --tags "important,toread"
```

### Find related papers
```bash
# 1. Search for a paper
python zotero-skill/scripts/zotero_tool.py mcp-search --mcp-port 23120 --query "attention is all you need" --limit 1

# 2. Find semantically similar papers
python zotero-skill/scripts/zotero_tool.py mcp-find-similar --mcp-port 23120 --item-key "ITEM_KEY" --limit 10
```

### Batch process folder with notes
```bash
# 1. Import all PDFs from folder
python zotero-skill/scripts/zotero_tool.py import --dir "./papers" --recursive --mcp-port 23120

# 2. Create a note for a specific paper
python zotero-skill/scripts/zotero_tool.py mcp-write-note --mcp-port 23120 --item-key "ITEM_KEY" --note "# Summary\n\nKey findings..."
```
