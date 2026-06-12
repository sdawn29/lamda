# API Reference

Base URL: `http://localhost:3001` (configurable via `PORT` env var)

## Sessions

### Create Session

```http
POST /session
Content-Type: application/json

{
  "cwd": "/path/to/workspace",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet"
}
```

**Response** `201 Created`:
```json
{
  "sessionId": "abc123"
}
```

---

### Send Prompt

```http
POST /session/:id/prompt
Content-Type: application/json

{
  "text": "Fix the login bug",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet",
  "thinkingLevel": "medium"
}
```

**Response** `202 Accepted` (fire-and-forget):
```json
{
  "accepted": true
}
```

Events stream via the session WebSocket channel.

---

### Get Session Status

```http
GET /session/:id/status
```

**Response**:
```json
{
  "status": "idle"
}
```

Status values: `"idle"`, `"running"`, `"error"`

---

### Abort Session

```http
POST /session/:id/abort
```

**Response** `200 OK`:
```json
{
  "aborted": true
}
```

---

### Dismiss Error

```http
POST /session/:id/dismiss-error
```

Clears the current error state without aborting the session.

**Response** `200 OK`:
```json
{
  "ok": true
}
```

---

### Queue Steering Message

```http
POST /session/:id/steer
Content-Type: application/json

{
  "text": "Use the new API instead"
}
```

Steering messages interrupt after the current tool call completes.

---

### Queue Follow-up Message

```http
POST /session/:id/follow-up
Content-Type: application/json

{
  "text": "Also check the tests"
}
```

Follow-up messages wait until the agent is idle.

---

### Session Events (WebSocket)

Session events are streamed via WebSocket. Connect to the server's WebSocket endpoint and subscribe to the session channel.

**Event Types:**

| Event | Data | Description |
|-------|------|-------------|
| `agent_start` | `{ threadId }` | Agent started processing |
| `message_delta` | `{ text, messageId }` | Streaming text delta |
| `tool_execute` | `{ toolCallId, name, args }` | Tool execution started |
| `tool_result` | `{ toolCallId, result, durationMs }` | Tool execution completed |
| `thinking_block` | `{ thinking, messageId }` | Thinking output |
| `context_usage` | `{ usage }` | Context window stats |
| `agent_end` | `{ messageId, compact }` | Agent finished |
| `error` | `{ message }` | Error occurred |

---

### Get Session Commands

```http
GET /session/:id/commands
```

**Response**:
```json
{
  "commands": [
    { "name": "read_file", "description": "..." },
    { "name": "edit_file", "description": "..." }
  ]
}
```

---

### Get Thinking Levels

```http
GET /session/:id/thinking-levels
```

**Response**:
```json
{
  "levels": ["off", "minimal", "low", "medium", "high", "xhigh"]
}
```

---

### Get Context Usage

```http
GET /session/:id/context-usage
```

**Response**:
```json
{
  "contextUsage": {
    "usedTokens": 45000,
    "maxTokens": 200000,
    "percentage": 22.5
  }
}
```

---

### Get Session Stats

```http
GET /session/:id/stats
```

**Response**:
```json
{
  "stats": {
    "messagesCount": 25,
    "totalTokens": 150000,
    "inputTokens": 100000,
    "outputTokens": 50000,
    "costUSD": 0.45
  }
}
```

---

### Compact Context

```http
POST /session/:id/compact
```

**Response** `200 OK`:
```json
{
  "ok": true
}
```

---

### Get Messages

```http
GET /session/:id/messages
```

**Response**:
```json
{
  "blocks": [
    { "id": "...", "type": "user", "content": "Fix the bug" },
    { "id": "...", "type": "assistant", "content": "I'll fix it..." },
    { "id": "...", "type": "tool", "toolName": "read_file", "args": {...}, "result": "..." }
  ]
}
```

---

### Get Running Tools

```http
GET /session/:id/running-tools
```

Returns tool blocks that were running when the session was interrupted.

---

### Get Workspace Files

```http
GET /session/:id/workspace-files
```

Returns the indexed file list for the session's workspace.

**Response**:
```json
{
  "files": [
    { "relativePath": "src/index.ts", "name": "index.ts", "isDirectory": false },
    { "relativePath": "src/components", "name": "components", "isDirectory": true }
  ]
}
```

---

### Revert to Message

```http
POST /session/:id/revert-to-message
Content-Type: application/json

{
  "messageBlockId": "block-abc123"
}
```

Truncates the thread history at the given message block and restores the git working tree to the checkpoint recorded at that agent turn.

**Response** `200 OK`:
```json
{
  "ok": true
}
```

---

### Fork Session

```http
POST /session/:id/fork
Content-Type: application/json

{
  "messageBlockId": "block-abc123"
}
```

Creates a new thread by copying messages up to the given block, restores the git state to that checkpoint, and returns the new thread and session IDs.

**Response** `200 OK`:
```json
{
  "threadId": "thread-xyz",
  "sessionId": "session-xyz"
}
```

---

### Delete Session

```http
DELETE /session/:id
```

**Response**: `204 No Content`

---

## Tasks

Workspace tasks are user-defined shell command shortcuts stored per workspace.

### List Tasks

```http
GET /tasks/:workspaceId
```

**Response**:
```json
{
  "tasks": [
    { "id": "task1", "icon": "🧪", "command": "npm test", "createdAt": 1716000000 }
  ]
}
```

---

### Create Task

```http
POST /tasks/:workspaceId
Content-Type: application/json

{
  "icon": "🧪",
  "command": "npm test"
}
```

**Response** `201 Created`:
```json
{
  "task": { "id": "task1", "icon": "🧪", "command": "npm test", "createdAt": 1716000000 }
}
```

---

### Update Task

```http
PATCH /tasks/:workspaceId/:id
Content-Type: application/json

{
  "icon": "🔨",
  "command": "npm run build"
}
```

**Response**:
```json
{ "success": true }
```

---

### Delete Task

```http
DELETE /tasks/:workspaceId/:id
```

**Response**:
```json
{ "success": true }
```

---

## Workspaces

### List Workspaces

```http
GET /workspaces
```

**Response**:
```json
{
  "workspaces": [
    {
      "id": "ws1",
      "name": "my-project",
      "path": "/Users/me/projects/my-project",
      "threads": [...]
    }
  ]
}
```

---

### Create Workspace

```http
POST /workspace
Content-Type: application/json

{
  "name": "my-project",
  "path": "/Users/me/projects/my-project"
}
```

**Response** `201 Created`:
```json
{
  "workspace": {
    "id": "ws1",
    "name": "my-project",
    "path": "/Users/me/projects/my-project",
    "threads": [...]
  }
}
```

---

### Get Workspace

```http
GET /workspace/:id
```

---

### Update Workspace

```http
PATCH /workspace/:id
Content-Type: application/json

{
  "name": "new-name"
}
```

---

### Delete Workspace

```http
DELETE /workspace/:id
```

**Response**: `204 No Content`

---

## Threads

### Create Thread

```http
POST /workspace/:workspaceId/thread
Content-Type: application/json

{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet"
}
```

---

### Update Thread Title

```http
PATCH /thread/:id/title
Content-Type: application/json

{
  "title": "Fix login bug"
}
```

---

### Update Thread Model

```http
PATCH /thread/:id/model
Content-Type: application/json

{
  "modelId": "claude-3-5-sonnet"
}
```

---

### Archive Thread

```http
PATCH /thread/:id/archive
```

---

### Unarchive Thread

```http
PATCH /thread/:id/unarchive
```

---

### Pin Thread

```http
PATCH /thread/:id/pin
```

---

### Unpin Thread

```http
PATCH /thread/:id/unpin
```

---

### Delete Thread

```http
DELETE /thread/:id
```

---

## Git

### Get Current Branch

```http
GET /session/:id/branch
```

**Response**:
```json
{
  "branch": "main"
}
```

---

### List Branches

```http
GET /session/:id/branches
```

**Response**:
```json
{
  "branches": ["main", "feature/login", "hotfix/payment"]
}
```

---

### Checkout Branch

```http
POST /session/:id/checkout
Content-Type: application/json

{
  "branch": "feature/login"
}
```

---

### Create Branch

```http
POST /session/:id/branch
Content-Type: application/json

{
  "branch": "feature/new-feature"
}
```

---

### Initialize Git Repo

```http
POST /session/:id/git/init
```

---

### Get Git Status

```http
GET /session/:id/git/status
```

**Response**:
```json
{
  "raw": "M  file1.ts\n?? file2.ts"
}
```

---

### Get Diff Statistics

```http
GET /session/:id/git/diff-stat
```

**Response**:
```json
{
  "files": [
    { "path": "src/index.ts", "additions": 10, "deletions": 5 }
  ],
  "totalAdditions": 10,
  "totalDeletions": 5
}
```

---

### Get File Diff

```http
GET /session/:id/git/diff?file=src/index.ts&status=M
```

**Response**:
```json
{
  "diff": "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,5 +1,6 @@\n..."
}
```

---

### Get Commit History

```http
GET /session/:id/git/log
GET /workspace/:id/git/log
```

Returns recent commits. The workspace-level endpoint is read-only and lets the UI show history without an active session.

---

### Commit

```http
POST /session/:id/git/commit
Content-Type: application/json

{
  "message": "feat: add new feature"
}
```

---

### Generate Commit Message

```http
POST /session/:id/git/generate-commit-message
Content-Type: application/json

{
  "promptTemplate": "conventional"
}
```

---

### Push

```http
POST /session/:id/git/push
```

---

### Stage File

```http
POST /session/:id/git/stage
Content-Type: application/json

{
  "filePath": "src/index.ts"
}
```

---

### Unstage File

```http
POST /session/:id/git/unstage
Content-Type: application/json

{
  "filePath": "src/index.ts"
}
```

---

### Stage All

```http
POST /session/:id/git/stage-all
```

---

### Unstage All

```http
POST /session/:id/git/unstage-all
```

---

### Revert File

```http
POST /session/:id/git/revert-file
Content-Type: application/json

{
  "filePath": "src/index.ts",
  "raw": "original content"
}
```

---

### Stash Changes

```http
POST /session/:id/git/stash
Content-Type: application/json

{
  "message": "WIP: work in progress"
}
```

---

### List Stashes

```http
GET /session/:id/git/stash-list
```

---

### Pop Stash

```http
POST /session/:id/git/stash-pop
Content-Type: application/json

{
  "ref": "stash@{0}"
}
```

---

### Apply Stash

```http
POST /session/:id/git/stash-apply
Content-Type: application/json

{
  "ref": "stash@{0}"
}
```

---

### Drop Stash

```http
POST /session/:id/git/stash-drop
Content-Type: application/json

{
  "ref": "stash@{0}"
}
```

---

## LSP (Language Server Protocol)

Connect via WebSocket to `/ws/workspace/:workspaceId/lsp`.

**Client → Server:**
```json
{ "kind": "open",    "id": 1, "filePath": "src/index.ts", "content": "..." }
{ "kind": "close",   "id": 2, "filePath": "src/index.ts" }
{ "kind": "request", "id": 3, "filePath": "src/index.ts", "method": "textDocument/hover", "params": {...} }
```

**Server → Client:**
```json
{ "kind": "response",    "id": 3, "result": {...} }
{ "kind": "diagnostics", "filePath": "src/index.ts", "diagnostics": [...] }
```

Diagnostics are pushed for all open documents whenever the language server reports changes.

---

## Terminal

Connect via WebSocket to `/terminal`:

**Client → Server:**
```json
{ "type": "input", "data": "ls -la\n" }
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "kill" }
```

**Server → Client:**
```json
{ "type": "output", "data": "total 32\ndrwxr-xr-x  9 user  staff  288 Apr 28 10:00 .\n" }
{ "type": "exit", "code": 0 }
```

---

## Settings

### Get Settings

```http
GET /settings
```

**Response**:
```json
{
  "settings": { "theme": "catppuccin", "...": "..." }
}
```

---

### Save Setting

```http
PUT /settings/:key
Content-Type: application/json

{
  "value": "catppuccin"
}
```

---

## Usage

### Get AI Usage Stats

```http
GET /usage
GET /usage?days=30
GET /usage?from=2026-06-01&to=2026-06-12
```

Aggregated AI token and cost usage. Filters are mutually exclusive (`from`/`to` win over `days`):

| Query Param | Description |
|-------------|-------------|
| `from` / `to` | Inclusive `YYYY-MM-DD` date range (local time); either bound may be omitted |
| `days` | Last N days; omit or pass `0` for all-time |

---

## Local Models

### List Local Providers

```http
GET /local-providers
```

---

### Create or Update Local Provider

```http
PUT /local-providers/:id
```

---

### Delete Local Provider

```http
DELETE /local-providers/:id
```

---

## Auth

### Get Auth Config

```http
GET /auth
```

---

### Save Provider Auth

```http
POST /auth
Content-Type: application/json

{
  "provider": "anthropic",
  "apiKey": "sk-..."
}
```

---

## Health

### Health Check

```http
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "uptime": 3600
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

With appropriate HTTP status codes:
- `400` — Bad request (missing required fields)
- `404` — Resource not found
- `500` — Internal server error