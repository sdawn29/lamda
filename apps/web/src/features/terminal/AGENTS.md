# AGENTS.md — web/src/features/terminal

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Terminal feature module — provides embedded xterm.js terminal sessions with multi-tab support, WebSocket communication to the server's PTY service, and theme-aware rendering.

## Overview

The terminal module integrates `@xterm/xterm` for terminal emulation and communicates with the server's WebSocket terminal service to provide real-time shell access within the lamda workspace.

## Architecture

```
┌─ TerminalPanel (main component)
│  └─ Renders tab bar + active terminal instance
│
├─ context.tsx
│  ├─ TerminalProvider — manages tab state, open/close, active tab
│  └─ useTerminal() — hook to access terminal context
│
└─ components/
   └─ terminal-panel.tsx — xterm.js integration, WebSocket handling, theme support
```

## Key Files

### Context (context.tsx)

- **`TerminalProvider`** — React context provider for terminal state
  - Manages: `isOpen`, `tabs[]`, `activeTabId`
  - Operations: `open()`, `close()`, `toggle()`, `addTab()`, `closeTab()`, `setActiveTab()`, `renameTab()`, `killAll()`
  - Uses `crypto.randomUUID()` for tab IDs
  - Reset logic: when all tabs closed, resets `tabCounter` to 0

- **`useTerminal()`** — Consumer hook
  - Returns `TerminalContextValue` with all operations
  - Throws if used outside `TerminalProvider`

### Main Component (components/terminal-panel.tsx)

- **`TerminalPanel`** — Full xterm.js terminal integration
  - WebSocket connection to `/terminal` endpoint on server
  - Multi-tab support: each tab = separate PTY session
  - Theme support: dark (default) and light terminal themes
  - Auto-resize via FitAddon
  - CWD tracking per session

## Key Components

### TerminalPanel (components/terminal-panel.tsx)

**Props:**
```typescript
interface TerminalPanelProps {
  cwd: string  // Current working directory for the workspace
}
```

**State Management:**
- WebSocket messages for PTY input/output
- xterm.js Terminal instance per tab
- FitAddon for auto-resize on panel resize

**WebSocket Protocol:**
```typescript
// Server → Client
{ type: "output", data: string }           // PTY output
{ type: "exit", code: number }            // PTY exited
{ type: "resize", cols: number, rows: number }  // Terminal resize

// Client → Server
{ type: "input", data: string }           // Keyboard input
{ type: "resize", cols: number, rows: number }  // Resize request
{ type: "kill" }                           // Kill PTY process
```

**Theme Configuration:**
- Dark theme: navy cursor (#5e5ce6), dark background (#08090a)
- Light theme: indigo cursor (#5856d6), light background (#fbfbfc)
- Inherits from `useTheme()` for dark/light mode detection

**Performance:**
- `TERMINAL_OUTPUT_FLUSH_MS = 16` — 60fps render loop
- `TERMINAL_IMMEDIATE_FLUSH_THRESHOLD = 8192` — immediate write for large output

### TabBar UI

- Shows all open tabs with title
- Plus button to add new tab
- X button per tab to close
- Active tab highlighted
- Trash icon for "killAll" action

## Exports

```typescript
// index.ts barrel
export { TerminalProvider, useTerminal } from "./context"
export { TerminalPanel } from "./components/terminal-panel"
```

## Server Integration

- **WebSocket endpoint:** `/terminal` (via terminal-service.ts in server)
- **Connection:** Opens on first tab add, reused for new tabs
- **Authentication:** Inherits session context from parent workspace
- **PTY:** Uses `node-pty` on server for actual shell process

## Conventions

- **Tab lifecycle:** Tabs persist while open; disposed on `killAll()` or app close
- **Single WebSocket:** One connection per panel; multiplexed for multiple tabs
- **Auto-resize:** FitAddon called on mount, resize events, and panel size changes
- **Terminal shell:** Server-side shell is determined by `process.env.SHELL` or `/bin/bash` fallback
- **CWD per workspace:** Each TerminalPanel instance receives `cwd` prop for PTY initialization

## Dependencies

- `@xterm/xterm` — Terminal emulator (core)
- `@xterm/addon-fit` — Auto-resize addon
- `react` — Component library

## Gotchas

- **WebSocket must be open before sending input** — xterm.js keyboard events queued until connection established
- **Resize events throttled** — FitAddon handles debouncing to prevent excessive resize events
- **Theme mismatch** — xterm.js terminal theme is independent from app theme; you can have dark app with light terminal (both built-in)
- **Tab counter is module-level** — `tabCounter` is a global counter, not per-session; resets on `killAll()` or all tabs closed
- **PTY requires native module** — `node-pty` must be rebuilt for Electron; handled by `postinstall` script in server package
- **WebSocket reconnection** — On disconnect, old tabs show "Disconnected" state; user must create new tab to reconnect
- **No history scrollback in server** — Server PTY doesn't maintain scrollback; client-side xterm.js handles it

## Related

- [apps/server/services/terminal-service.ts](../../../server/src/services/terminal-service.ts) — WebSocket PTY management
- [apps/web/features/chat/AGENTS.md](../chat/AGENTS.md) — Terminal can be triggered from chat via slash commands