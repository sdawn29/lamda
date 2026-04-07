import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import { createManagedSession, getAvailableModels, generateThreadTitle, type SdkConfig } from "@asphalt/pi-sdk";
import { getCurrentBranch, listBranches, checkoutBranch } from "@asphalt/git";
import {
  listWorkspacesWithThreads,
  getWorkspace,
  getWorkspaceByPath,
  insertWorkspace,
  deleteWorkspace,
  deleteAllWorkspaces,
  insertThread,
  getThread,
  deleteThread,
  updateThreadTitle,
  updateThreadSessionFile,
  listMessages,
  insertMessage,
} from "@asphalt/db";
import { store } from "./store.js";
import { messageBuffer } from "./message-buffer.js";

const app = new Hono();

app.use(cors());
app.use(logger());

// ── Helpers ────────────────────────────────────────────────────────────────────

async function createSessionForThread(
  threadId: string,
  cwd: string,
  opts: Omit<Partial<SdkConfig>, "cwd"> = {},
): Promise<string> {
  const handle = await createManagedSession({ cwd, ...opts });
  const sessionId = store.create(handle, cwd, threadId);
  if (handle.sessionFile) updateThreadSessionFile(threadId, handle.sessionFile);
  return sessionId;
}

app.get("/health", (c) =>
  c.json({ status: "ok", uptime: process.uptime() }),
);

app.get("/models", (c) => {
  return c.json({ models: getAvailableModels() });
});

app.post("/title", async (c) => {
  const body = await c.req.json<{ message?: string; provider?: string; model?: string }>().catch((): { message?: string; provider?: string; model?: string } => ({}));
  if (!body.message) return c.json({ error: "message is required" }, 400);
  const title = await generateThreadTitle(body.message, {
    provider: body.provider,
    model: body.model,
  });
  return c.json({ title });
});

// ── Workspace endpoints ────────────────────────────────────────────────────────

app.get("/workspaces", (c) => {
  const wsWithThreads = listWorkspacesWithThreads();
  const result = wsWithThreads.map((ws) => ({
    id: ws.id,
    name: ws.name,
    path: ws.path,
    createdAt: ws.createdAt,
    threads: ws.threads.map((t) => {
      const session = store.getByThreadId(t.id);
      return {
        id: t.id,
        workspaceId: ws.id,
        title: t.title,
        createdAt: t.createdAt,
        sessionId: session?.sessionId ?? null,
      };
    }),
  }));
  return c.json({ workspaces: result });
});

app.post("/workspace", async (c) => {
  const body = await c.req.json<{ name?: string; path?: string; provider?: string; model?: string }>().catch((): { name?: string; path?: string; provider?: string; model?: string } => ({}));
  if (!body.name || !body.path) return c.json({ error: "name and path are required" }, 400);

  const existing = getWorkspaceByPath(body.path);
  if (existing) {
    const wsWithThreads = listWorkspacesWithThreads().find((w) => w.id === existing.id);
    const threads = (wsWithThreads?.threads ?? []).map((t) => {
      const session = store.getByThreadId(t.id);
      return { id: t.id, workspaceId: existing.id, title: t.title, createdAt: t.createdAt, sessionId: session?.sessionId ?? null };
    });
    return c.json({ error: "A workspace already exists for this path", workspace: { ...existing, threads } }, 409);
  }

  const workspaceId = insertWorkspace(body.name, body.path);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, body.path, {
    provider: body.provider,
    model: body.model,
  });

  return c.json({
    workspace: {
      id: workspaceId,
      name: body.name,
      path: body.path,
      threads: [{
        id: threadId,
        workspaceId,
        title: "New Thread",
        createdAt: Date.now(),
        sessionId,
      }],
    },
  }, 201);
});

app.delete("/reset", (c) => {
  // Dispose all in-memory sessions
  for (const ws of listWorkspacesWithThreads()) {
    for (const thread of ws.threads) {
      const session = store.getByThreadId(thread.id);
      if (session) store.delete(session.sessionId);
    }
  }
  deleteAllWorkspaces();
  return new Response(null, { status: 204 });
});

app.delete("/workspace/:id", (c) => {
  const workspaceId = c.req.param("id");
  const ws = listWorkspacesWithThreads().find((w) => w.id === workspaceId);
  if (ws) {
    for (const thread of ws.threads) {
      const session = store.getByThreadId(thread.id);
      if (session) store.delete(session.sessionId);
    }
  }
  deleteWorkspace(workspaceId);
  return new Response(null, { status: 204 });
});

app.post("/workspace/:workspaceId/thread", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const body = await c.req.json<{ provider?: string; model?: string }>().catch((): { provider?: string; model?: string } => ({}));

  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, ws.path, {
    provider: body.provider,
    model: body.model,
  });

  return c.json({
    thread: {
      id: threadId,
      workspaceId,
      title: "New Thread",
      createdAt: Date.now(),
      sessionId,
    },
  }, 201);
});

app.delete("/thread/:id", (c) => {
  const threadId = c.req.param("id");
  const session = store.getByThreadId(threadId);
  if (session) store.delete(session.sessionId);
  deleteThread(threadId);
  return new Response(null, { status: 204 });
});

app.patch("/thread/:id/title", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req.json<{ title?: string }>().catch((): { title?: string } => ({}));
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  updateThreadTitle(threadId, body.title);
  return c.json({ ok: true });
});

// ── Session endpoints ──────────────────────────────────────────────────────────

app.post("/session", async (c) => {
  const body = await c.req.json<Partial<SdkConfig>>().catch((): Partial<SdkConfig> => ({}));
  const resolvedCwd = body.cwd ?? process.cwd();
  // Legacy endpoint: create a thread in the DB so messages can be persisted
  const workspaceId = insertWorkspace("Untitled", resolvedCwd);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, resolvedCwd, {
    anthropicApiKey: body.anthropicApiKey,
    provider: body.provider,
    model: body.model,
  });
  return c.json({ sessionId }, 201);
});

app.delete("/session/:id", (c) => {
  const id = c.req.param("id");
  if (!store.delete(id)) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/prompt", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ text?: string; provider?: string; model?: string }>().catch((): { text?: string; provider?: string; model?: string } => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  insertMessage(entry.threadId, "user", body.text);

  // Fire and forget — events arrive via GET /session/:id/events
  const run = async () => {
    if (body.provider && body.model) {
      await entry.handle.setModel(body.provider, body.model);
    }
    await entry.handle.prompt(body.text!);
  };
  run().catch((err: unknown) => {
    console.error(`[prompt:${id}]`, err);
  });

  return c.json({ accepted: true }, 202);
});

app.get("/session/:id/branch", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ branch: null });
  const branch = await getCurrentBranch(cwd);
  return c.json({ branch });
});

app.get("/session/:id/branches", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ branches: [] });
  const branches = await listBranches(cwd);
  return c.json({ branches });
});

app.post("/session/:id/checkout", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ branch: string }>();
  if (!body.branch) return c.json({ error: "branch is required" }, 400);
  try {
    await checkoutBranch(cwd, body.branch);
    const branch = await getCurrentBranch(cwd);
    return c.json({ branch });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Extract the human-readable part from the git stderr (after the first line which is the command echo)
    const lines = raw.split("\n").filter(Boolean);
    const message = lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ?? lines[0] ?? "Checkout failed";
    return c.json({ error: message }, 500);
  }
});

app.get("/session/:id/messages", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);
  const msgs = listMessages(threadId);
  return c.json({ messages: msgs });
});

app.get("/session/:id/events", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const threadId = entry.threadId;

  return streamSSE(c, async (stream) => {
    const generator = entry.handle.events();
    const toolMeta = new Map<string, { toolName: string; args: unknown }>();

    stream.onAbort(async () => {
      messageBuffer.flush(id);
      await generator.return(undefined);
    });

    for await (const event of generator) {
      // ── Persistence side-effects ───────────────────────────────────────────
      if (event.type === "message_start") {
        messageBuffer.startAssistant(id, threadId);
      } else if (event.type === "message_update") {
        const e = event as { assistantMessageEvent?: { type: string; delta: string } };
        if (e.assistantMessageEvent?.type === "text_delta") {
          messageBuffer.appendDelta(id, e.assistantMessageEvent.delta);
        }
      } else if (event.type === "tool_execution_start") {
        const e = event as { toolCallId: string; toolName: string; args: unknown };
        toolMeta.set(e.toolCallId, { toolName: e.toolName, args: e.args });
      } else if (event.type === "tool_execution_end") {
        const e = event as {
          toolCallId: string;
          toolName?: string;
          args?: unknown;
          result: unknown;
          isError: boolean;
        };
        const meta = toolMeta.get(e.toolCallId);
        toolMeta.delete(e.toolCallId);
        insertMessage(
          threadId,
          "tool",
          JSON.stringify({
            toolCallId: e.toolCallId,
            toolName: meta?.toolName ?? e.toolName ?? "",
            args: meta?.args ?? e.args ?? {},
            result: e.result,
            status: e.isError ? "error" : "done",
          }),
        );
      } else if (event.type === "agent_end") {
        messageBuffer.flush(id);
      }

      // ── SSE passthrough ────────────────────────────────────────────────────
      let data: string;
      try {
        data = JSON.stringify(event);
      } catch {
        data = JSON.stringify({ serializeError: true, type: event.type });
      }
      await stream.writeSSE({ event: event.type, data });
    }
  });
});

export default app;
