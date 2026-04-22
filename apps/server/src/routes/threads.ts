import { Hono } from "hono";
import {
  getWorkspace,
  getThread,
  insertThread,
  deleteThread,
  archiveThread,
  unarchiveThread,
  pinThread,
  unpinThread,
  listArchivedThreadsWithWorkspace,
  updateThreadTitle,
  updateThreadModel,
  updateThreadStopped,
  updateThreadLastAccessed,
} from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { createSessionForThread } from "../services/session-service.js";

const threads = new Hono();

threads.post("/workspace/:workspaceId/thread", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const body = await c.req
    .json<{ provider?: string; model?: string }>()
    .catch((): { provider?: string; model?: string } => ({}));

  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, ws.path, {
    provider: body.provider,
    model: body.model,
  });

  return c.json(
    {
      thread: {
        id: threadId,
        workspaceId,
        title: "New Thread",
        modelId: null,
        isStopped: false,
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
  const threadId = c.req.param("id")
  const thread = getThread(threadId)
  if (!thread) return c.json({ error: "Thread not found" }, 404)
  pinThread(threadId)
  return c.json({ ok: true })
})

threads.patch("/thread/:id/unpin", (c) => {
  const threadId = c.req.param("id")
  const thread = getThread(threadId)
  if (!thread) return c.json({ error: "Thread not found" }, 404)
  unpinThread(threadId)
  return c.json({ ok: true })
})

threads.get("/threads/archived", (c) => {
  const archived = listArchivedThreadsWithWorkspace();
  return c.json({ threads: archived });
});

export default threads;