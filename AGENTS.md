# AGENTS.md — lamda (root)

> Auto-generated context for coding agents. Last updated: 2026-05-17

## Purpose

Monorepo for an Electron desktop app wrapping a React web UI, backed by a Hono server that manages Pi coding agent sessions.

## Tech Stack

| Layer               | Technology                                                               |
| ------------------- | ------------------------------------------------------------------------ |
| Package manager     | npm (workspaces)                                                         |
| Build orchestration | Turborepo                                                                |
| Web UI              | React 19 + Vite + TanStack Router + Tailwind CSS 4 + shadcn/ui (base-ui) |
| Desktop             | Electron 41                                                              |
| Server              | Hono (Node.js)                                                           |
| Database            | Drizzle ORM + better-sqlite3                                             |
| AI Agent            | @mariozechner/pi-coding-agent                                            |
| Language            | TypeScript (strict)                                                      |

## Quick Reference

| Action           | Command               |
| ---------------- | --------------------- |
| Install          | `npm install`         |
| Dev (all apps)   | `npm run dev`         |
| Dev (single app) | `npm run dev -w web`  |
| Build (all)      | `npm run build`       |
| Lint (all)       | `npm run lint`        |
| Type-check (all) | `npm run check-types` |
| Format           | `npm run format`      |

## Architecture

```
lamda/
├── apps/
│   ├── web/          — React UI layer (Vite + TanStack Router)
│   ├── desktop/      — Electron shell wrapping the web app
│   └── server/       — Hono API server for Pi agent sessions (port 3001)
└── packages/
    ├── db/           — Drizzle ORM + SQLite database layer
    ├── git/          — Git CLI wrappers
    ├── mcp/          — MCP (Model Context Protocol) client integration
    └── pi-sdk/       — Wrapper around @mariozechner/pi-coding-agent
```

## Key Conventions

- **No tests** currently exist — do not assume a test framework
- **npm workspaces** — use `-w <name>` flag for workspace-specific commands
- **Turborepo** pipeline defined in `turbo.json` — tasks: `build`, `dev`, `lint`, `check-types`
- **TypeScript strict mode** across all packages
- **ESM** (`"type": "module"`) in all packages
- Internal packages use `@lamda/*` naming convention

## Environment Variables

| Variable          | Used By | Default                 |
| ----------------- | ------- | ----------------------- |
| `VITE_SERVER_URL` | web     | `http://localhost:3001` |
| `PORT`            | server  | `3001`                  |

## Related

- [apps/web](apps/web/AGENTS.md) — React UI layer with features: chat, git, terminal, settings, workspace
- [apps/desktop](apps/desktop/AGENTS.md) — Electron shell that loads the web app
- [apps/server/src/routes](apps/server/src/routes/AGENTS.md) — REST endpoints for sessions, threads, git, settings
- [packages/db](packages/db/AGENTS.md) — Drizzle ORM + SQLite persistence
- [packages/git](packages/git/AGENTS.md) — Git CLI wrappers
- [packages/mcp](packages/mcp/AGENTS.md) — MCP client integration for pi-coding-agent
- [packages/pi-sdk](packages/pi-sdk/AGENTS.md) — Wrapper around @mariozechner/pi-coding-agent
- [packages/subagent](packages/subagent/AGENTS.md) — Stub package for subagent orchestration (not implemented)

## Feature Module AGENTS.md

Detailed AGENTS.md files for complex web feature modules:

| Feature | Path | Complexity |
|---------|------|-------------|
| [Chat](apps/web/src/features/chat/AGENTS.md) | `web/src/features/chat/` | 34 files, streaming architecture |
| [Git](apps/web/src/features/git/AGENTS.md) | `web/src/features/git/` | 26 files, diff + staging workflow |
| [MCP](apps/web/src/features/mcp/AGENTS.md) | `web/src/features/mcp/` | MCP server integration |
| [Routes (server)](apps/server/src/routes/AGENTS.md) | `server/src/routes/` | REST endpoints: sessions, threads, git, files |
| [Layout](apps/web/src/features/layout/AGENTS.md) | `web/src/features/layout/` | Title bar, navigation, panel toggles, editor integration |
| [Terminal](apps/web/src/features/terminal/AGENTS.md) | `web/src/features/terminal/` | xterm.js + WebSocket PTY |
| [Settings](apps/web/src/features/settings/AGENTS.md) | `web/src/features/settings/` | Provider config, API keys |
| [Workspace](apps/web/src/features/workspace/AGENTS.md) | `web/src/features/workspace/` | 9 files, workspace/thread lifecycle |
| [File Tree](apps/web/src/features/file-tree/AGENTS.md) | `web/src/features/file-tree/` | 4 files, file navigation |
| [Electron](apps/web/src/features/electron/AGENTS.md) | `web/src/features/electron/` | 5 files, desktop integration |
| [Command Palette](apps/web/src/features/command-palette/AGENTS.md) | `web/src/features/command-palette/` | 3 files, Cmd+K command interface |
| [Main Tabs](apps/web/src/features/main-tabs/AGENTS.md) | `web/src/features/main-tabs/` | 4 files, tab management |
| [Tasks](apps/web/src/features/tasks/AGENTS.md) | `web/src/features/tasks/` | 4 files, workspace tasks |
| [File Opening](apps/web/src/features/file-opening/AGENTS.md) | `web/src/features/file-opening/` | File open dialog + editor integration |
| [Tree View](apps/web/src/features/tree-view/AGENTS.md) | `web/src/features/tree-view/` | Planned: virtualized tree (stub) |
| [Shared](apps/web/src/shared/AGENTS.md) | `web/src/shared/` | 54+ files, UI components + utilities |
| [Routes](apps/web/src/routes/AGENTS.md) | `web/src/routes/` | TanStack Router file-based routing |
| [Providers](apps/web/src/providers/AGENTS.md) | `web/src/providers/` | AppProviders composition layer |