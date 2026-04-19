import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { join, relative } from "path";
import { readdir } from "fs/promises";
import { insertWorkspace, insertThread, insertMessage, listMessages } from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents, SESSION_SSE_RETRY_MS } from "../session-events.js";
import {
  createSessionForThread,
  ensureSessionEventHub,
} from "../services/session-service.js";
import type { SdkConfig } from "@lamda/pi-sdk";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  ".turbo",
]);

const sessions = new Hono();

sessions.post("/session", async (c) => {
  const body = await c.req.json<Partial<SdkConfig>>().catch((): Partial<SdkConfig> => ({}));
  const resolvedCwd = body.cwd ?? process.cwd();
  const workspaceId = insertWorkspace("Untitled", resolvedCwd);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(threadId, resolvedCwd, {
    anthropicApiKey: body.anthropicApiKey,
    provider: body.provider,
    model: body.model,
  });
  return c.json({ sessionId }, 201);
});

sessions.delete("/session/:id", async (c) => {
  const id = c.req.param("id");
  await sessionEvents.dispose(id);
  if (!store.delete(id)) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

sessions.post("/session/:id/abort", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);
  await entry.handle.abort();
  return c.json({ aborted: true });
});

sessions.post("/session/:id/prompt", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ text?: string; provider?: string; model?: string; thinkingLevel?: string }>()
    .catch(
      (): { text?: string; provider?: string; model?: string; thinkingLevel?: string } => ({}),
    );
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);
  insertMessage(entry.threadId, "user", body.text);

  // Fire and forget — events arrive via GET /session/:id/events
  const run = async () => {
    if (body.provider && body.model) await entry.handle.setModel(body.provider, body.model);
    if (body.thinkingLevel) {
      entry.handle.setThinkingLevel(
        body.thinkingLevel as "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
      );
      sessionEvents.setNextThinkingLevel(id, body.thinkingLevel);
    }
    await entry.handle.prompt(body.text!);
  };
  run().catch((err: unknown) => console.error(`[prompt:${id}]`, err));

  return c.json({ accepted: true }, 202);
});

sessions.get("/session/:id/commands", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ commands: [] });
  return c.json({ commands: entry.handle.getCommands() });
});

sessions.get("/session/:id/context-usage", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ contextUsage: null });
  const usage = entry.handle.getContextUsage();
  return c.json({ contextUsage: usage ?? null });
});

sessions.post("/session/:id/compact", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Session not found" }, 404);
  ensureSessionEventHub(id, entry);
  try {
    await entry.handle.compact();
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

sessions.get("/session/:id/messages", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);
  const msgs = listMessages(threadId);
  return c.json({ messages: msgs });
});

sessions.get("/session/:id/events", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const hub = ensureSessionEventHub(id, entry);
  const lastEventId = c.req.header("last-event-id");

  const response = streamSSE(c, async (stream) => {
    let writeQueue = Promise.resolve();
    const queueWrite = (record: { id: number; event: { type: string }; data: string }) => {
      writeQueue = writeQueue.then(() =>
        stream.writeSSE({
          event: record.event.type,
          id: String(record.id),
          retry: SESSION_SSE_RETRY_MS,
          data: record.data,
        }),
      );
    };

    const subscription = hub.subscribe({ lastEventId, onEvent: queueWrite });
    stream.onAbort(() => subscription.unsubscribe());

    for (const record of subscription.initialEvents) queueWrite(record);

    await subscription.closed;
    await writeQueue;
  });

  response.headers.set("Cache-Control", "no-cache, no-transform");
  response.headers.set("X-Accel-Buffering", "no");
  return response;
});

sessions.get("/session/:id/workspace-files", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    const rawEntries = await readdir(cwd, { withFileTypes: true, recursive: true });
    const entries: { path: string; type: "file" | "dir" }[] = [];
    for (const entry of rawEntries) {
      const fullPath = join(entry.parentPath, entry.name);
      const rel = relative(cwd, fullPath).replace(/\\/g, "/");
      if (rel.split("/").some((p) => EXCLUDED_DIRS.has(p))) continue;
      if (entry.isDirectory()) entries.push({ path: rel, type: "dir" });
      else if (entry.isFile()) entries.push({ path: rel, type: "file" });
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return c.json({ entries });
  } catch {
    return c.json({ entries: [] });
  }
});

export default sessions;
