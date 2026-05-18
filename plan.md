# Plan: Migrate to createAgentSessionRuntime (Desktop Pattern)

## Context

The SDK exports two session creation paths:
- `createAgentSession()` — simple single-session factory, minimal setup
- `createAgentSessionRuntime()` — desktop-appropriate factory using `createAgentSessionServices` + `createAgentSessionFromServices`, enables session replacement (new, fork, switch) and gives proper cwd-bound service lifecycle

This codebase is a desktop Electron app. The current pi-sdk uses `createAgentSession` (the server/CLI pattern). The refactoring migrates to `createAgentSessionRuntime` as the underlying mechanism in all three packages.

**Why this matters:**
- Aligns with the SDK's desktop architectural contract
- `createAgentSessionServices` sets up cwd-bound services (resource loader, settings, auth, model registry) in the correct layer — the runtime factory owns this boundary
- Unlocks session tree operations (fork, switch, new) that are the foundation of conversation branching in a desktop coding agent
- `SessionManager.createBranchedSession()` enables conversation fork UI (new thread from a message point)

---

## Changes

### 1. `packages/pi-sdk/src/session.ts` — Core migration

Replace `createAgentSession` with `createAgentSessionRuntime` + factory in both `createManagedSession` and `openManagedSession`. External function signatures stay identical.

**New imports:**
```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createReadOnlyTools,
  getAgentDir,
  type AgentSessionRuntime,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent"
```

**`buildHandle(session)` → `buildRuntimeHandle(runtime: AgentSessionRuntime)`:**

All `session.X` calls become `runtime.session.X`. The `getCommands()` method already uses the public `session.resourceLoader` getter (confirmed at line 391 of `agent-session.d.ts`). The `setCustomTools` hack stays as-is using `runtime.session as any`. The `events()` method passes `runtime.session` at call time: `sessionEventGenerator(runtime.session)`.

Add `fork` to `buildRuntimeHandle`:
```typescript
fork: async (entryId: string): Promise<string> => {
  const sf = runtime.session.sessionFile
  if (!sf) throw new Error("Cannot fork an in-memory session")
  const sm = SessionManager.open(sf)
  const newFile = sm.createBranchedSession(entryId)
  if (!newFile) throw new Error("No branch created for entryId: " + entryId)
  return newFile
}
```

**`createManagedSession`** — build factory inline, close over config:
```typescript
export async function createManagedSession(config: SdkConfig): Promise<ManagedSessionHandle> {
  const cwd = config.cwd ?? process.cwd()
  const authStorage = config.authStorage ?? buildAuthStorage(config)
  const modelRegistry = config.modelRegistry ?? ModelRegistry.create(authStorage)
  const model = config.provider && config.model ? modelRegistry.find(config.provider, config.model) : undefined

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: effectiveCwd, agentDir, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({ cwd: effectiveCwd, agentDir, authStorage, modelRegistry })
    const baseTools = createReadOnlyTools(effectiveCwd)
    const customTools = config.customTools ? [...baseTools, ...config.customTools] : baseTools
    return {
      ...(await createAgentSessionFromServices({
        services, sessionManager, sessionStartEvent,
        model, thinkingLevel: config.thinkingLevel as any, customTools,
      })),
      services,
      diagnostics: services.diagnostics,
    }
  }

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd, agentDir: getAgentDir(), sessionManager: SessionManager.create(cwd),
  })
  return buildRuntimeHandle(runtime)
}
```

**`openManagedSession`** — same factory, different `sessionManager`:
```typescript
export async function openManagedSession(sessionFilePath: string, config: SdkConfig = {}): Promise<ManagedSessionHandle> {
  // identical factory construction ...
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd, agentDir: getAgentDir(), sessionManager: SessionManager.open(sessionFilePath),
  })
  return buildRuntimeHandle(runtime)
}
```

---

### 2. `packages/pi-sdk/src/types.ts` — Add `fork` to interface

```typescript
export interface ManagedSessionHandle {
  // ... existing ...

  /**
   * Branch the conversation at a specific session entry.
   * Returns the new session file path. Caller creates a new thread and opens it.
   */
  fork(entryId: string): Promise<string>
}
```

---

### 3. `apps/server/src/routes/sessions.ts` — Fork endpoint

Add `POST /session/:id/fork` at the bottom of the sessions router:

```typescript
// Body: { entryId: string }
// Returns: { threadId: string, sessionId: string }
sessionsRoute.post("/:id/fork", async (c) => {
  const sessionId = c.req.param("id")
  const { entryId } = await c.req.json<{ entryId: string }>()
  const entry = store.get(sessionId)
  if (!entry) return c.json({ error: "session not found" }, 404)
  if (!entry.workspaceId) return c.json({ error: "session has no workspace" }, 400)

  const newSessionFile = await entry.handle.fork(entryId)

  const newThreadId = insertThread(entry.workspaceId)
  updateThreadSessionFile(newThreadId, newSessionFile)

  const forkedHandle = await openManagedSession(newSessionFile, { cwd: entry.cwd })
  const newSessionId = store.create(forkedHandle, entry.cwd, newThreadId, entry.workspaceId)
  sessionEvents.ensure(newSessionId, newThreadId, forkedHandle, entry.cwd)

  return c.json({ threadId: newThreadId, sessionId: newSessionId })
})
```

Imports needed: `openManagedSession` from `@lamda/pi-sdk`, `insertThread` + `updateThreadSessionFile` from `@lamda/db`.

---

### 4. `apps/web/src/features/chat/api.ts` — Fork API call

```typescript
export async function forkSession(
  sessionId: string,
  entryId: string,
): Promise<{ threadId: string; sessionId: string }> {
  const res = await apiFetch(`/session/${sessionId}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryId }),
  })
  if (!res.ok) throw new Error("Fork failed")
  return res.json()
}
```

---

### 5. `apps/web/src/features/chat/` — Fork button on user messages

Add a fork action button (small icon, visible on hover) to user message bubbles in the chat component that renders user messages. On click:
1. Call `forkSession(sessionId, message.id)` where `message.id` is the session entry ID stored in the DB message block
2. On success, navigate to `workspace.$threadId` with the returned `threadId`
3. Invalidate the workspace list query so the sidebar shows the new thread

The session entry ID (`entryId`) needs to come from the message block. Check `apps/server/src/session-events.ts` to confirm how message IDs are stored (they come from `AgentMessage.id` during the `message_start` event). Verify the DB stores this as a queryable field in the message block.

---

## Files to Modify

| File | Change |
|---|---|
| `packages/pi-sdk/src/session.ts` | Replace `createAgentSession` → `createAgentSessionRuntime`; add `fork` to `buildRuntimeHandle` |
| `packages/pi-sdk/src/types.ts` | Add `fork(entryId): Promise<string>` to `ManagedSessionHandle` |
| `apps/server/src/routes/sessions.ts` | Add `POST /:id/fork` endpoint |
| `apps/web/src/features/chat/api.ts` | Add `forkSession()` |
| `apps/web/src/features/chat/components/` | Add fork button to user message bubble |

**No changes needed:**
- `apps/server/src/services/session-service.ts` — calls `createManagedSession` (same signature)
- `apps/server/src/bootstrap.ts` — calls `openManagedSession` (same signature)
- `apps/server/src/store.ts` — type `ManagedSessionHandle` gains `fork` method automatically
- `packages/pi-sdk/src/stream.ts` — takes `AgentSession` directly, no change
- `packages/pi-sdk/src/auth.ts`, `models.ts`, `title.ts`, `commit-message.ts`

---

## Verification

1. **Type-check pi-sdk:** `pnpm --filter @lamda/pi-sdk exec tsc --noEmit`
2. **Server start:** `pnpm --filter server dev` — confirm `{ready: true}` first-line output; confirm existing threads bootstrap without error
3. **Basic chat:** Send a message in any thread — confirm streaming and tool events flow correctly
4. **Fork flow:**
   - Send 3+ messages in a thread
   - Click fork on message #2's user bubble
   - Confirm a new thread appears in the sidebar
   - Confirm the new thread has messages up to and including message #2
   - Confirm both threads accept new prompts independently
5. **Full typecheck:** `pnpm typecheck` across all packages — zero new errors
