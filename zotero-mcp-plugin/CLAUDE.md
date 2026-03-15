# Zotero MCP Plugin

## Project Overview
A Zotero plugin that provides MCP (Model Context Protocol) server functionality, enabling AI assistants to interact with Zotero's library data.

## Tech Stack
- TypeScript
- Zotero Plugin API (Firefox/Gecko-based)
- zotero-plugin-scaffold for building
- SQLite for semantic search index

## Key Directories
- `src/` - TypeScript source code
- `addon/` - Plugin assets (manifest, locales, preferences UI)
- `.scaffold/build/` - Build output
- `update.json` - Zotero auto-update manifest

## Available Skills
- `release` - Automate version bump, XPI build, and GitHub release. See `../.claude/skills/release.md`

## Build Commands
```bash
npm run build      # Production build
npm run start      # Development with hot reload
```

## Important Patterns

### Preferences
- Prefix: `extensions.zotero.zotero-mcp-plugin`
- Defined in `addon/content/preferences.xhtml`
- Accessed via `Zotero.Prefs.get/set`

### Localization
- English: `addon/locale/en-US/preferences.ftl`
- Chinese: `addon/locale/zh-CN/preferences.ftl`

### Release Workflow
See `../.claude/skills/release.md` for automated release process.

Key points:
- Version in: `package.json`, `README.md`, `README-zh.md` (badge), `update.json`
- Build: `npm run build` → `.scaffold/build/zotero-mcp-plugin.xpi`
- `addon/` is gitignored — use `git add -f` for files under it
- Release assets: XPI (renamed to `zotero-mcp-plugin-X.Y.Z.xpi`) + `update.json`

## Code Style
- Use ztoolkit.log for logging
- Follow existing patterns in codebase
- Chinese comments are acceptable
