# AGENTS.md — web/src/features/file-tree

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

File tree feature module — provides collapsible file tree navigation with file search modal and context management for the workspace sidebar.

## Overview

Simple feature module (4 files) that provides:

1. **File tree visibility** — toggle open/close state via context
2. **File tree rendering** — displays workspace file hierarchy
3. **File search** — keyboard shortcut (Cmd+P) to search/open files

## Architecture

```
┌─ FileTreeProvider (context)
│  └─ Manages file tree open/close state
│
└─ Components
   ├─ FileTree.tsx — Main file tree with icons
   └─ FileSearchModal.tsx — Quick file open (Cmd+P)
```

## Key Files

### Context (context.tsx)

```typescript
interface FileTreeContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}
```

- **`FileTreeProvider`** — Wraps app, provides visibility state
- **`useFileTree()`** — Consumer hook (throws if outside provider)

### Components

- **`FileTree.tsx`** — File tree renderer
  - Shows workspace files in hierarchical tree
  - File icons based on extension
  - Click to open file

- **`FileSearchModal.tsx`** — Quick file open
  - Keyboard shortcut: Cmd+P / Ctrl+P
  - Fuzzy search across workspace files
  - Opens selected file in editor

## Conventions

- **Simple state only** — No API calls, no TanStack Query
- **Context-based visibility** — State managed via React context
- **File icons from shared** — Uses `@/shared/ui/file-icon`

## Related

- [apps/web/src/shared/AGENTS.md](../../shared/AGENTS.md) — Shared UI components
- [features/workspace/AGENTS.md](../workspace/AGENTS.md) — Uses workspace file index
