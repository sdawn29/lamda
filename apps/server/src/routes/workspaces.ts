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
  updateWorkspaceEnv,
} from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { createSessionForThread } from "../services/session-service.js";
import { workspaceIndexer } from "../services/workspace-indexer.js";

const workspaces = new Hono();

function mapThread(
  t: { id: string; title: string | null; modelId: string | null; isStopped: boolean; createdAt: number; isPinned: boolean; forkedFromId?: string | null },
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
    forkedFromId: t.forkedFromId ?? null,
    createdAt: t.createdAt,
    sessionId: session?.sessionId ?? null,
  };
}

function parseEnv(env: string | null | undefined): Record<string, string> {
  if (!env) return {}
  try { return JSON.parse(env) as Record<string, string> } catch { return {} }
}

workspaces.get("/workspaces", (c) => {
  const result = listWorkspacesWithThreads().map((ws) => ({
    id: ws.id,
    name: ws.name,
    path: ws.path,
    openWithAppId: ws.openWithAppId ?? null,
    env: parseEnv(ws.env),
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
        workspace: { ...existing, openWithAppId: existing.openWithAppId ?? null, env: parseEnv(existing.env), threads },
      },
      409,
    );
  }

  const workspaceId = insertWorkspace(body.name, body.path);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, body.path, workspaceId, {
    provider: body.provider,
    model: body.model,
  });

  workspaceIndexer.startIndexing(workspaceId, body.path);

  return c.json(
    {
      workspace: {
        id: workspaceId,
        name: body.name,
        path: body.path,
        openWithAppId: null,
        env: {},
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
  workspaceIndexer.ensureIndexing(workspaceId, ws.path);
  return c.json({ files: workspaceIndexer.listFiles(workspaceId) });
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

workspaces.patch("/workspace/:id/env", async (c) => {
  const workspaceId = c.req.param("id");
  const body = await c.req
    .json<{ env?: Record<string, string> }>()
    .catch((): { env?: Record<string, string> } => ({}));
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  updateWorkspaceEnv(workspaceId, body.env ?? null);
  return c.json({ ok: true });
});

export default workspaces;
