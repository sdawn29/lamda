# AGENTS.md — server

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Hono API server that manages Pi coding agent sessions, handles workspace/thread CRUD, provides file system access, and streams agent events to the web UI via SSE.

## Quick Reference

| Action    | Command                                |
| --------- | -------------------------------------- |
| Dev       | `npm run dev -w @lamda/server`         |
| Build     | `npm run build -w @lamda/server`       |
| Start     | `npm run start -w @lamda/server`       |
| Typecheck | `npm run check-types -w @lamda/server` |

## Architecture

Hono server (default port 3001) with three layers:

1. **Entry** (`index.ts`) — Resolves port, bootstraps persisted sessions, starts HTTP server, signals readiness via JSON on stdout
2. **Routes** (`routes/`) — API endpoints organized by domain: workspaces, threads, sessions, git, auth, settings, health, directory, file
3. **Services** (`services/`) — Business logic for session management, terminal, and auth

### Directory Structure

- `src/routes/` — Hono route handlers (workspaces, threads, sessions, git, auth, settings, health, directory, file)
- `src/routes/AGENTS.md` — Detailed endpoint documentation
- `src/services/` — Business logic layer (session-service, terminal-service, auth-service)
- `src/index.ts` — Entry point; writes `{ready: true, port: N}` to stdout for Electron parent process
- `src/app.ts` — Hono app setup with all routes registered
- `src/store.ts` — In-memory session store mapping sessionId ↔ threadId ↔ ManagedSessionHandle
- `src/message-buffer.ts` — Buffers streaming assistant text deltas before flushing to DB as a single message
- `src/bootstrap.ts` — Re-creates Pi sessions for all persisted threads on server startup
- `src/port.ts` — Port resolution: `PORT` env → `--port=N` argv → default `3001`
- `src/session-events.ts` — SSE event type definitions and builders
- `src/thread-status-broadcaster.ts` — Broadcasts thread status changes to all connected clients

## API Endpoints

### Routes (src/routes/)

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
| `POST`   | `/session/:id/steer`             | Queue steering message (interrupts after tool calls)     |
| `POST`   | `/session/:id/follow-up`         | Queue follow-up message (waits for idle)                 |
| `POST`   | `/session/:id/abort`             | Abort current agent operation                            |
| `GET`    | `/session/:id/commands`          | Get available slash commands                             |
| `GET`    | `/session/:id/thinking-levels`   | Get available thinking levels                            |
| `GET`    | `/session/:id/context-usage`     | Get current context window usage                         |
| `GET`    | `/session/:id/stats`             | Get session statistics (messages, tokens, cost)          |
| `POST`   | `/session/:id/compact`           | Trigger context window compaction                        |
| `GET`    | `/session/:id/branch`            | Get current git branch for session's cwd                 |
| `GET`    | `/session/:id/branches`          | List all git branches for session's cwd                  |
| `POST`   | `/session/:id/checkout`          | Checkout a git branch                                    |
| `GET`    | `/session/:id/messages`          | Get persisted message blocks for session                 |
| `GET`    | `/session/:id/running-tools`     | Get running tools for state restoration                  |
| `GET`    | `/session/:id/events`            | SSE stream of agent events                               |
| `GET`    | `/session/:id/workspace-files`   | List all files in workspace (recursive)                  |
| `DELETE` | `/reset`                         | Delete all workspaces and sessions (debug)               |
| `GET`    | `/directory`                     | List directory contents for file browser                 |
| `GET`    | `/file`                          | Read file contents for preview                           |

### WebSocket Endpoints (src/websocket/)

| Path                              | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `/terminal`                       | PTY terminal sessions via node-pty        |
| `/ws/events`                      | Global events (server status, OAuth)      |
| `/ws/session/:id/events`          | Session event stream (alternative to SSE) |
| `/ws/session/:id/commands`        | Unified command channel (prompt, git ops) |
| `/ws/auth/oauth/:provider/events` | OAuth flow events                         |

### Unified Command Protocol (WebSocket)

All session operations can be sent via `/ws/session/:id/commands`:

**Client → Server Messages:**

- `prompt` — Send user prompt (with optional images, model, thinking level)
- `steer` — Queue steering message
- `follow-up` — Queue follow-up message
- `abort` — Abort current operation
- `compact` — Trigger context compaction
- `git:*` — Git commands (stage, unstage, commit, checkout, etc.)
- `workspace:reindex` — Trigger workspace file reindex

**Server → Client Messages:**

- `ack` — Command acknowledgment
- `git:result` — Git operation result
- `git:status` — Git status update (after operations)
- `git:progress` — Git operation progress
- `server_error` — Error response
- `workspace:progress` — Workspace indexing progress

### Core Services

| Service      | File                                                             | Responsibility                      |
| ------------ | ---------------------------------------------------------------- | ----------------------------------- |
| Session      | `session-service.ts`                                             | Session lifecycle, pi-sdk wrapper   |
| Terminal     | `terminal-service.ts`                                            | PTY management, WebSocket streaming |
| Auth         | `auth-service.ts`                                                | API key resolution                  |
| Indexer      | `workspace-indexer.ts`                                           | Workspace file indexing             |
| WebSocket    | `websocket/session-commands.ts`                                  | Unified command handler             |
| Broadcasters | `thread-status-broadcaster.ts`, `workspace-index-broadcaster.ts` | Event distribution                  |

## Conventions

- **No test framework** — tests not configured
- **Build target** is CommonJS (`dist/server.cjs`) via esbuild, not ESM
- **CORS enabled** for all routes (needed for dev when web UI runs on different port)
- **Server binds to `127.0.0.1`** only — not exposed to network
- **SIGTERM/SIGINT** handlers exit gracefully

## Dependencies

- `hono` — Web framework
- `@hono/node-server` — Node.js adapter for Hono
- `@lamda/pi-sdk` — Pi coding agent session management
- `@lamda/db` — Database queries for persistence
- `@lamda/git` — Git operations (branch detection)
- `node-pty` — PTY for terminal emulation
- `ws` — WebSocket support for terminal
- `@types/ws` — TypeScript types for WebSocket
- `tsx` — TypeScript execution in development
- `esbuild` — Production bundler

## Gotchas

- **Readiness protocol**: The server writes `{ready: true, port: N}` as the first line to stdout — the Electron main process parses this to know when the server is ready. Do not write anything to stdout before this line.
- **Prompt is fire-and-forget**: `POST /session/:id/prompt` returns 202 immediately; the actual agent response arrives via the SSE stream at `GET /session/:id/events`.
- **Message buffering**: Assistant text deltas are accumulated in `messageBuffer` and only flushed to the DB on `agent_end` or stream abort. This prevents partial messages in the database.
- **Session bootstrap is non-fatal**: On startup, individual session creation failures are logged but don't crash the server.
- **Build script** uses `build.mjs` (custom esbuild config), not `tsc` — the output is a single CJS bundle.
- **Directory endpoint** (`/directory`) is used by the web UI's file browser feature to load workspace directory trees

## Related

- [apps/server/src/routes/AGENTS.md](apps/server/src/routes/AGENTS.md) — REST API endpoint details
- [apps/desktop](../desktop/AGENTS.md) — Electron parent that spawns this server
- [apps/web](../web/AGENTS.md) — Web UI that consumes this API
- [packages/pi-sdk](../../packages/pi-sdk/AGENTS.md) — Pi agent session SDK
- [packages/db](../../packages/db/AGENTS.md) — Database layer
- [packages/git](../../packages/git/AGENTS.md) — Git utilities
