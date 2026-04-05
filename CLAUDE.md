# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands can be run from the repo root via Turborepo or from within each app directory directly.

**Root (all apps in parallel):**
```bash
npm run dev          # Start all apps in dev mode
npm run build        # Build all apps
npm run lint         # Lint all apps
npm run check-types  # Type-check all apps
npm run format       # Prettier format everything
```

**Web app only (`apps/web`):**
```bash
npm run dev -w web
npm run build -w web
npm run lint -w web
npm run typecheck -w web
```

**Desktop app only (`apps/desktop`):**
```bash
npm run dev -w desktop      # Start Electron with dev server
npm run check-types -w desktop
```

There are no tests currently.

## Architecture

This is a monorepo (Turborepo + npm workspaces) building an Electron desktop app that wraps a React web UI.

### Apps

- **`apps/web`** — React 19 + Vite + TanStack Router + Tailwind CSS + shadcn/ui. This is the renderer/UI layer.
- **`apps/desktop`** — Electron wrapper. Loads the web app in a `BrowserWindow`. Provides native OS capabilities (file picker, platform info) via IPC.
- **`apps/server`** — Minimal stub, not yet developed.

### Electron IPC Bridge

The boundary between Electron and the web app is defined in two files:

- [apps/desktop/src/preload.ts](apps/desktop/src/preload.ts) — exposes `window.electronAPI` to the renderer via `contextBridge`. Currently exposes `platform` and `selectFolder()`.
- [apps/web/src/types/electron.d.ts](apps/web/src/types/electron.d.ts) — TypeScript types for `window.electronAPI` on the web side.

When adding new IPC channels, add the handler in [apps/desktop/src/main.ts](apps/desktop/src/main.ts), expose it in preload.ts, and add its type in electron.d.ts.

### Routing

Uses **TanStack Router** with file-based routing. The route tree at [apps/web/src/routeTree.gen.ts](apps/web/src/routeTree.gen.ts) is **auto-generated** (read-only — configured as such in `.vscode/settings.json`). Routes live in `apps/web/src/routes/`. Hash-based history is used (required for Electron's `file://` protocol).

### State Management

- **WorkspaceContext** ([apps/web/src/hooks/workspace-context.tsx](apps/web/src/hooks/workspace-context.tsx)) — manages the list of workspaces (name + path), active workspace selection, create/delete. Wraps the entire app.
- **ThemeProvider** ([apps/web/src/components/theme-provider.tsx](apps/web/src/components/theme-provider.tsx)) — dark/light/system theme with localStorage persistence. Press `d` to toggle.
- No external state library — plain React context.

### UI Components

Components live in `apps/web/src/components/`. Primitive/headless UI components are in the `ui/` subdirectory — these are **shadcn/ui** components using **Base UI React** (not Radix). Use the `cn()` utility from [apps/web/src/lib/utils.ts](apps/web/src/lib/utils.ts) to merge Tailwind classes.

To add a new shadcn component:
```bash
cd apps/web && npx shadcn@latest add <component>
```

The shadcn config ([apps/web/components.json](apps/web/components.json)) uses the `base-mira` style with Lucide icons.

### Key Layout Structure

```
__root.tsx (WorkspaceProvider + ThemeProvider)
  ├─ WorkspaceEmptyState  (shown when no workspaces exist)
  └─ SidebarProvider
       ├─ AppSidebar       (workspace list + new thread)
       ├─ TitleBar         (back/forward nav, draggable, macOS-aware)
       └─ <Outlet />       (route content)
            └─ index.tsx → ChatTextbox
```

The TitleBar uses `-webkit-app-region: drag` for Electron window dragging and adjusts padding for macOS traffic lights based on `window.electronAPI.platform`.

## Pi SDK Reference

When working with the `@mariozechner/pi-coding-agent` SDK, refer to the local installation:

- **Docs:** `/Users/snehasishdawn/.nvm/versions/node/v25.8.2/lib/node_modules/@mariozechner/pi-coding-agent/docs`
- **Examples:** `/Users/snehasishdawn/.nvm/versions/node/v25.8.2/lib/node_modules/@mariozechner/pi-coding-agent/examples`
