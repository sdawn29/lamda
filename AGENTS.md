# AGENTS.md — lamda (root)

> Auto-generated context for coding agents. Last updated: 2026-04-25

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
    ├── git/          — Git operations utility
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

- [apps/web](apps/web/AGENTS.md)
- [apps/desktop](apps/desktop/AGENTS.md)
- [apps/server](apps/server/AGENTS.md)
- [packages/db](packages/db/AGENTS.md)
- [packages/git](packages/git/AGENTS.md)
- [packages/pi-sdk](packages/pi-sdk/AGENTS.md)