import { Hono } from "hono";
import { z } from "zod";
import { readFile, access, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import {
  listWorkspacesWithThreads,
  getWorkspace,
  getWorkspaceByPath,
  getThread,
  listThreadsForWorkspace,
  insertWorkspace,
  deleteWorkspace,
  updateWorkspaceOpenWithApp,
  updateWorkspaceEnv,
  updateWorkspaceIcon,
  pinWorkspace,
  unpinWorkspace,
  createWorkspaceTask,
  searchCodeChunks,
  getCodeIndexStats,
  clearWorkspaceChunks,
  isVecAvailable,
  getSetting,
  upsertSetting,
  resetDatabase,
} from "@lamda/db";
import {
  getWorkspaceCommands,
  embeddingsEnabled,
  embedQuery,
  resetModelRuntime,
} from "@lamda/pi-sdk";
import {
  abortMerge,
  isMergeInProgress,
  gitDeleteAllLamdaRefs,
} from "@lamda/git";
import { existsSync } from "node:fs";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { workspaceIndexer } from "../services/workspace-indexer.js";
import { semanticIndexer } from "../services/semantic-indexer.js";
import { fileTreeService } from "../services/file-tree-service.js";
import { lamdaConfigWatcher } from "../services/lamda-config-watcher.js";
import { removeOwnedThreadWorktree } from "../services/worktree-service.js";
import { clearAppDataDir } from "../lib/attachments.js";
import { stopAutomationScheduler } from "../services/automation-scheduler.js";
import { deleteMcpSettings } from "../services/mcp-service.js";
import { clearToolDecisions } from "../services/tool-approval-store.js";
import { AUTH_FILE } from "../services/auth-service.js";
import { MODELS_FILE } from "../services/models-config-service.js";
import { parseJsonBody } from "../lib/validate.js";

const createWorkspaceSchema = z.object({
  name: z.string().optional(),
  path: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

const openWithAppSchema = z.object({
  appId: z.string().nullable().optional(),
});

const workspaceEnvSchema = z.object({
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Resolves the directory a file-tree request should read from: a thread's git
 * worktree when `threadId` names a thread that's running in one (and it still
 * exists on disk), otherwise the workspace path. Lets the tree follow the
 * active thread into its worktree without exposing arbitrary paths — the caller
 * only ever names a thread, never a directory.
 */
function resolveTreeRoot(
  workspacePath: string,
  threadId: string | undefined,
): string {
  if (!threadId) return workspacePath;
  const thread = getThread(threadId);
  const worktreePath = thread?.worktreePath;
  if (worktreePath && existsSync(worktreePath)) return worktreePath;
  return workspacePath;
}

const workspaces = new Hono();

async function teardownWorkspaceThreads(
  workspaceId: string,
  workspacePath: string,
): Promise<void> {
  const threads = listThreadsForWorkspace(workspaceId);
  if (threads.some((thread) => thread.worktreeMergeInProgress)) {
    await abortMerge(workspacePath);
    if (await isMergeInProgress(workspacePath)) {
      throw new Error("Git could not abort the workspace's active merge");
    }
  }

  // Clean every managed worktree, including worktrees belonging to archived
  // threads (which are intentionally absent from listWorkspacesWithThreads).
  await Promise.all(
    threads.map((thread) => removeOwnedThreadWorktree(workspacePath, thread)),
  );

  for (const thread of threads) {
    const session = store.getByThreadId(thread.id);
    if (!session) continue;
    await sessionEvents.dispose(session.sessionId);
    store.delete(session.sessionId);
  }
}

function mapThread(
  t: {
    id: string;
    title: string | null;
    modelId: string | null;
    mode: string;
    approvalMode: "ask" | "edits_allowed" | "all_allowed";
    isStopped: boolean;
    createdAt: number;
    updatedAt: number;
    isPinned: boolean;
    forkedFromId?: string | null;
    worktreePath?: string | null;
    worktreeBranch?: string | null;
  },
  workspaceId: string,
) {
  const session = store.getByThreadId(t.id);
  return {
    id: t.id,
    workspaceId,
    title: t.title,
    modelId: t.modelId ?? null,
    mode: t.mode,
    approvalMode: t.approvalMode,
    isStopped: t.isStopped,
    isPinned: t.isPinned,
    forkedFromId: t.forkedFromId ?? null,
    worktreePath: t.worktreePath ?? null,
    worktreeBranch: t.worktreeBranch ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sessionId: session?.sessionId ?? null,
  };
}

function parseEnv(env: string | null | undefined): Record<string, string> {
  if (!env) return {};
  try {
    return JSON.parse(env) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Ordered list of relative paths to check for project icons, from most to least specific. */
const ICON_CANDIDATES = [
  // Web apps (CRA / Next.js / Vite / etc.)
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "public/apple-touch-icon.png",
  "public/logo.svg",
  "public/logo.png",
  // SvelteKit / static sites
  "static/favicon.svg",
  "static/favicon.ico",
  "static/favicon.png",
  "static/logo.svg",
  "static/logo.png",
  // Electron
  "assets/icon.png",
  "assets/icon.icns",
  "build/icon.png",
  "resources/icon.png",
  // Root-level fallbacks
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "logo.svg",
  "logo.png",
  // Source assets
  "src/assets/logo.svg",
  "src/assets/logo.png",
  "src/assets/favicon.svg",
  "src/assets/favicon.ico",
  "src/assets/favicon.png",
];

async function detectWorkspaceIcon(
  workspacePath: string,
): Promise<string | null> {
  for (const candidate of ICON_CANDIDATES) {
    try {
      await access(join(workspacePath, candidate));
      return candidate;
    } catch {
      // File not found — try next candidate.
    }
  }
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".icns": "image/x-icns",
};

async function createTasksFromPackageScripts(
  workspaceId: string,
  workspacePath: string,
) {
  try {
    const packageJsonText = await readFile(
      join(workspacePath, "package.json"),
      "utf8",
    );
    const packageJson = JSON.parse(packageJsonText) as {
      scripts?: Record<string, unknown>;
    };
    const scripts = packageJson.scripts;
    if (!scripts) return;

    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      if (typeof scriptCommand !== "string" || !scriptCommand.trim()) continue;
      createWorkspaceTask(workspaceId, {
        name: scriptName,
        icon: "terminal",
        command: `npm run ${scriptName}`,
      });
    }
  } catch {
    // Skip auto-task creation when package.json is missing or invalid.
  }
}

workspaces.get("/workspaces", (c) => {
  const result = listWorkspacesWithThreads().map((ws) => ({
    id: ws.id,
    name: ws.name,
    path: ws.path,
    openWithAppId: ws.openWithAppId ?? null,
    isPinned: ws.isPinned ?? false,
    env: parseEnv(ws.env),
    icon: ws.icon ?? null,
    createdAt: ws.createdAt,
    threads: ws.threads.map((t) => mapThread(t, ws.id)),
  }));
  return c.json({ workspaces: result });
});

/**
 * Runs the post-insert side effects shared by ordinary workspace creation and
 * worktree creation: kick off background indexing, auto-create npm-script tasks,
 * and detect + persist a project icon. Returns the detected icon (or null).
 */
async function finalizeWorkspaceCreation(
  workspaceId: string,
  path: string,
): Promise<string | null> {
  await createTasksFromPackageScripts(workspaceId, path);
  workspaceIndexer.startIndexing(workspaceId, path);
  semanticIndexer.start(workspaceId, path);
  lamdaConfigWatcher.watchWorkspace(workspaceId, path);
  const detectedIcon = await detectWorkspaceIcon(path).catch(() => null);
  if (detectedIcon) updateWorkspaceIcon(workspaceId, detectedIcon);
  return detectedIcon;
}

workspaces.post("/workspace", async (c) => {
  const parsed = await parseJsonBody(c, createWorkspaceSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.name || !body.path)
    return c.json({ error: "name and path are required" }, 400);

  const existing = getWorkspaceByPath(body.path);
  if (existing) {
    const wsWithThreads = listWorkspacesWithThreads().find(
      (w) => w.id === existing.id,
    );
    const threads = (wsWithThreads?.threads ?? []).map((t) =>
      mapThread(t, existing.id),
    );
    return c.json(
      {
        error: "A workspace already exists for this path",
        workspace: {
          ...existing,
          openWithAppId: existing.openWithAppId ?? null,
          env: parseEnv(existing.env),
          threads,
        },
      },
      409,
    );
  }

  const workspaceId = insertWorkspace(body.name, body.path);
  const detectedIcon = await finalizeWorkspaceCreation(workspaceId, body.path);

  return c.json(
    {
      workspace: {
        id: workspaceId,
        name: body.name,
        path: body.path,
        openWithAppId: null,
        isPinned: false,
        env: {},
        icon: detectedIcon,
        threads: [],
      },
    },
    201,
  );
});

/**
 * "Delete all data" — return the app to a first-launch state. Removes every
 * trace it has written: managed worktrees and the private `refs/lamda/` refs it
 * planted in the user's repos, remembered tool approvals inside each workspace,
 * every row in the database (settings included), everything on disk under
 * `~/.lamda` apart from the live database file itself, and the provider
 * credentials / local-model config it wrote. Running MCP servers,
 * watchers, and agent sessions are torn down first so nothing rewrites state
 * behind the wipe. The client restarts the server and reloads afterwards.
 */
workspaces.delete("/reset", async (_c) => {
  const allWorkspaces = listWorkspacesWithThreads();

  for (const ws of allWorkspaces) {
    try {
      await teardownWorkspaceThreads(ws.id, ws.path);
    } catch (error) {
      return _c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to clean up a managed worktree",
        },
        409,
      );
    }
  }

  // Stop everything that could write to the database or the data dir while (or
  // after) we clear it.
  stopAutomationScheduler();
  await deleteMcpSettings();
  for (const ws of allWorkspaces) {
    workspaceIndexer.stopIndexing(ws.id);
    semanticIndexer.stop(ws.id);
    fileTreeService.stopWorkspace(ws.id);
    lamdaConfigWatcher.stopWorkspace(ws.id);
  }

  // Any session left over from a workspace row that's already gone (e.g. one
  // deleted earlier this run) still holds a live agent — dispose those too.
  for (const { sessionId } of store.getAll()) {
    await sessionEvents.dispose(sessionId);
    store.delete(sessionId);
  }

  // Per-workspace artifacts that live inside the user's own directories.
  await Promise.all(
    allWorkspaces.map(async (ws) => {
      clearToolDecisions(ws.path);
      await gitDeleteAllLamdaRefs(ws.path);
    }),
  );

  resetDatabase();
  await clearAppDataDir();

  // Provider credentials and local-model registrations live in the pi agent's
  // config dir, not `~/.lamda` — a reset that left the user signed in wouldn't
  // be a reset. Only the two files this app writes are removed; the rest of
  // `~/.pi` belongs to the pi CLI and is left alone.
  await Promise.all(
    [AUTH_FILE, MODELS_FILE].map((file) =>
      rm(file, { force: true }).catch(() => {}),
    ),
  );
  resetModelRuntime();

  return new Response(null, { status: 204 });
});

// Slash commands (skills + prompt templates) available for the workspace,
// resolved without an active session. Lets the new-thread composer preview
// skills before the workspace's first thread (and its session) exists.
workspaces.get("/workspace/:id/commands", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  try {
    const commands = await getWorkspaceCommands(ws.path);
    return c.json({ commands });
  } catch {
    // A workspace whose resources can't be loaded (missing path, bad skill)
    // shouldn't break the composer — fall back to no skills.
    return c.json({ commands: [] });
  }
});

workspaces.get("/workspace/:id/files", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  workspaceIndexer.ensureIndexing(workspaceId, ws.path);
  return c.json({ files: workspaceIndexer.listFiles(workspaceId) });
});

// Lazy, on-demand directory listing for the file tree. Returns only the
// immediate children of `path` (workspace-relative, "" = root) and ensures a
// scoped watcher so changes broadcast a `workspace_dir_changed` event.
workspaces.get("/workspace/:id/dir", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  const relPath = c.req.query("path") ?? "";
  if (relPath.split("/").some((seg) => seg === "..")) {
    return c.json({ error: "Invalid path" }, 400);
  }

  // When the active thread runs in a worktree, the tree reads (and watches) that
  // worktree's directory instead of the workspace path.
  const rootDir = resolveTreeRoot(
    ws.path,
    c.req.query("threadId") ?? undefined,
  );

  try {
    const entries = await fileTreeService.readDir(rootDir, relPath);
    fileTreeService.watchDir(workspaceId, rootDir, relPath);
    return c.json({ entries });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

workspaces.post("/workspace/:id/reindex", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  workspaceIndexer
    .reindex(workspaceId)
    .catch((err) => console.error("[workspace-indexer] reindex failed:", err));
  return c.json({ ok: true });
});

// Semantic (embedding + keyword) search over the workspace's chunked file
// content. Best-effort: falls back to FTS/LIKE when local vectors aren't
// available — `mode` in the response tells the caller which path served it.
workspaces.get("/workspace/:id/semantic-search", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const q = c.req.query("q")?.trim() ?? "";
  if (!q) return c.json({ results: [], mode: "none" });
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit")) || 8));
  const path = c.req.query("path") || undefined;

  let queryVector: number[] | undefined;
  if (isVecAvailable() && embeddingsEnabled()) {
    queryVector = (await embedQuery(q).catch(() => null)) ?? undefined;
  }

  const { hits, mode } = searchCodeChunks(
    workspaceId,
    q,
    queryVector,
    limit,
    path,
  );
  return c.json({
    results: hits.map((h) => ({
      filePath: h.filePath,
      startLine: h.startLine,
      endLine: h.endLine,
      content: h.content,
      score: h.score,
    })),
    mode,
  });
});

workspaces.get("/workspace/:id/semantic-index/status", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const stats = getCodeIndexStats(workspaceId);
  const override =
    getSetting(`semantic_index.workspace.${workspaceId}`) ?? "auto";
  const enabled =
    getSetting("semantic_index.enabled") !== "false" && override !== "off";
  const injectionEnabled =
    getSetting("semantic_index.injection_enabled") !== "false";
  return c.json({
    ...stats,
    vecAvailable: isVecAvailable(),
    embeddingsEnabled: embeddingsEnabled(),
    enabled,
    injectionEnabled,
    override,
    lastError: semanticIndexer.getLastError(workspaceId),
  });
});

workspaces.post("/workspace/:id/semantic-index/reindex", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  semanticIndexer.reindex(workspaceId);
  return c.json({ ok: true }, 202);
});

const semanticIndexConfigSchema = z.object({
  enabled: z.boolean().optional(),
  injectionEnabled: z.boolean().optional(),
  override: z.enum(["auto", "on", "off"]).optional(),
});

workspaces.put("/workspace/:id/semantic-index/config", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const parsed = await parseJsonBody(c, semanticIndexConfigSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (body.enabled !== undefined) {
    upsertSetting("semantic_index.enabled", body.enabled ? "true" : "false");
  }
  if (body.injectionEnabled !== undefined) {
    upsertSetting(
      "semantic_index.injection_enabled",
      body.injectionEnabled ? "true" : "false",
    );
  }
  if (body.override !== undefined) {
    upsertSetting(`semantic_index.workspace.${workspaceId}`, body.override);
  }
  semanticIndexer.start(workspaceId, ws.path);
  return c.json({ ok: true });
});

workspaces.delete("/workspace/:id", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = listWorkspacesWithThreads().find((w) => w.id === workspaceId);
  if (ws) {
    try {
      await teardownWorkspaceThreads(ws.id, ws.path);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to clean up a managed worktree",
        },
        409,
      );
    }
  }
  workspaceIndexer.stopIndexing(workspaceId);
  semanticIndexer.stop(workspaceId);
  fileTreeService.stopWorkspace(workspaceId);
  lamdaConfigWatcher.stopWorkspace(workspaceId);
  // code_chunks_vec has no FK cascade — clear vectors explicitly before the
  // row cascade.
  clearWorkspaceChunks(workspaceId);
  deleteWorkspace(workspaceId);
  return new Response(null, { status: 204 });
});

workspaces.patch("/workspace/:id/open-with-app", async (c) => {
  const workspaceId = c.req.param("id");
  const parsed = await parseJsonBody(c, openWithAppSchema);
  if (!parsed.ok) return parsed.response;
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  updateWorkspaceOpenWithApp(workspaceId, parsed.data.appId ?? null);
  return c.json({ ok: true });
});

workspaces.patch("/workspace/:id/env", async (c) => {
  const workspaceId = c.req.param("id");
  const parsed = await parseJsonBody(c, workspaceEnvSchema);
  if (!parsed.ok) return parsed.response;
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  updateWorkspaceEnv(workspaceId, parsed.data.env ?? null);
  return c.json({ ok: true });
});

workspaces.patch("/workspace/:id/pin", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  pinWorkspace(workspaceId);
  return c.json({ ok: true });
});

workspaces.patch("/workspace/:id/unpin", (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  unpinWorkspace(workspaceId);
  return c.json({ ok: true });
});

/** Serves the detected icon file for a workspace (e.g. favicon.ico / logo.svg). */
workspaces.get("/workspace/:id/icon", async (c) => {
  const workspaceId = c.req.param("id");
  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  if (!ws.icon) return c.json({ error: "No icon for this workspace" }, 404);

  const iconPath = join(ws.path, ws.icon);
  let data: Buffer;
  try {
    data = await readFile(iconPath);
  } catch {
    return c.json({ error: "Icon file not found on disk" }, 404);
  }

  const ext = extname(iconPath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
});

export default workspaces;
