import { Hono } from "hono";
import { readFile, access } from "node:fs/promises";
import { join, extname } from "node:path";
import {
  listWorkspacesWithThreads,
  getWorkspace,
  getWorkspaceByPath,
  insertWorkspace,
  deleteWorkspace,
  deleteAllWorkspaces,
  updateWorkspaceOpenWithApp,
  updateWorkspaceEnv,
  updateWorkspaceIcon,
  pinWorkspace,
  unpinWorkspace,
  createWorkspaceTask,
} from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { workspaceIndexer } from "../services/workspace-indexer.js";
import { fileTreeService } from "../services/file-tree-service.js";

const workspaces = new Hono();

function mapThread(
  t: {
    id: string;
    title: string | null;
    modelId: string | null;
    mode: "ask" | "plan" | "agent";
    approvalMode: "ask" | "all_allowed";
    isStopped: boolean;
    createdAt: number;
    updatedAt: number;
    isPinned: boolean;
    forkedFromId?: string | null;
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

async function detectWorkspaceIcon(workspacePath: string): Promise<string | null> {
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

workspaces.post("/workspace", async (c) => {
  const body = await c.req
    .json<{ name?: string; path?: string; provider?: string; model?: string }>()
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
  await createTasksFromPackageScripts(workspaceId, body.path);

  workspaceIndexer.startIndexing(workspaceId, body.path);

  // Detect icon and persist it; best-effort — don't fail workspace creation.
  const detectedIcon = await detectWorkspaceIcon(body.path).catch(() => null);
  if (detectedIcon) updateWorkspaceIcon(workspaceId, detectedIcon);

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

  try {
    const entries = await fileTreeService.readDir(ws.path, relPath);
    fileTreeService.watchDir(workspaceId, ws.path, relPath);
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

workspaces.delete("/workspace/:id", async (c) => {
  const workspaceId = c.req.param("id");
  workspaceIndexer.stopIndexing(workspaceId);
  fileTreeService.stopWorkspace(workspaceId);
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
