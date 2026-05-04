# AGENTS.md — web/src/features/file-opening

> Auto-generated context for coding agents. Last updated: 2026-05-04

## Purpose

Planned feature module for "Open With" functionality — discovering and launching external code editors to open workspace files. **Currently a stub with empty directories; not yet implemented.**

## Status

🚧 **Not Implemented** — This feature is planned but not yet developed. The directory structure exists but contains no source files.

## Architecture

```
file-opening/
└── components/  ← empty directory (planned UI components)
```

## Planned Features

- [ ] Detect installed code editors (VS Code, Cursor, Zed, etc.)
- [ ] "Open With" context menu integration
- [ ] Store preferred editor per workspace
- [ ] Cross-platform editor discovery

## Related

- [apps/desktop](../desktop/AGENTS.md) — Contains `open-with.ts` with existing editor discovery logic
- [apps/web/src/features/file-tree](./file-tree/AGENTS.md) — File tree integration for "Open With" context
