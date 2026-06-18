import { Hono } from "hono";
import { mkdir } from "node:fs/promises";
import { basename } from "node:path";
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
  updateThreadApprovalMode,
  updateThreadStopped,
  updateThreadLastAccessed,
  setThreadWorktree,
  clearThreadWorktree,
} from "@lamda/db";
import {
  createPlanModeTools,
  createTodoTool,
  createMemoryTool,
  normalizeMode,
  lamdaWorktreesDir,
  lamdaWorktreePath,
} from "@lamda/pi-sdk";
import {
  gitDeleteCheckpointRef,
  getRepoRoot,
  getCurrentBranch,
  addWorktree,
  listWorktrees,
  removeWorktree,
  pruneWorktrees,
  mergeBranch,
  gitStatus,
} from "@lamda/git";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import {
  collectCustomTools,
  createSessionForThread,
  resolveThreadCwd,
  relocateThreadSession,
} from "../services/session-service.js";
import { scheduleReflection } from "../services/memory-reflection.js";

function parseGitError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("error:") || l.startsWith("fatal:") || l.startsWith("CONFLICT"));
  return line ?? raw.split("\n").find(Boolean) ?? fallback;
}

const threads = new Hono();

threads.post("/workspace/:workspaceId/thread", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  type CreateThreadBody = {
    provider?: string;
    model?: string;
    title?: string;
    mode?: string;
    modelId?: string | null;
    approvalMode?: string;
  };
  const body = await c.req
    .json<CreateThreadBody>()
    .catch((): CreateThreadBody => ({}));

  const ws = getWorkspace(workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (body.mode !== undefined && !normalizeMode(body.mode)) {
    return c.json({ error: "mode must be 'ask', 'plan', or 'agent'" }, 400);
  }

  if (
    body.approvalMode !== undefined &&
    body.approvalMode !== "ask" &&
    body.approvalMode !== "all_allowed"
  ) {
    return c.json(
      { error: "approvalMode must be 'ask' or 'all_allowed'" },
      400,
    );
  }

  const title = body.title?.trim() || "New Thread";
  const mode = normalizeMode(body.mode) ?? "agent";
  const modelId = body.modelId ?? null;
  const approvalMode =
    body.approvalMode === "all_allowed" ? "all_allowed" : "ask";

  // Insert with the requested mode before creating the session — the session
  // builds its custom tools from the thread's persisted mode.
  const threadId = insertThread(workspaceId, {
    title,
    mode,
    modelId,
    approvalMode,
  });
  // A freshly created thread is always "local" (no worktree yet), so its cwd is
  // the workspace path; resolveThreadCwd keeps this explicit and future-proof.
  const sessionId = await createSessionForThread(
    threadId,
    resolveThreadCwd(getThread(threadId), ws.path),
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
        approvalMode,
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

threads.patch("/thread/:id/approval-mode", async (c) => {
  const threadId = c.req.param("id");
  const body = await c.req
    .json<{ approvalMode?: string }>()
    .catch((): { approvalMode?: string } => ({}));
  if (body.approvalMode !== "ask" && body.approvalMode !== "all_allowed") {
    return c.json({ error: "approvalMode must be 'ask' or 'all_allowed'" }, 400);
  }
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  // The bridge reads approval_mode fresh on each tool call, so persisting is
  // enough — no session handle update needed.
  updateThreadApprovalMode(threadId, body.approvalMode);
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
  // Archiving is the natural "done with this thread" signal: consolidate durable
  // memories from it in the background (data is preserved, unlike on delete).
  scheduleReflection(threadId);
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

// ── Thread worktrees ──────────────────────────────────────────────────────────
// A thread can run inside its own git worktree (an isolated checkout on a new
// branch under ~/.lamda/worktrees) instead of the workspace directory. The same
// thread continues — only its session cwd moves — so its chat, git panel, and
// file tree follow into the worktree.

// Move a thread into a freshly created worktree on a new branch.
threads.post("/thread/:id/worktree", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  if (thread.worktreePath)
    return c.json({ error: "Thread is already in a worktree" }, 400);

  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  const body = await c.req
    .json<{ newBranch?: string; baseRef?: string }>()
    .catch((): { newBranch?: string; baseRef?: string } => ({}));
  const newBranch = body.newBranch?.trim();
  if (!newBranch) return c.json({ error: "newBranch is required" }, 400);

  const repoRoot = await getRepoRoot(ws.path);
  if (!repoRoot)
    return c.json({ error: "Workspace is not a git repository" }, 400);

  const baseRef = body.baseRef?.trim() || (await getCurrentBranch(repoRoot));
  if (!baseRef)
    return c.json({ error: "Could not determine a base branch" }, 400);

  const worktreePath = lamdaWorktreePath(basename(repoRoot), newBranch);
  try {
    await mkdir(lamdaWorktreesDir(), { recursive: true });
    await addWorktree(repoRoot, worktreePath, newBranch, baseRef);
  } catch (err) {
    return c.json({ error: parseGitError(err, "Failed to create worktree") }, 500);
  }

  setThreadWorktree(threadId, worktreePath, newBranch);
  await relocateThreadSession(threadId, worktreePath);
  return c.json({ worktreePath, worktreeBranch: newBranch });
});

// Move a thread into an EXISTING worktree identified by its branch (e.g. the
// user picked a worktree's branch in the branch selector). The branch can't be
// checked out in place, so we switch the thread's cwd to that worktree instead.
threads.post("/thread/:id/worktree/enter", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  const body = await c.req
    .json<{ branch?: string }>()
    .catch((): { branch?: string } => ({}));
  const branch = body.branch?.trim();
  if (!branch) return c.json({ error: "branch is required" }, 400);

  const repoRoot = await getRepoRoot(ws.path);
  if (!repoRoot)
    return c.json({ error: "Workspace is not a git repository" }, 400);

  const wt = (await listWorktrees(repoRoot)).find(
    (w) => w.branch === branch && w.path !== repoRoot,
  );
  if (!wt) return c.json({ error: "No worktree exists for that branch" }, 404);

  setThreadWorktree(threadId, wt.path, branch);
  await relocateThreadSession(threadId, wt.path);
  return c.json({ worktreePath: wt.path, worktreeBranch: branch });
});

// Move a thread back to the workspace directory, leaving the worktree on disk.
threads.post("/thread/:id/worktree/local", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (!thread.worktreePath) return c.json({ ok: true }); // already local
  clearThreadWorktree(threadId);
  await relocateThreadSession(threadId, ws.path);
  return c.json({ ok: true });
});

// Merge the thread's worktree branch back into the workspace, then remove the
// worktree and return the thread to the workspace directory. Without
// ?force=true, refuses when the worktree has uncommitted (un-mergeable) changes.
threads.post("/thread/:id/worktree/merge", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  if (!thread.worktreePath || !thread.worktreeBranch)
    return c.json({ error: "Thread is not in a worktree" }, 400);

  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const repoRoot = await getRepoRoot(ws.path);
  if (!repoRoot)
    return c.json({ error: "Workspace is not a git repository" }, 400);

  const force = c.req.query("force") === "true";
  if (!force) {
    const status = await gitStatus(thread.worktreePath).catch(() => "");
    if (status.trim().length > 0) {
      return c.json(
        {
          error:
            "Worktree has uncommitted changes that won't be merged. Commit them first or force.",
          uncommitted: true,
        },
        409,
      );
    }
  }

  // Merge the worktree's branch into whatever the workspace currently has
  // checked out. Conflicts/dirty tree throw and are surfaced (merge is aborted).
  try {
    await mergeBranch(ws.path, thread.worktreeBranch);
  } catch (err) {
    return c.json({ error: parseGitError(err, "Merge failed") }, 409);
  }

  // Merge succeeded — tear down the worktree and bring the thread back local.
  try {
    await removeWorktree(repoRoot, thread.worktreePath, true);
    await pruneWorktrees(repoRoot);
  } catch (err) {
    // The merge landed; surface the cleanup failure but don't pretend it failed.
    console.error("[worktree-merge] cleanup failed:", err);
  }
  clearThreadWorktree(threadId);
  await relocateThreadSession(threadId, ws.path);
  return c.json({ merged: true, branch: thread.worktreeBranch });
});

export default threads;
