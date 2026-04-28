# AGENTS.md — web/src/features/layout

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Layout feature module — provides the application title bar, panel toggle controls, thread navigation (back/forward), and "Open With" editor integration. Acts as the primary UI orchestration layer for the lamda workspace.

## Overview

The layout module (~640 lines) is the main header component that:
1. **Title Bar** — Custom draggable title bar for Electron frameless window
2. **Navigation** — Back/forward buttons with browser-style history tracking
3. **Panel Controls** — Toggle buttons for terminal, diff, file tree
4. **Thread Actions** — Rename, delete thread operations
5. **Editor Integration** — "Open With" dropdown for external editor launching

## Architecture

```
layout/
├─ index.ts                    # Barrel: exports TitleBar + OpenWithButton
├─ components/
│  ├─ title-bar.tsx           # Main title bar (644 lines)
│  └─ open-with-button.tsx    # External editor launcher (170 lines)
└─ AGENTS.md
```

## Key Files

### components/title-bar.tsx

**Main title bar component with:**
- Custom drag region for Electron frameless window
- Navigation controls (back/forward with history tracking)
- Sidebar toggle with keyboard shortcut
- Thread title display with rename inline editing
- Panel toggle buttons (Terminal, Diff, File Tree)
- Diff statistics display (additions/deletions)
- "Open With" editor dropdown
- Commit dialog trigger

**Keyboard Shortcuts:**
| Action | Shortcut |
|--------|----------|
| Toggle sidebar | Configurable |
| Toggle terminal | Configurable |
| Toggle diff panel | Configurable |
| Toggle file tree | Configurable |
| Rename thread | Configurable |
| Navigate back | Browser back |
| Navigate forward | Browser forward |

**State Management:**
- Uses `useSidebar()` from shared UI for sidebar state
- Uses `useTerminal()`, `useDiffPanel()`, `useFileTree()` for panel states
- Uses `useWorkspace()` for thread operations
- Uses `useElectronPlatform()` and `useElectronFullscreen()` for desktop integration
- Uses `useRouter()`, `useNavigate()`, `useLocation()` for navigation

**Drag Region:**
```typescript
style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
```
- Title bar is draggable for window movement
- Child controls marked `no-drag` to remain interactive

**History Tracking:**
```typescript
const { subscribe, getSnapshot } = useMemo(() => {
  let count = 0
  return {
    subscribe: (notify: () => void) =>
      router.history.subscribe(({ action }) => {
        if (action.type === "PUSH" || action.type === "REPLACE") count = 0
        else if (action.type === "BACK") count++
        else if (action.type === "FORWARD") count = Math.max(0, count - 1)
        notify()
      }),
    getSnapshot: () => count > 0,
  }
}, [router.history])
```

### components/open-with-button.tsx

**External editor launcher for macOS:**
- Discovers available code editors via Electron API
- Shows app icons for each editor
- Persists user's preferred editor per workspace
- Keyboard shortcut to open (Cmd+Shift+O on macOS)
- Falls back gracefully on non-macOS platforms

**States:**
- Hidden on non-macOS
- Hidden when no workspace selected
- Hidden when no editors found
- Loading spinner while discovering apps
- Disabled during editor launch

**Icon Handling:**
- Fetches app icons via `useOpenWithAppIcons`
- Fallback to letter avatar if icon fails to load
- Memoized selection of last-used app

## Exports

```typescript
// index.ts
export { TitleBar } from "./components/title-bar"
export { OpenWithButton } from "./components/open-with-button"
```

## Conventions

- **Electron frameless window** — Title bar implements custom window controls via `WebkitAppRegion`
- **Panel toggles are context-aware** — Diff and file tree disabled when no workspace
- **History uses TanStack Router** — Back/forward via `router.history.back()/forward()`
- **Shortcut bindings from shared** — Uses `useShortcutHandler` and `useShortcutBinding` from shared
- **macOS-specific** — OpenWithButton only renders on macOS (`platform === "darwin"`)
- **Drag region boundaries** — Dynamic width calculation tracks sidebar width for proper alignment

## Dependencies

- `@/shared/ui/` — Button, Tooltip, DropdownMenu, SidebarTrigger, etc.
- `@/features/workspace/` — Thread operations, workspace data
- `@/features/terminal/` — Terminal panel toggle
- `@/features/git/` — Diff panel toggle, CommitDialog
- `@/features/file-tree/` — File tree toggle
- `@/features/electron/` — Platform detection, editor discovery
- `@/shared/components/keyboard-shortcuts-provider` — Global shortcuts

## Gotchas

- **macOS traffic lights** — Back/forward nav positioned to avoid macOS window buttons (pl-20 on macOS)
- **Fullscreen hides nav** — On macOS fullscreen, nav controls collapse (no pl-20)
- **Thread rename** — Click outside or Escape cancels, Enter commits
- **Diff stat visibility** — Only shows when there are actual changes (additions > 0 || deletions > 0)
- **OpenWithButton is conditional** — Returns `null` on non-macOS or when no workspace selected
- **ResizeObserver for width tracking** — Title bar spacer uses ResizeObserver to animate smoothly with sidebar
- **Workspace path required for file tree** — File tree toggle disabled when no workspace path

## Related

- [apps/web/AGENTS.md](../../AGENTS.md) — Parent web app
- [apps/web/src/features/electron/AGENTS.md](../electron/AGENTS.md) — Editor discovery, platform detection
- [apps/web/src/features/workspace/AGENTS.md](../workspace/AGENTS.md) — Thread management
- [apps/web/src/features/git/AGENTS.md](../git/AGENTS.md) — Diff panel, commit dialog
- [apps/web/src/features/terminal/AGENTS.md](../terminal/AGENTS.md) — Terminal panel
- [apps/web/src/features/file-tree/AGENTS.md](../file-tree/AGENTS.md) — File tree panel
- [apps/web/src/shared/AGENTS.md](../../shared/AGENTS.md) — Shared UI components, shortcuts
