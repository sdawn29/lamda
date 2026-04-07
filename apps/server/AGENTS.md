# AGENTS.md — server

> Auto-generated context for coding agents. Last updated: 2026-04-07

## Purpose

Hono API server that manages Pi coding agent sessions, handles workspace/thread CRUD, and streams agent events to the web UI via SSE.

## Quick Reference

| Action    | Command                                  |
| --------- | ---------------------------------------- |
| Dev       | `npm run dev -w @lambda/server`         |
| Build     | `npm run build -w @lambda/server`       |
| Start     | `npm run start -w @lambda/server`       |
| Typecheck | `npm run check-types -w @lambda/server` |

## Architecture

Hono server (default port 3001) with three layers:

1. **Entry** (`index.ts`) — Resolves port, bootstraps persisted sessions, starts HTTP server, signals readiness via JSON on stdout
2. **Routes** (`app.ts`) — All API endpoints: workspaces, threads, sessions, prompts, SSE event streams
3. **Support** (`store.ts`, `message-buffer.ts`, `bootstrap.ts`, `port.ts`) — Session lifecycle, message persistence, port resolution

### Key Files

- `src/index.ts` — Entry point; writes `{ready: true, port: N}` to stdout for Electron parent process
- `src/app.ts` — Hono app with all route definitions
- `src/store.ts` — In-memory session store mapping sessionId ↔ threadId ↔ ManagedSessionHandle
- `src/message-buffer.ts` — Buffers streaming assistant text deltas before flushing to DB as a single message
- `src/bootstrap.ts` — Re-creates Pi sessions for all persisted threads on server startup
- `src/port.ts` — Port resolution: `PORT` env → `--port=N` argv → default `3001`
- `build.mjs` — esbuild bundler that produces `dist/server.cjs`

## API Endpoints

| Method   | Path                             | Description                                              |
| -------- | -------------------------------- | -------------------------------------------------------- |
| `GET`    | `/health`                        | Health check with uptime                                 |
| `GET`    | `/models`                        | List available AI models                                 |
| `POST`   | `/title`                         | Generate a thread title from a message                   |
| `GET`    | `/workspaces`                    | List all workspaces with their threads                   |
| `POST`   | `/workspace`                     | Create workspace + initial thread + Pi session           |
| `DELETE` | `/workspace/:id`                 | Delete workspace and all associated sessions             |
| `POST`   | `/workspace/:workspaceId/thread` | Create new thread + Pi session in workspace              |
| `DELETE` | `/thread/:id`                    | Delete thread and its session                            |
| `PATCH`  | `/thread/:id/title`              | Update thread title                                      |
| `POST`   | `/session`                       | Legacy: create standalone session                        |
| `DELETE` | `/session/:id`                   | Delete session                                           |
| `POST`   | `/session/:id/prompt`            | Send user prompt to agent (returns 202, fire-and-forget) |
| `GET`    | `/session/:id/branch`            | Get current git branch for session's cwd                 |
| `GET`    | `/session/:id/branches`          | List all git branches for session's cwd                  |
| `POST`   | `/session/:id/checkout`          | Checkout a git branch                                    |
| `GET`    | `/session/:id/messages`          | Get persisted messages for session                       |
| `GET`    | `/session/:id/events`            | SSE stream of agent events                               |
| `DELETE` | `/reset`                         | Delete all workspaces and sessions (debug)               |

## Conventions

- **No test framework** — tests not configured
- **Build target** is CommonJS (`dist/server.cjs`) via esbuild, not ESM
- **CORS enabled** for all routes (needed for dev when web UI runs on different port)
- **Server binds to `127.0.0.1`** only — not exposed to network
- **SIGTERM/SIGINT** handlers exit gracefully

## Dependencies

- `hono` — Web framework
- `@hono/node-server` — Node.js adapter for Hono
- `@lambda/pi-sdk` — Pi coding agent session management
- `@lambda/db` — Database queries for persistence
- `@lambda/git` — Git operations (branch detection)
- `tsx` — TypeScript execution in development
- `esbuild` — Production bundler

## Gotchas

- **Readiness protocol**: The server writes `{ready: true, port: N}` as the first line to stdout — the Electron main process parses this to know when the server is ready. Do not write anything to stdout before this line.
- **Prompt is fire-and-forget**: `POST /session/:id/prompt` returns 202 immediately; the actual agent response arrives via the SSE stream at `GET /session/:id/events`.
- **Message buffering**: Assistant text deltas are accumulated in `messageBuffer` and only flushed to the DB on `agent_end` or stream abort. This prevents partial messages in the database.
- **Session bootstrap is non-fatal**: On startup, individual session creation failures are logged but don't crash the server.
- **Build script** uses `build.mjs` (custom esbuild config), not `tsc` — the output is a single CJS bundle.

## Related

- [apps/desktop](../desktop/AGENTS.md) — Electron parent that spawns this server
- [apps/web](../web/AGENTS.md) — Web UI that consumes this API
- [packages/pi-sdk](../../packages/pi-sdk/AGENTS.md) — Pi agent session SDK
- [packages/db](../../packages/db/AGENTS.md) — Database layer
- [packages/git](../../packages/git/AGENTS.md) — Git utilities
