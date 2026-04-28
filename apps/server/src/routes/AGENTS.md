# AGENTS.md — server/src/routes

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Route handlers for the Hono API server — exposes REST endpoints for sessions, threads, workspaces, git operations, files, settings, auth, and health checks.

## Architecture

```
routes/
├── sessions.ts    — Session lifecycle, prompts, SSE events, workspace files
├── threads.ts     — Thread CRUD, archive, pin, model selection
├── workspaces.ts — Workspace CRUD, listing
├── git.ts        — Git operations (branch, diff, commit, stash)
├── file.ts       — File read/write operations
├── settings.ts    — Settings management
├── auth.ts       — API key/auth management
└── health.ts     — Health check endpoints
```

## Key Patterns

### Session Context
All `/session/:id/*` routes use `store.get(id)` to retrieve session entry, then access:
- `entry.handle` — Pi agent SDK handle
- `entry.threadId` — Database thread ID
- `store.getCwd(id)` or `gitCwd(id)` — Working directory for git/file ops

### Error Handling
```typescript
function parseGitError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.split("\n").filter(Boolean);
  return (
    lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
    lines[0] ??
    fallback
  );
}
```

### SSE Streaming
Sessions use Hono's `streamSSE` with write queue pattern:
```typescript
const response = streamSSE(c, async (stream) => {
  let writeQueue = Promise.resolve();
  const queueWrite = (record) => {
    writeQueue = writeQueue.then(() => stream.writeSSE({...}));
  };
  // Subscribe to hub and write events
});
```

## Route Summary

### sessions.ts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/session` | Create new workspace + thread + session |
| DELETE | `/session/:id` | Dispose session |
| POST | `/session/:id/prompt` | Send user prompt to agent |
| POST | `/session/:id/abort` | Abort running agent |
| POST | `/session/:id/steer` | Queue steering message |
| POST | `/session/:id/follow-up` | Queue follow-up message |
| GET | `/session/:id/events` | SSE event stream |
| GET | `/session/:id/messages` | Get all message blocks |
| GET | `/session/:id/running-tools` | Get running tool blocks |
| GET | `/session/:id/commands` | List available commands |
| GET | `/session/:id/thinking-levels` | List available thinking levels |
| GET | `/session/:id/context-usage` | Get context usage stats |
| GET | `/session/:id/stats` | Get session stats (tokens, costs) |
| POST | `/session/:id/compact` | Compact conversation context |
| GET | `/session/:id/workspace-files` | List workspace files |

### threads.ts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/workspace/:workspaceId/thread` | Create new thread |
| DELETE | `/thread/:id` | Delete thread |
| PATCH | `/thread/:id/title` | Update thread title |
| PATCH | `/thread/:id/model` | Update thread model |
| PATCH | `/thread/:id/stopped` | Update stopped status |
| PATCH | `/thread/:id/last-accessed` | Update last accessed timestamp |
| PATCH | `/thread/:id/archive` | Archive thread |
| PATCH | `/thread/:id/unarchive` | Unarchive thread |
| PATCH | `/thread/:id/pin` | Pin thread |
| PATCH | `/thread/:id/unpin` | Unpin thread |
| GET | `/threads/archived` | List all archived threads |

### workspaces.ts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/workspaces` | List all workspaces with threads |
| POST | `/workspace` | Create workspace |
| GET | `/workspace/:id` | Get workspace by ID |
| PATCH | `/workspace/:id` | Update workspace |
| DELETE | `/workspace/:id` | Delete workspace |

### git.ts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/session/:id/branch` | Get current branch |
| GET | `/session/:id/branches` | List all branches |
| POST | `/session/:id/checkout` | Checkout branch |
| POST | `/session/:id/branch` | Create branch |
| POST | `/session/:id/git/init` | Initialize git repo |
| GET | `/session/:id/git/status` | Get git status |
| GET | `/session/:id/git/diff-stat` | Get diff statistics |
| GET | `/session/:id/git/diff` | Get file diff |
| POST | `/session/:id/git/commit` | Commit changes |
| POST | `/session/:id/git/generate-commit-message` | AI-generated commit message |
| POST | `/session/:id/git/push` | Push to remote |
| POST | `/session/:id/git/stage` | Stage file |
| POST | `/session/:id/git/unstage` | Unstage file |
| POST | `/session/:id/git/stage-all` | Stage all changes |
| POST | `/session/:id/git/unstage-all` | Unstage all changes |
| POST | `/session/:id/git/revert-file` | Revert file to HEAD |
| POST | `/session/:id/git/stash` | Stash changes |
| GET | `/session/:id/git/stash-list` | List stashes |
| POST | `/session/:id/git/stash-pop` | Pop stash |
| POST | `/session/:id/git/stash-apply` | Apply stash |
| POST | `/session/:id/git/stash-drop` | Drop stash |

### file.ts
File read/write operations (uses `@lamda/db` for file content storage).

### settings.ts
Settings CRUD operations.

### auth.ts
API key management (reads from `~/.pi/agent/auth.json`).

### health.ts
Health check endpoints for monitoring.

## Conventions

- **RESTful routing**: Resources nested under `/session/:id/` for session-scoped operations
- **JSON request/response**: All endpoints use JSON bodies and responses
- **Error format**: `{ error: string, ... }` with appropriate HTTP status codes
- **Fire-and-forget**: `prompt`, `steer`, `followUp` return 202 Accepted immediately
- **SSE retry**: All SSE endpoints include `retry` header with `SESSION_SSE_RETRY_MS`

## Gotchas

- **Prompt options**: `images`, `streamingBehavior`, `expandPromptTemplates` only included if non-default
- **Steer vs Follow-up**: Steer interrupts during tool calls; Follow-up waits for idle
- **Session store**: In-memory `store` Map, lost on server restart
- **Thread deletion**: Also disposes associated session via `sessionEvents.dispose()`
- **Git CWD lookup**: `gitCwd()` throws if session not found; `store.getCwd()` returns null

## Related

- [apps/server/AGENTS.md](../AGENTS.md) — Server app overview
- [apps/web/src/features/chat/AGENTS.md](../../../web/src/features/chat/AGENTS.md) — Chat module (SSE consumer)
- [apps/web/src/features/git/AGENTS.md](../../../web/src/features/git/AGENTS.md) — Git UI module
- [packages/pi-sdk/AGENTS.md](../../../packages/pi-sdk/AGENTS.md) — SDK handle types
- [packages/db/AGENTS.md](../../../packages/db/AGENTS.md) — Database schema
- [packages/git/AGENTS.md](../../../packages/git/AGENTS.md) — Git CLI wrappers
