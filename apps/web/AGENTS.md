# AGENTS.md — web

> Auto-generated context for coding agents. Last updated: 2026-04-27

## Purpose

React web UI layer — the primary user interface for the lamda desktop app, providing chat interface, workspace management, diff panel, terminal, file browser, and settings.

## Quick Reference

| Action    | Command                      |
| --------- | ---------------------------- |
| Dev       | `npm run dev -w web`         |
| Build     | `npm run build -w web`       |
| Lint      | `npm run lint -w web`        |
| Typecheck | `npm run check-types -w web` |
| Preview   | `npm run preview -w web`    |

## Architecture

Single-page React app using Vite + TanStack Router for file-based routing. UI components use shadcn/ui (base-ui preset) with Tailwind CSS 4 for styling. Code is organized into feature modules.

### Key Directories

- `src/routes/` — TanStack Router file-based routes
- `src/features/` — Feature modules (chat, git, workspace, settings, terminal, layout, electron, file-tree)
- `src/shared/` — Shared UI components used across features
- `src/types/` — TypeScript type definitions

### Feature Modules

Each feature module follows a consistent structure with `api.ts`, `queries.ts`, `mutations.ts`, `context.tsx`, and `components/` subdirectory:

- `features/chat/` — Chat interface, message rendering, streaming, tool calls, thinking indicators
- `features/chat/hooks/` — Streaming hooks: `useSessionStream`, `useChatSyncEngine`, `useVisibleMessages`, `useScrollMeta`, `usePrefetchMessages`, `useApiErrorToasts`
- `features/git/` — Git diff panel, branch selector, staging, committing, stash management
- `features/workspace/` — Workspace/sidebar management, thread creation, app sidebar
- `features/settings/` — Settings modal, provider configuration
- `features/terminal/` — xterm.js terminal panel
- `features/layout/` — Title bar, open-with button
- `features/electron/` — Electron-specific APIs (server port discovery)
- `features/file-tree/` — File browser with directory listing via server API
- `features/file-opening/` — File opening helper with editor discovery and open-with functionality (macOS)
- `features/chat-v2/` — (scaffold for future work, not currently used)

### Routes (src/routes/)

| File                  | Route                  | Purpose                                   |
| --------------------- | ---------------------- | ----------------------------------------- |
| `__root.tsx`          | `/`                    | Root layout with sidebar, workspace list  |
| `index.tsx`           | `/`                    | Redirects to last active thread           |
| `workspace.$threadId` | `/workspace/:threadId` | Main workspace view with chat/diff/tree   |
| `settings.tsx`        | `/settings`            | Settings page route                       |

## Key Files

- `src/main.tsx` — React app entry point
- `src/routes/__root.tsx` — Root route layout with sidebar and workspace navigation
- `src/routes/index.tsx` — Redirects to last thread or workspace list
- `src/routes/workspace.$threadId.tsx` — Thread view with ChatView, DiffPanel, TerminalPanel, FileTree
- `src/routes/settings.tsx` — Settings page route
- `src/routeTree.gen.ts` — Auto-generated route tree (do not edit manually)
- `src/features/chat/` — Chat feature module
  - `api.ts` — API client for session endpoints
  - `index.ts` — Barrel exports: ChatView, useSessionStream, sync engine, error handling
  - `queries.ts` — TanStack Query hooks (useSessionStats, useContextUsage, useThinkingLevels)
  - `mutations.ts` — TanStack Mutation hooks for prompts
  - `types.ts` — TypeScript types for messages, tool calls, errors
  - `session-events.ts` — Event type definitions and subscription helpers
  - `hooks/` — Streaming hooks (useSessionStream, useChatSyncEngine)
  - `components/` — Chat UI components (ChatView, MessageRow, ToolCallBlock, ContextChart)
- `src/features/chat/components/context-chart.tsx` — Context usage and cost display component
- `src/features/chat/hooks/use-chat-sync-engine.ts` — Message persistence sync engine
- `src/features/git/components/diff-panel.tsx` — Git diff side panel
- `src/features/workspace/components/app-sidebar.tsx` — Application sidebar navigation
- `src/features/terminal/components/terminal-panel.tsx` — Terminal output panel
- `src/features/layout/components/title-bar.tsx` — Custom title bar (for Electron frameless window)
- `src/features/file-tree/` — File browser feature module
- `src/shared/ui/` — shadcn/ui components

## Conventions

- **Feature-based architecture** — Each feature (chat, git, workspace, etc.) is a self-contained module
- **Feature index.ts** — Each feature exports its public API via `index.ts` barrel file
- **File-based routing** — Routes defined in `src/routes/` using TanStack Router conventions
- **Component naming** — kebab-case for files, PascalCase for exported components
- **UI components** — shadcn/ui components live in `src/shared/ui/` — regenerate via `npx shadcn` CLI
- **Data fetching** — use TanStack Query via feature-level `queries.ts` and `mutations.ts`
- **Styling** — Tailwind CSS 4 with `@tailwindcss/vite` plugin; use `cn()` utility for conditional classes
- **React Compiler** — enabled via `babel-plugin-react-compiler` in Vite config
- **Lazy loading** — Heavy components (DiffPanel, TerminalPanel, FileTree) use `React.lazy()` with Suspense
- **Chat streaming** — `useSessionStream` hook manages SSE connection and real-time UI updates

## Dependencies

- `@tanstack/react-router` — File-based routing
- `@tanstack/react-query` — Server state management
- `@base-ui/react` — Base UI component primitives (shadcn/ui foundation)
- `tailwindcss` — Utility-first CSS framework (v4)
- `react-markdown` + `remark-gfm` — Markdown rendering for agent responses
- `react-syntax-highlighter` — Syntax highlighting for code blocks
- `lucide-react` — Icon library
- `class-variance-authority` — Component variant management
- `@xterm/xterm` + `@xterm/addon-fit` — Terminal emulation
- `react-resizable-panels` — Resizable panel layout for chat/diff/terminal
- `cmdk` — Command menu component
- `sonner` — Toast notifications
- `next-themes` — Theme management

## Gotchas

- `routeTree.gen.ts` is auto-generated — do not edit manually; run `npm run dev -w web` to regenerate
- The app expects `VITE_SERVER_URL` env var to point to the Hono server (default: `http://localhost:3001`)
- Tailwind CSS 4 uses a different config approach than v3 — check `index.css` for theme configuration
- The `title-bar` component is designed for Electron frameless window integration
- xterm.js requires the fit addon to properly resize in the terminal panel
- FileTree fetches directory contents from `/api/directory` endpoint; requires server to support this route
- Heavy components (DiffPanel, TerminalPanel, FileTree) are lazily loaded with Suspense for code splitting
- ToolCallBlock: All tools start collapsed by default (only edit tools auto-expand)

## Related

- [apps/desktop](../desktop/AGENTS.md) — Electron shell that loads this web app
- [apps/server](../server/AGENTS.md) — Backend API server
- [packages/pi-sdk](../../packages/pi-sdk/AGENTS.md) — Pi agent SDK used by server