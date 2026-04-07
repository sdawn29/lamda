# AGENTS.md — web

> Auto-generated context for coding agents. Last updated: 2026-04-07

## Purpose

React web UI layer — the primary user interface for the Lambda desktop app, providing chat interface, workspace management, and session controls.

## Quick Reference

| Action    | Command                      |
| --------- | ---------------------------- |
| Dev       | `npm run dev -w web`         |
| Build     | `npm run build -w web`       |
| Lint      | `npm run lint -w web`        |
| Typecheck | `npm run check-types -w web` |
| Preview   | `npm run preview -w web`     |

## Architecture

Single-page React app using Vite + TanStack Router for file-based routing. UI components use shadcn/ui (base-ui preset) with Tailwind CSS 4 for styling. Communicates with the Hono server via an API client layer.

### Key Directories

- `src/routes/` — TanStack Router file-based routes
- `src/components/` — React UI components (includes shadcn/ui in `ui/`)
- `src/api/` — Server API client and data models
- `src/queries/` — TanStack Query query definitions
- `src/mutations/` — TanStack Query mutation definitions
- `src/hooks/` — Custom React hooks
- `src/lib/` — Utility functions
- `src/types/` — TypeScript type definitions

## Key Files

- `src/main.tsx` — React app entry point
- `src/routes/__root.tsx` — Root route layout
- `src/routes/index.tsx` — Main page route
- `src/routeTree.gen.ts` — Auto-generated route tree (do not edit manually)
- `src/api/client.ts` — HTTP client for server communication
- `src/components/chat-view.tsx` — Main chat interface component
- `src/components/chat-textbox.tsx` — Chat input component
- `src/components/app-sidebar.tsx` — Application sidebar navigation
- `src/components/theme-provider.tsx` — Theme context provider
- `src/components/title-bar.tsx` — Custom title bar (for Electron integration)
- `src/components/branch-selector.tsx` — Git branch selection dropdown
- `src/components/commit-dialog.tsx` — Git commit dialog modal
- `src/components/diff-view.tsx` — Git diff rendering component
- `src/components/diff-panel.tsx` — Side panel for diff display
- `src/components/terminal-panel.tsx` — Terminal output panel
- `src/components/tool-call-block.tsx` — Tool call rendering
- `src/hooks/workspace-context.tsx` — Workspace context provider

## Conventions

- **File-based routing** — Routes defined in `src/routes/` using TanStack Router conventions
- **Component naming** — kebab-case for files (e.g., `chat-view.tsx`), PascalCase for exported components
- **UI components** — shadcn/ui components live in `src/components/ui/` — regenerate via `npx shadcn` CLI
- **Data fetching** — use TanStack Query via `queries/` and `mutations/` directories, not inline fetch calls
- **Styling** — Tailwind CSS 4 with `@tailwindcss/vite` plugin; use `cn()` utility from `lib/utils` for conditional classes
- **React Compiler** — enabled via `babel-plugin-react-compiler` in Vite config

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

## Gotchas

- `routeTree.gen.ts` is auto-generated — do not edit manually; run `npm run dev -w web` to regenerate
- The app expects `VITE_SERVER_URL` env var to point to the Hono server (default: `http://localhost:3001`)
- Tailwind CSS 4 uses a different config approach than v3 — check `index.css` for theme configuration
- The `title-bar` component is designed for Electron frameless window integration
- xterm.js requires the fit addon to properly resize in the terminal panel

## Related

- [apps/desktop](../desktop/AGENTS.md) — Electron shell that loads this web app
- [apps/server](../server/AGENTS.md) — Backend API server
- [packages/pi-sdk](../../packages/pi-sdk/AGENTS.md) — Pi agent SDK used by server
