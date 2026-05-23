# AGENTS.md — web/src/features/command-palette

> Auto-generated context for coding agents. Last updated: 2026-04-30

## Purpose

Command palette feature module — provides a keyboard-driven command interface (Cmd+K) for quick navigation, panel toggling, theme switching, and file opening across the lamda workspace.

## Overview

Simple feature module (3 files, ~400 lines) that provides:
1. **Command palette UI** — Modal overlay with searchable command list
2. **File navigation** — Quick-open files from workspace index
3. **Thread switching** — Jump to any thread across workspaces
4. **Layout controls** — Toggle sidebar, terminal, diff, file tree
5. **Quick actions** — New thread, settings, theme toggle

## Architecture

```
command-palette/
├─ index.ts                    # Barrel: CommandPaletteProvider, useCommandPalette
├─ context.tsx                 # Context + hook for open/close state
├─ components/
│  └─ command-palette.tsx     # Main palette UI (~380 lines)
└─ AGENTS.md
```

## Key Files

### context.tsx

```typescript
interface CommandPaletteContextValue {
  open: boolean
  openPalette: () => void
  closePalette: () => void
}
```

- **`CommandPaletteProvider`** — Wraps app, provides open/close state
- **`useCommandPalette()`** — Consumer hook (throws if outside provider)

### components/command-palette.tsx

**Main command palette component:**

**Search Groups:**
1. **Files** — Searchable file list from workspace index (up to 5 results)
2. **Go to thread** — All threads across workspaces
3. **Layout** — Panel toggle commands
4. **Actions** — Create thread, settings, theme, source control

**Features:**
- Uses `@/shared/ui/command` (cmdk-based)
- Keyboard shortcut: `OPEN_COMMAND_PALETTE` action
- Lazy-loaded workspace file index (only when open)
- File icons via `catppuccin` icon set
- Thread navigation with workspace context
- Shortcut hints displayed in UI
- Debounced search with 50ms debounce on actions

**File Search:**
```typescript
const { data: fileEntries = [], isLoading: filesLoading } = useWorkspaceIndex(
  activeWorkspace?.id,
  open  // Only fetches when palette is open
)
const files = (
  searchLower
    ? allFiles.filter((f) => f.relativePath.toLowerCase().includes(searchLower))
    : allFiles
).slice(0, 5)
```

**Thread Navigation:**
```typescript
const allThreads = workspaces.flatMap((ws) =>
  ws.threads.map((t) => ({ ...t, workspaceName: ws.name }))
)
```

**Action Handling:**
```typescript
const run = useCallback(
  (fn: () => void) => {
    closePalette()
    setTimeout(fn, 50)  // Delay to allow close animation
  },
  [closePalette]
)
```

## Exports

```typescript
// index.ts
export { CommandPaletteProvider, useCommandPalette } from "./context"
export { CommandPalette } from "./components/command-palette"
```

## Keyboard Shortcuts

Registered via `useShortcutHandler`:
| Action | Default | Description |
|--------|---------|-------------|
| `OPEN_COMMAND_PALETTE` | Cmd+K | Open command palette |

Displayed in palette:
| Shortcut | Action |
|----------|--------|
| Toggle sidebar | Sidebar toggle binding |
| Toggle terminal | Terminal toggle binding |
| Toggle diff panel | Diff toggle binding |
| Toggle file tree | File tree toggle binding |
| New Thread | New thread binding |
| Open Settings | Settings binding |
| Open Source Control | Commit dialog binding |

## Conventions

- **Lazy data fetching** — Workspace index only loaded when palette opens
- **Search debouncing** — Actions run immediately after close, search is instant
- **Workspace context** — File search scoped to active workspace
- **Thread listing** — Shows all threads across all workspaces
- **Multi-workspace support** — Thread items show workspace name when > 1 workspace
- **Deferred action execution** — 50ms delay after close to ensure animation completes

## Dependencies

- `@tanstack/react-router` — Navigation (`useNavigate`, `useParams`)
- `@/shared/ui/command` — cmdk-based command menu
- `@/shared/components/keyboard-shortcuts-provider` — Shortcut registration
- `@/shared/lib/keyboard-shortcuts` — `SHORTCUT_ACTIONS`, `formatBindingParts`
- `@/features/workspace/` — Workspace data, thread creation
- `@/features/terminal/context` — `useTerminalForWorkspace`
- `@/features/git/context` — `useReviewPanel`
- `@/features/file-tree/context` — `useFileTree`
- `@/features/settings` — `useSettingsModal`
- `@/shared/components/theme-provider` — `useTheme`
- `@iconify/react` — Icon library for file icons
- `@/shared/ui/file-icon` — `getIconName`

## Gotchas

- **Cmd+K only** — No alternative shortcut, must be configured in keyboard shortcuts
- **File search is prefix-based** — Uses `includes()`, not fuzzy matching
- **Limited file results** — Only top 5 matches shown (performance)
- **Workspace required** — File search only works when workspace is selected
- **Index loading state** — Shows "Indexing workspace…" while files load
- **Thread creation navigates** — Creates thread then navigates to it
- **Theme toggle is immediate** — No delay unlike other actions

## Related

- [apps/web/AGENTS.md](../../AGENTS.md) — Parent web app
- [apps/web/src/features/workspace/AGENTS.md](../workspace/AGENTS.md) — Workspace data source
- [apps/web/src/features/layout/AGENTS.md](../layout/AGENTS.md) — Panel toggle buttons
- [apps/web/src/shared/AGENTS.md](../../shared/AGENTS.md) — Shared UI components