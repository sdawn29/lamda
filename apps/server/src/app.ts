import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, dirname, relative } from "path";
import { randomUUID } from "crypto";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import {
  createManagedSession,
  getAvailableModels,
  generateThreadTitle,
  generateCommitMessage,
  type SdkConfig,
} from "@lambda/pi-sdk";
import {
  getCurrentBranch,
  initGitRepo,
  listBranches,
  checkoutBranch,
  createBranch,
  gitStatus,
  gitFileDiff,
  gitCommit,
  gitPush,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitStash,
  gitStashList,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  gitDiffStat,
  gitRevertFile,
  gitStagedDiff,
} from "@lambda/git";
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
} from "@lambda/db";
import { store } from "./store.js";
import { SESSION_SSE_RETRY_MS, sessionEvents } from "./session-events.js";

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

function ensureSessionEventHub(
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
) {
  return sessionEvents.ensure(sessionId, entry.threadId, entry.handle);
}

app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

app.get("/models", (c) => {
  return c.json({ models: getAvailableModels() });
});

app.post("/title", async (c) => {
  const body = await c.req
    .json<{ message?: string; provider?: string; model?: string }>()
    .catch((): { message?: string; provider?: string; model?: string } => ({}));
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
  const body = await c.req
    .json<{
      name?: string;
      path?: string;
      provider?: string;
      model?: string;
    }>()
    .catch(
      (): {
        name?: string;
        path?: string;
        provider?: string;
        model?: string;
      } => ({}),
    );
  if (!body.name || !body.path)
    return c.json({ error: "name and path are required" }, 400);

  const existing = getWorkspaceByPath(body.path);
  if (existing) {
    const wsWithThreads = listWorkspacesWithThreads().find(
      (w) => w.id === existing.id,
    );
    const threads = (wsWithThreads?.threads ?? []).map((t) => {
      const session = store.getByThreadId(t.id);
      return {
        id: t.id,
        workspaceId: existing.id,
        title: t.title,
        createdAt: t.createdAt,
        sessionId: session?.sessionId ?? null,
      };
    });
    return c.json(
      {
        error: "A workspace already exists for this path",
        workspace: { ...existing, threads },
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

  return c.json(
    {
      workspace: {
        id: workspaceId,
        name: body.name,
        path: body.path,
        threads: [
          {
            id: threadId,
            workspaceId,
            title: "New Thread",
            createdAt: Date.now(),
            sessionId,
          },
        ],
      },
    },
    201,
  );
});

app.delete("/reset", async (_c) => {
  // Dispose all in-memory sessions
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

app.delete("/workspace/:id", async (c) => {
  const workspaceId = c.req.param("id");
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

app.post("/workspace/:workspaceId/thread", async (c) => {
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
        createdAt: Date.now(),
        sessionId,
      },
    },
    201,
  );
});

app.delete("/thread/:id", async (c) => {
  const threadId = c.req.param("id");
  const session = store.getByThreadId(threadId);
  if (session) {
    await sessionEvents.dispose(session.sessionId);
    store.delete(session.sessionId);
  }
  deleteThread(threadId);
  return new Response(null, { status: 204 });
});

app.patch("/thread/:id/title", async (c) => {
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

// ── Session endpoints ──────────────────────────────────────────────────────────

app.post("/session", async (c) => {
  const body = await c.req
    .json<Partial<SdkConfig>>()
    .catch((): Partial<SdkConfig> => ({}));
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

app.delete("/session/:id", async (c) => {
  const id = c.req.param("id");
  await sessionEvents.dispose(id);
  if (!store.delete(id)) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/abort", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);
  await entry.handle.abort();
  return c.json({ aborted: true });
});

app.post("/session/:id/prompt", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{
      text?: string;
      provider?: string;
      model?: string;
      thinkingLevel?: string;
    }>()
    .catch(
      (): {
        text?: string;
        provider?: string;
        model?: string;
        thinkingLevel?: string;
      } => ({}),
    );
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  insertMessage(entry.threadId, "user", body.text);

  // Fire and forget — events arrive via GET /session/:id/events
  const run = async () => {
    if (body.provider && body.model) {
      await entry.handle.setModel(body.provider, body.model);
    }
    if (body.thinkingLevel) {
      entry.handle.setThinkingLevel(
        body.thinkingLevel as
          | "off"
          | "minimal"
          | "low"
          | "medium"
          | "high"
          | "xhigh",
      );
    }
    await entry.handle.prompt(body.text!);
  };
  run().catch((err: unknown) => {
    console.error(`[prompt:${id}]`, err);
  });

  return c.json({ accepted: true }, 202);
});

app.get("/session/:id/commands", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ commands: [] });
  return c.json({ commands: entry.handle.getCommands() });
});

app.get("/session/:id/context-usage", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ contextUsage: null });
  const usage = entry.handle.getContextUsage();
  return c.json({ contextUsage: usage ?? null });
});

app.post("/session/:id/compact", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Session not found" }, 404);
  ensureSessionEventHub(id, entry);
  try {
    await entry.handle.compact();
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
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

app.get("/session/:id/workspace-files", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    const rawEntries = await readdir(cwd, {
      withFileTypes: true,
      recursive: true,
    });
    const entries: { path: string; type: "file" | "dir" }[] = [];
    for (const entry of rawEntries) {
      const fullPath = join(entry.parentPath, entry.name);
      const rel = relative(cwd, fullPath).replace(/\\/g, "/");
      const parts = rel.split("/");
      if (parts.some((p) => EXCLUDED_DIRS.has(p))) continue;
      if (entry.isDirectory()) {
        entries.push({ path: rel, type: "dir" });
      } else if (entry.isFile()) {
        entries.push({ path: rel, type: "file" });
      }
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return c.json({ entries });
  } catch {
    return c.json({ entries: [] });
  }
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
    const message =
      lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
      lines[0] ??
      "Checkout failed";
    return c.json({ error: message }, 500);
  }
});

app.post("/session/:id/branch", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ branch: string }>();
  if (!body.branch) return c.json({ error: "branch is required" }, 400);
  try {
    await createBranch(cwd, body.branch);
    const branch = await getCurrentBranch(cwd);
    return c.json({ branch });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const lines = raw.split("\n").filter(Boolean);
    const message =
      lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
      lines[0] ??
      "Branch creation failed";
    return c.json({ error: message }, 500);
  }
});

app.post("/session/:id/git/init", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await initGitRepo(cwd);
    const branch = await getCurrentBranch(cwd);
    const branches = await listBranches(cwd);
    return c.json({ branch, branches });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const lines = raw.split("\n").filter(Boolean);
    const message =
      lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
      lines[0] ??
      "Repository initialization failed";
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

  const hub = ensureSessionEventHub(id, entry);
  const lastEventId = c.req.header("last-event-id");

  const response = streamSSE(c, async (stream) => {
    let writeQueue = Promise.resolve();
    const queueWrite = (record: {
      id: number;
      event: { type: string };
      data: string;
    }) => {
      writeQueue = writeQueue.then(() =>
        stream.writeSSE({
          event: record.event.type,
          id: String(record.id),
          retry: SESSION_SSE_RETRY_MS,
          data: record.data,
        }),
      );
    };

    const subscription = hub.subscribe({
      lastEventId,
      onEvent: queueWrite,
    });

    stream.onAbort(() => {
      subscription.unsubscribe();
    });

    for (const record of subscription.initialEvents) {
      queueWrite(record);
    }

    await subscription.closed;
    await writeQueue;
  });

  response.headers.set("Cache-Control", "no-cache, no-transform");
  response.headers.set("X-Accel-Buffering", "no");
  return response;
});

// ── Git endpoints ──────────────────────────────────────────────────────────────

function gitCwd(id: string): string | null {
  return store.getCwd(id) ?? null;
}

app.get("/session/:id/git/status", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const raw = await gitStatus(cwd);
  return c.json({ raw });
});

app.get("/session/:id/git/diff-stat", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const stat = await gitDiffStat(cwd);
  return c.json(stat);
});

app.get("/session/:id/git/diff", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const file = c.req.query("file");
  const status = c.req.query("status") ?? "";
  if (!file) return c.json({ error: "file query param is required" }, 400);
  try {
    const diff = await gitFileDiff(cwd, file, status);
    return c.json({ diff });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post("/session/:id/git/commit", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ message?: string }>();
  if (!body.message) return c.json({ error: "message is required" }, 400);
  try {
    const output = await gitCommit(cwd, body.message);
    return c.json({ output });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post("/session/:id/git/generate-commit-message", async (c) => {
  const id = c.req.param("id");
  const cwd = gitCwd(id);
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req
    .json<{ promptTemplate?: string }>()
    .catch((): { promptTemplate?: string } => ({}));
  const diff = await gitStagedDiff(cwd);
  if (!diff.trim())
    return c.json(
      { error: "No staged changes to generate a message for" },
      400,
    );
  const message = await generateCommitMessage(
    diff,
    { cwd },
    body.promptTemplate,
  );
  return c.json({ message });
});

app.post("/session/:id/git/push", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await gitPush(cwd);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post("/session/:id/git/stage", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string }>();
  if (!body.filePath) return c.json({ error: "filePath is required" }, 400);
  await gitStage(cwd, body.filePath);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/git/unstage", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string }>();
  if (!body.filePath) return c.json({ error: "filePath is required" }, 400);
  await gitUnstage(cwd, body.filePath);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/git/stage-all", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  await gitStageAll(cwd);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/git/unstage-all", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  await gitUnstageAll(cwd);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/git/revert-file", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string; raw?: string }>();
  if (!body.filePath || body.raw === undefined)
    return c.json({ error: "filePath and raw are required" }, 400);
  await gitRevertFile(cwd, body.filePath, body.raw);
  return new Response(null, { status: 204 });
});

app.post("/session/:id/git/stash", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req
    .json<{ message?: string }>()
    .catch((): { message?: string } => ({}));
  await gitStash(cwd, body.message);
  return new Response(null, { status: 204 });
});

app.get("/session/:id/git/stash-list", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const raw = await gitStashList(cwd);
  return c.json({ raw });
});

app.post("/session/:id/git/stash-pop", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashPop(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post("/session/:id/git/stash-apply", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashApply(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post("/session/:id/git/stash-drop", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashDrop(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

// ── OAuth login endpoints ──────────────────────────────────────────────────────

// Shared auth storage backed by ~/.pi/agent/auth.json
const sharedAuthStorage = AuthStorage.create();

type OAuthSseEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface ActiveLogin {
  sseQueue: OAuthSseEvent[];
  sseFlush: (() => void) | null;
  promptResolvers: Map<string, (value: string) => void>;
  abortController: AbortController;
  rejectManualInput: ((err: Error) => void) | null;
}

const activeLogins = new Map<string, ActiveLogin>();

// List OAuth providers and their login status
app.get("/auth/oauth/providers", (c) => {
  sharedAuthStorage.reload();
  const providers = sharedAuthStorage.getOAuthProviders().map((p) => {
    const cred = sharedAuthStorage.get(p.id);
    return {
      id: p.id,
      name: p.name,
      loggedIn: cred?.type === "oauth",
    };
  });
  return c.json({ providers });
});

// Start OAuth login — returns a loginId for SSE + respond endpoints
app.post("/auth/oauth/:providerId/login", async (c) => {
  const providerId = c.req.param("providerId");
  const loginId = randomUUID();

  const login: ActiveLogin = {
    sseQueue: [],
    sseFlush: null,
    promptResolvers: new Map(),
    abortController: new AbortController(),
    rejectManualInput: null,
  };
  activeLogins.set(loginId, login);

  function emit(event: OAuthSseEvent) {
    login.sseQueue.push(event);
    login.sseFlush?.();
  }

  // onManualCodeInput keeps the local OAuth callback server alive until resolved or rejected.
  // Rejecting it (on abort) triggers server.cancelWait() inside the SDK, which causes the
  // finally block to run server.close() — freeing port 1455 for the next login attempt.
  const manualInputPromise = new Promise<string>((_resolve, reject) => {
    login.rejectManualInput = reject;
  });

  // Run login in background — SSE stream will pick up events
  sharedAuthStorage
    .login(providerId, {
      signal: login.abortController.signal,
      onAuth: (info) => {
        emit({
          type: "auth_url",
          url: info.url,
          instructions: info.instructions,
        });
      },
      onProgress: (message) => {
        emit({ type: "progress", message });
      },
      onPrompt: (prompt) => {
        const promptId = randomUUID();
        emit({
          type: "prompt",
          promptId,
          message: prompt.message,
          placeholder: prompt.placeholder,
        });
        return new Promise<string>((resolve) => {
          login.promptResolvers.set(promptId, resolve);
        });
      },
      onManualCodeInput: () => manualInputPromise,
    })
    .then(() => {
      emit({ type: "done" });
      activeLogins.delete(loginId);
    })
    .catch((err: unknown) => {
      if (!login.abortController.signal.aborted) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      activeLogins.delete(loginId);
    });

  return c.json({ loginId }, 201);
});

// SSE stream for an active login
app.get("/auth/oauth/:loginId/events", async (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      login.sseFlush = null;
    });

    // Drain any events queued before SSE connected
    while (login.sseQueue.length > 0) {
      const event = login.sseQueue.shift()!;
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
    }

    // Stream future events until done/error or connection closes
    await new Promise<void>((resolve) => {
      login.sseFlush = async () => {
        while (login.sseQueue.length > 0) {
          const event = login.sseQueue.shift()!;
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
          if (event.type === "done" || event.type === "error") {
            login.sseFlush = null;
            resolve();
            return;
          }
        }
      };
      // Handle case where login completed before SSE connected
      if (!activeLogins.has(loginId)) resolve();
    });
  });
});

// Respond to a prompt during login
app.post("/auth/oauth/:loginId/respond", async (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);

  const body = await c.req
    .json<{ promptId?: string; value?: string }>()
    .catch((): { promptId?: string; value?: string } => ({}));
  if (!body.promptId) return c.json({ error: "promptId is required" }, 400);

  const resolver = login.promptResolvers.get(body.promptId);
  if (!resolver) return c.json({ error: "Prompt not found" }, 404);

  login.promptResolvers.delete(body.promptId);
  resolver(body.value ?? "");
  return c.json({ ok: true });
});

// Abort an active login
app.post("/auth/oauth/:loginId/abort", (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);
  login.abortController.abort();
  // Rejecting manualInputPromise triggers server.cancelWait() inside the SDK,
  // which causes the local HTTP server on port 1455 to close (via finally block).
  login.rejectManualInput?.(new Error("Login aborted"));
  activeLogins.delete(loginId);
  return c.json({ ok: true });
});

// Logout (remove stored OAuth credentials)
app.delete("/auth/oauth/:providerId", (c) => {
  const providerId = c.req.param("providerId");
  sharedAuthStorage.reload();
  sharedAuthStorage.logout(providerId);
  return c.json({ ok: true });
});

// ── Provider auth endpoints ────────────────────────────────────────────────────

const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");

type AuthEntry = { type: string; key?: string; [k: string]: unknown };
type AuthJson = Record<string, AuthEntry>;

async function readAuthJson(): Promise<AuthJson> {
  if (!existsSync(AUTH_FILE)) return {};
  try {
    const raw = await readFile(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthJson;
  } catch {
    return {};
  }
}

async function writeAuthJson(data: AuthJson): Promise<void> {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Returns flat map of providerId -> key string (only api_key entries)
app.get("/providers", async (c) => {
  const auth = await readAuthJson();
  const providers: Record<string, string> = {};
  for (const [id, entry] of Object.entries(auth)) {
    if (entry.type === "api_key" && typeof entry.key === "string") {
      providers[id] = entry.key;
    }
  }
  return c.json({ providers });
});

// Accepts flat map of providerId -> key string (empty string = remove)
app.put("/providers", async (c) => {
  const body = await c.req
    .json<{ providers?: Record<string, string> }>()
    .catch((): { providers?: Record<string, string> } => ({}));
  if (!body.providers) return c.json({ error: "providers is required" }, 400);

  const auth = await readAuthJson();

  for (const [id, key] of Object.entries(body.providers)) {
    if (key.trim() === "") {
      // Remove api_key entries; keep OAuth and other types untouched
      if (auth[id]?.type === "api_key") {
        delete auth[id];
      }
    } else {
      // Preserve non-api_key entries (e.g., OAuth tokens) unless explicitly overwriting
      auth[id] = { type: "api_key", key: key.trim() };
    }
  }

  await writeAuthJson(auth);
  return c.json({ ok: true });
});

export default app;
