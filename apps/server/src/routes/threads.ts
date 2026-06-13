import { Hono } from "hono";
import {
  getWorkspace,
  getThread,
  insertThread,
  deleteThread,
  deleteAgentTurnsForThread,
  archiveThread,
  unarchiveThread,
  pinThread,
  unpinThread,
  listArchivedThreadsWithWorkspace,
  updateThreadTitle,
  updateThreadModel,
  updateThreadMode,
  updateThreadStopped,
  updateThreadLastAccessed,
} from "@lamda/db";
import {
  createPlanModeTools,
  createTodoTool,
  createMemoryTool,
  normalizeMode,
} from "@lamda/pi-sdk";
import { gitDeleteCheckpointRef } from "@lamda/git";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import {
  collectCustomTools,
  createSessionForThread,
} from "../services/session-service.js";

const threads = new Hono();

threads.post("/workspace/:workspaceId/thread", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  type CreateThreadBody = {
    provider?: string;
    model?: string;
    title?: string;
    mode?: string;
    modelId?: string | null;
  };
  const body = await c.req
    .json<CreateThreadBody>()
    .catch((): CreateThreadBody => ({}));

  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (body.mode !== undefined && !normalizeMode(body.mode)) {
    return c.json({ error: "mode must be 'ask', 'plan', or 'agent'" }, 400);
  }

  const title = body.title?.trim() || "New Thread";
  const mode = normalizeMode(body.mode) ?? "agent";
  const modelId = body.modelId ?? null;

  // Insert with the requested mode before creating the session — the session
  // builds its custom tools from the thread's persisted mode.
  const threadId = insertThread(workspaceId, { title, mode, modelId });
  const sessionId = await createSessionForThread(
    threadId,
    ws.path,
    workspaceId,
    {
      provider: body.provider,
      model: body.model,
    },
  );

  return c.json(
    {
      thread: {
        id: threadId,
        workspaceId,
        title,
        modelId,
        isStopped: false,
        mode,
        isPinned: false,
        createdAt: Date.now(),
        sessionId,
      },
    },
    201,
  );
});

threads.delete("/thread/:id", async (c) => {
  const threadId = c.req.param("id");
  const session = store.getByThreadId(threadId);
  if (session) {
    await sessionEvents.dispose(session.sessionId);
    store.delete(session.sessionId);
  }

  // agent_turns has no FK cascade — clean up its rows and the durable checkpoint
  // refs they anchor before dropping the thread, so neither leaks.
  const thread = getThread(threadId);
  const workspace = thread ? getWorkspace(thread.workspaceId) : null;
  const orphanedShas = deleteAgentTurnsForThread(threadId);
  // Include this branch's fork snapshot, if any, so it doesn't outlive the thread.
  if (thread?.baseCheckpointSha) orphanedShas.push(thread.baseCheckpointSha);
  if (workspace?.path) {
    await Promise.all(
      orphanedShas.map((sha) => gitDeleteCheckpointRef(workspace.path, sha)),
    );
  }

  deleteThread(threadId);
  return new Response(null, { status: 204 });
});

threads.patch("/thread/:id/title", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req
    .json<{ title?: string }>()
    .catch((): { title?: string } => ({}));
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  updateThreadTitle(threadId, body.title);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/model", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req
    .json<{ modelId?: string | null }>()
    .catch((): { modelId?: string | null } => ({}));
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  updateThreadModel(threadId, body.modelId ?? null);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/mode", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req
    .json<{ mode?: string }>()
    .catch((): { mode?: string } => ({}));
  const mode = normalizeMode(body.mode);
  if (!mode) {
    return c.json({ error: "mode must be 'ask', 'plan', or 'agent'" }, 400);
  }
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  updateThreadMode(threadId, mode);
  const session = store.getByThreadId(threadId);
  if (session) {
    const entry = store.get(session.sessionId);
    if (entry) {
      const customTools = entry.workspaceId
        ? await collectCustomTools(entry.workspaceId, entry.cwd, mode, threadId)
        : mode === "plan"
          ? createPlanModeTools(entry.cwd)
          : mode === "ask"
            ? []
            : [createTodoTool(threadId), createMemoryTool(undefined)];
      session.handle.setCustomTools(customTools);
    }
    session.handle.setMode(mode);
  }
  return c.json({ ok: true });
});

threads.patch("/thread/:id/stopped", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req
    .json<{ stopped?: boolean }>()
    .catch((): { stopped?: boolean } => ({}));
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  updateThreadStopped(threadId, body.stopped ?? false);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/last-accessed", (c) => {
  const threadId = c.req.param("id");
  updateThreadLastAccessed(threadId);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/archive", (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  archiveThread(threadId);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/unarchive", (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  unarchiveThread(threadId);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/pin", (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  pinThread(threadId);
  return c.json({ ok: true });
});

threads.patch("/thread/:id/unpin", (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  unpinThread(threadId);
  return c.json({ ok: true });
});

threads.get("/threads/archived", (c) => {
  const archived = listArchivedThreadsWithWorkspace();
  return c.json({ threads: archived });
});

export default threads;
