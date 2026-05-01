import { Hono } from "hono";
import { join, relative } from "path";
import { readdir } from "fs/promises";
import type { WebSocket } from "ws";
import { insertWorkspace, insertThread, insertUserBlock, insertAbortBlock, listMessageBlocks, listRunningToolBlocks } from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import {
  createSessionForThread,
  ensureSessionEventHub,
} from "../services/session-service.js";
import type { PromptOptions, SdkConfig } from "@lamda/pi-sdk";

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

  // Insert abort block before calling abort
  insertAbortBlock(entry.threadId);

  await entry.handle.abort();
  return c.json({ aborted: true });
});

sessions.post("/session/:id/dismiss-error", (c) => {
  const id = c.req.param("id");
  sessionEvents.dismissPendingErrors(id);
  return c.json({ ok: true });
});

interface PromptRequestBody {
  text?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  /** Image attachments for the prompt */
  images?: PromptOptions["images"];
  /** How to queue when agent is streaming: "steer" (interrupt) or "followUp" (wait) */
  streamingBehavior?: PromptOptions["streamingBehavior"];
  /** Whether to expand file-based prompt templates (default: true) */
  expandPromptTemplates?: PromptOptions["expandPromptTemplates"];
}

sessions.post("/session/:id/prompt", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<PromptRequestBody>()
    .catch((): PromptRequestBody => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  // Store user message as a block in the database
  insertUserBlock(entry.threadId, body.text);

  // Fire and forget — events arrive via GET /session/:id/events
  const text = body.text;
  const run = async () => {
    if (body.provider && body.model) await entry.handle.setModel(body.provider, body.model);
    if (body.thinkingLevel) {
      entry.handle.setThinkingLevel(
        body.thinkingLevel as "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
      );
      sessionEvents.setNextThinkingLevel(id, body.thinkingLevel);
    }

    const promptOptions: PromptOptions | undefined =
      body.images || body.streamingBehavior !== undefined || body.expandPromptTemplates !== undefined
        ? {
            images: body.images,
            streamingBehavior: body.streamingBehavior,
            expandPromptTemplates: body.expandPromptTemplates,
          }
        : undefined;

    await entry.handle.prompt(text, promptOptions);
  };
  run().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prompt:${id}]`, err);
    sessionEvents.emitError(id, message);
  });

  return c.json({ accepted: true }, 202);
});

/**
 * Queue a steering message while the agent is running.
 * Delivered after the current assistant turn finishes its tool calls.
 */
sessions.post("/session/:id/steer", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ text?: string }>().catch((): { text?: string } => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  // Store user message as a block in the database
  insertUserBlock(entry.threadId, body.text);

  // Fire and forget
  entry.handle.steer(body.text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[steer:${id}]`, err);
    sessionEvents.emitError(id, message);
  });

  return c.json({ accepted: true }, 202);
});

/**
 * Queue a follow-up message to be processed after the agent finishes.
 * Only delivered when agent has no more tool calls or steering messages.
 */
sessions.post("/session/:id/follow-up", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ text?: string }>().catch((): { text?: string } => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  // Store user message as a block in the database
  insertUserBlock(entry.threadId, body.text);

  // Fire and forget
  entry.handle.followUp(body.text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[followUp:${id}]`, err);
    sessionEvents.emitError(id, message);
  });

  return c.json({ accepted: true }, 202);
});

sessions.get("/session/:id/commands", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ commands: [] });
  return c.json({ commands: entry.handle.getCommands() });
});

sessions.get("/session/:id/thinking-levels", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ levels: [] });
  return c.json({ levels: entry.handle.getAvailableThinkingLevels() });
});

sessions.get("/session/:id/context-usage", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ contextUsage: null });
  const usage = entry.handle.getContextUsage();
  return c.json({ contextUsage: usage ?? null });
});

sessions.get("/session/:id/stats", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ stats: null });
  try {
    const stats = entry.handle.getSessionStats();
    return c.json({ stats });
  } catch (err) {
    console.error(`[stats:${id}]`, err);
    return c.json({ stats: null, error: err instanceof Error ? err.message : String(err) });
  }
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

/**
 * Get all message blocks for a session's thread.
 * Returns complete message data including thinking, tool calls, etc.
 */
sessions.get("/session/:id/messages", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);
  
  const blocks = listMessageBlocks(threadId);
  return c.json({ blocks });
});

/**
 * Get running tool blocks for a session's thread.
 * Returns tool blocks that are currently running (for state restoration).
 */
sessions.get("/session/:id/running-tools", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);
  
  const runningTools = listRunningToolBlocks(threadId);
  return c.json({ runningTools });
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

export function handleSessionEventsWs(ws: WebSocket, id: string, lastEventId?: string) {
  const entry = store.get(id);
  if (!entry) {
    ws.send(JSON.stringify({ type: "server_error", message: "Not found" }));
    ws.close();
    return;
  }

  const hub = ensureSessionEventHub(id, entry);

  const onEvent = (record: { id: number; event: { type: string }; data: string }) => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(`{"id":${record.id},${record.data.slice(1)}`);
  };

  const subscription = hub.subscribe({ lastEventId, onEvent });

  for (const record of subscription.initialEvents) {
    if (ws.readyState !== 1 /* OPEN */) break;
    ws.send(`{"id":${record.id},${record.data.slice(1)}`);
  }

  ws.on("close", () => subscription.unsubscribe());
  ws.on("error", () => subscription.unsubscribe());

  subscription.closed.then(() => {
    if (ws.readyState === 1 /* OPEN */) ws.close();
  });
}

export default sessions;
