import { Hono } from "hono";
import {
  listWorkspacesWithThreads,
  getWorkspace,
  getWorkspaceByPath,
  insertWorkspace,
  insertThread,
  deleteWorkspace,
  deleteAllWorkspaces,
  updateWorkspaceOpenWithApp,
  listWorkspaceFileEntries,
} from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { createSessionForThread } from "../services/session-service.js";
import { workspaceIndexer } from "../services/workspace-indexer.js";

const workspaces = new Hono();

function mapThread(
  t: { id: string; title: string | null; modelId: string | null; isStopped: boolean; createdAt: number; isPinned: boolean },
  workspaceId: string,
) {
  const session = store.getByThreadId(t.id);
  return {
    id: t.id,
    workspaceId,
    title: t.title,
    modelId: t.modelId ?? null,
    isStopped: t.isStopped,
    isPinned: t.isPinned,
    createdAt: t.createdAt,
    sessionId: session?.sessionId ?? null,
  };
}

workspaces.get("/workspaces", (c) => {
  const result = listWorkspacesWithThreads().map((ws) => ({
    id: ws.id,
    name: ws.name,
    path: ws.path,
    openWithAppId: ws.openWithAppId ?? null,
    createdAt: ws.createdAt,
    threads: ws.threads.map((t) => mapThread(t, ws.id)),
  }));
  return c.json({ workspaces: result });
});

workspaces.post("/workspace", async (c) => {
  const body = await c.req
    .json<{ name?: string; path?: string; provider?: string; model?: string }>()
    .catch((): { name?: string; path?: string; provider?: string; model?: string } => ({}));
  if (!body.name || !body.path)
    return c.json({ error: "name and path are required" }, 400);

  const existing = getWorkspaceByPath(body.path);
  if (existing) {
    const wsWithThreads = listWorkspacesWithThreads().find((w) => w.id === existing.id);
    const threads = (wsWithThreads?.threads ?? []).map((t) => mapThread(t, existing.id));
    return c.json(
      {
        error: "A workspace already exists for this path",
        workspace: { ...existing, openWithAppId: existing.openWithAppId ?? null, threads },
      },
      409,
    );
  }

  const workspaceId = insertWorkspace(body.name, body.path);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, body.path, {
    provider: body.provider,
    model: body.model,
  });

  workspaceIndexer.startIndexing(workspaceId, body.path).catch((err) =>
    console.error("[workspace-indexer] failed to start indexing:", err)
  );

  return c.json(
    {
      workspace: {
        id: workspaceId,
        name: body.name,
        path: body.path,
        openWithAppId: null,
        threads: [
          {
            id: threadId,
            workspaceId,
            title: "New Thread",
            modelId: null,
            isStopped: false,
            createdAt: Date.now(),
            sessionId,
          },
        ],
      },
    },
    201,
  );
});

workspaces.delete("/reset", async (_c) => {
  for (const ws of listWorkspacesWithThreads()) {
    for (const thread of ws.threads) {
      const session = store.getByThreadId(thread.id);
      if (!session) continue;
      await sessionEvents.dispose(session.sessionId);
      store.delete(session.sessionId);
    }
  }
  deleteAllWorkspaces();
  return new Response(null, { status: 204 });
});

workspaces.get("/workspace/:id/files", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const files = listWorkspaceFileEntries(workspaceId);
  return c.json({ files });
});

workspaces.post("/workspace/:id/reindex", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  workspaceIndexer.reindex(workspaceId).catch((err) =>
    console.error("[workspace-indexer] reindex failed:", err)
  );
  return c.json({ ok: true });
});

workspaces.delete("/workspace/:id", async (c) => {
  const workspaceId = c.req.param("id");
  workspaceIndexer.stopIndexing(workspaceId);
  const ws = listWorkspacesWithThreads().find((w) => w.id === workspaceId);
  if (ws) {
    for (const thread of ws.threads) {
      const session = store.getByThreadId(thread.id);
      if (!session) continue;
      await sessionEvents.dispose(session.sessionId);
      store.delete(session.sessionId);
    }
  }
  deleteWorkspace(workspaceId);
  return new Response(null, { status: 204 });
});

workspaces.patch("/workspace/:id/open-with-app", async (c) => {
  const workspaceId = c.req.param("id");
  const body = await c.req
    .json<{ appId?: string | null }>()
    .catch((): { appId?: string | null } => ({}));
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  updateWorkspaceOpenWithApp(workspaceId, body.appId ?? null);
  return c.json({ ok: true });
});

export default workspaces;
