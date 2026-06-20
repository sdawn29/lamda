import { Hono } from "hono";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  getWorkspace,
  getThread,
  getActiveWorktreeMerge,
  claimThreadWorktreeMerge,
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
  setThreadWorktreeMergeInProgress,
  setThreadWorktreeMergeHeadSha,
  setThreadWorktreeBaseBranch,
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
  checkoutBranch,
  addWorktree,
  deleteBranch,
  listWorktrees,
  removeWorktree,
  pruneWorktrees,
  mergeBranch,
  listMergeConflicts,
  resolveMergeConflict,
  readConflictedFile,
  writeResolvedConflict,
  continueMerge,
  abortMerge,
  isMergeInProgress,
  isRefAncestor,
  getRefSha,
  gitStatus,
  gitStash,
  gitStashList,
  gitStashPop,
} from "@lamda/git";
import { parseGitError } from "./git.js";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import {
  collectCustomTools,
  createSessionForThread,
  relocateThreadSession,
} from "../services/session-service.js";
import { scheduleReflection } from "../services/memory-reflection.js";
import { removeOwnedThreadWorktree } from "../services/worktree-service.js";


/**
 * Finds the `stash@{N}` ref whose subject contains `message`. `git stash`
 * records the message in the subject as `On <branch>: <message>`, so we match
 * by substring rather than exact equality.
 */
async function findStashRef(
  cwd: string,
  message: string,
): Promise<string | null> {
  const list = await gitStashList(cwd).catch(() => "");
  for (const line of list.split("\n")) {
    const [ref, ...rest] = line.split("\t");
    if (ref && rest.join("\t").includes(message)) return ref;
  }
  return null;
}

async function threadOwnsActiveGitMerge(
  thread: NonNullable<ReturnType<typeof getThread>>,
  workspacePath: string,
): Promise<boolean> {
  if (!thread.worktreeMergeInProgress || !thread.worktreeMergeHeadSha) {
    return false;
  }
  const mergeHead = await getRefSha(workspacePath, "MERGE_HEAD");
  return !!mergeHead && mergeHead === thread.worktreeMergeHeadSha;
}

async function recordThreadMergeHead(
  threadId: string,
  workspacePath: string,
): Promise<boolean> {
  const mergeHead = await getRefSha(workspacePath, "MERGE_HEAD");
  if (!mergeHead) return false;
  setThreadWorktreeMergeHeadSha(threadId, mergeHead);
  return true;
}

async function finishWorktreeMerge({
  threadId,
  workspacePath,
  repoRoot,
  worktreePath,
  worktreeBranch,
  ownsWorktreeBranch,
}: {
  threadId: string;
  workspacePath: string;
  repoRoot: string;
  worktreePath: string;
  worktreeBranch: string;
  ownsWorktreeBranch: boolean;
}): Promise<{ cleanupWarning?: string }> {
  await relocateThreadSession(threadId, workspacePath);

  try {
    await removeWorktree(repoRoot, worktreePath, true);
    await pruneWorktrees(repoRoot);
  } catch (error) {
    // The worktree still exists, so restore the live session before surfacing
    // the failure and keep the persisted association intact for a retry.
    await relocateThreadSession(threadId, worktreePath).catch(() => {});
    throw error;
  }

  let cleanupWarning: string | undefined;
  if (ownsWorktreeBranch) {
    try {
      await deleteBranch(repoRoot, worktreeBranch);
    } catch (error) {
      cleanupWarning = `Merge completed and the worktree was removed, but branch "${worktreeBranch}" could not be deleted: ${parseGitError(error, "branch cleanup failed")}`;
    }
  }

  clearThreadWorktree(threadId);
  return { cleanupWarning };
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
    worktree?: {
      newBranch?: string;
      baseRef?: string;
    };
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
  let worktreePath: string | null = null;
  let worktreeBranch: string | null = null;

  if (body.worktree) {
    const newBranch = body.worktree.newBranch?.trim();
    if (!newBranch) {
      deleteThread(threadId);
      return c.json({ error: "worktree.newBranch is required" }, 400);
    }
    const repoRoot = await getRepoRoot(ws.path);
    if (!repoRoot) {
      deleteThread(threadId);
      return c.json({ error: "Workspace is not a git repository" }, 400);
    }
    const workspaceBranch = await getCurrentBranch(repoRoot);
    const baseRef = body.worktree.baseRef?.trim() || workspaceBranch;
    if (!baseRef) {
      deleteThread(threadId);
      return c.json({ error: "Could not determine a base branch" }, 400);
    }
    // A worktree must fork from a real commit. A freshly-initialized repo has an
    // unborn branch (no commits), so the base ref doesn't resolve and git fails
    // with a cryptic "invalid reference". Detect it and explain the fix instead.
    if (!(await getRefSha(repoRoot, baseRef))) {
      deleteThread(threadId);
      return c.json(
        {
          error: `Branch "${baseRef}" has no commits yet — make an initial commit before creating a worktree, or run this thread locally.`,
        },
        400,
      );
    }

    worktreePath = lamdaWorktreePath(ws.name, newBranch);
    let worktreeCreated = false;
    try {
      await mkdir(lamdaWorktreesDir(ws.name), { recursive: true });
      await addWorktree(repoRoot, worktreePath, newBranch, baseRef);
      worktreeCreated = true;
      setThreadWorktree(threadId, worktreePath, newBranch, true, baseRef);
      worktreeBranch = newBranch;
    } catch (error) {
      if (worktreeCreated) {
        await removeOwnedThreadWorktree(ws.path, {
          worktreePath,
          worktreeBranch: newBranch,
          ownsWorktreeBranch: true,
        }).catch(() => {});
      }
      deleteThread(threadId);
      return c.json(
        { error: parseGitError(error, "Failed to create worktree") },
        500,
      );
    }
  }

  let sessionId: string;
  try {
    sessionId = await createSessionForThread(
      threadId,
      worktreePath ?? ws.path,
      workspaceId,
      {
        provider: body.provider,
        model: body.model,
      },
    );
  } catch (error) {
    if (worktreePath && worktreeBranch) {
      await removeOwnedThreadWorktree(ws.path, {
        worktreePath,
        worktreeBranch,
        ownsWorktreeBranch: true,
      }).catch(() => {});
    }
    deleteThread(threadId);
    return c.json(
      { error: parseGitError(error, "Failed to create thread session") },
      500,
    );
  }

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
        worktreePath,
        worktreeBranch,
      },
    },
    201,
  );
});

threads.delete("/thread/:id", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (thread?.worktreeMergeInProgress) {
    return c.json(
      { error: "Abort the active merge before deleting the thread" },
      409,
    );
  }
  const workspace = thread ? getWorkspace(thread.workspaceId) : null;
  if (workspace?.path) {
    try {
      await removeOwnedThreadWorktree(workspace.path, thread ?? {});
    } catch (error) {
      return c.json(
        {
          error: parseGitError(
            error,
            "Could not remove the thread's managed worktree",
          ),
        },
        409,
      );
    }
  }

  const session = store.getByThreadId(threadId);
  if (session) {
    await sessionEvents.dispose(session.sessionId);
    store.delete(session.sessionId);
  }

  // agent_turns has no FK cascade — clean up its rows and the durable checkpoint
  // refs they anchor before dropping the thread, so neither leaks.
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
    return c.json(
      { error: "approvalMode must be 'ask' or 'all_allowed'" },
      400,
    );
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
// branch under ~/.lamda/worktrees/<workspace-name>/<worktree-name>) instead of
// the workspace directory. The same thread continues — only its session cwd
// moves — so its chat, git panel, and file tree follow into the worktree.

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

  const workspaceBranch = await getCurrentBranch(repoRoot);
  const baseRef = body.baseRef?.trim() || workspaceBranch;
  if (!baseRef)
    return c.json({ error: "Could not determine a base branch" }, 400);
  // A worktree must fork from a real commit (see createThread above).
  if (!(await getRefSha(repoRoot, baseRef)))
    return c.json(
      {
        error: `Branch "${baseRef}" has no commits yet — make an initial commit before creating a worktree, or run this thread locally.`,
      },
      400,
    );

  const worktreePath = lamdaWorktreePath(ws.name, newBranch);
  try {
    await mkdir(lamdaWorktreesDir(ws.name), { recursive: true });
    await addWorktree(repoRoot, worktreePath, newBranch, baseRef);
  } catch (err) {
    return c.json(
      { error: parseGitError(err, "Failed to create worktree") },
      500,
    );
  }

  try {
    await relocateThreadSession(threadId, worktreePath);
  } catch (error) {
    await removeOwnedThreadWorktree(ws.path, {
      worktreePath,
      worktreeBranch: newBranch,
      ownsWorktreeBranch: true,
    }).catch(() => {});
    return c.json(
      { error: parseGitError(error, "Failed to move session into worktree") },
      500,
    );
  }
  setThreadWorktree(threadId, worktreePath, newBranch, true, baseRef);
  return c.json({ worktreePath, worktreeBranch: newBranch });
});

// Move a thread into an EXISTING worktree identified by its branch (e.g. the
// user picked a worktree's branch in the branch selector). The branch can't be
// checked out in place, so we switch the thread's cwd to that worktree instead.
threads.post("/thread/:id/worktree/enter", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  if (thread.worktreePath) {
    return c.json({ error: "Thread is already in a worktree" }, 400);
  }
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
  if (!existsSync(wt.path)) {
    return c.json({ error: "The selected worktree no longer exists" }, 409);
  }
  if (wt.locked) {
    return c.json({ error: "The selected worktree is locked" }, 409);
  }

  const workspaceBranch = await getCurrentBranch(repoRoot);
  if (!workspaceBranch) {
    return c.json({ error: "Could not determine the workspace branch" }, 400);
  }
  try {
    await relocateThreadSession(threadId, wt.path);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Failed to enter worktree") },
      500,
    );
  }
  setThreadWorktree(threadId, wt.path, branch, false, workspaceBranch);
  return c.json({ worktreePath: wt.path, worktreeBranch: branch });
});

// Move a thread back to the workspace directory. A lamda-owned worktree is
// removed once clean; a pre-existing worktree is only detached and left alone.
threads.post("/thread/:id/worktree/local", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (!thread.worktreePath) return c.json({ ok: true }); // already local
  if (thread.worktreeMergeInProgress) {
    return c.json({ error: "Abort the active merge before going local" }, 409);
  }

  let worktreeStatus: string;
  try {
    worktreeStatus = await gitStatus(thread.worktreePath);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Could not inspect worktree status") },
      409,
    );
  }
  if (thread.ownsWorktreeBranch && worktreeStatus.trim()) {
    return c.json(
      {
        error:
          "Commit or discard the managed worktree's changes before going local",
      },
      409,
    );
  }

  try {
    await relocateThreadSession(threadId, ws.path);
    const cleanup = await removeOwnedThreadWorktree(ws.path, thread);
    clearThreadWorktree(threadId);
    return c.json({ ok: true, cleanupWarning: cleanup.branchDeleteWarning });
  } catch (error) {
    await relocateThreadSession(threadId, thread.worktreePath).catch(() => {});
    return c.json(
      { error: parseGitError(error, "Failed to return to the workspace") },
      409,
    );
  }
});

// Return the thread to the workspace directory and check out the worktree's
// branch there — no merge. The managed worktree is removed (which frees the
// branch) and the workspace is switched onto that branch, so work continues
// locally on the same branch.
threads.post("/thread/:id/worktree/checkout-local", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (!thread.worktreePath || !thread.worktreeBranch) {
    return c.json({ error: "Thread is not in a worktree" }, 400);
  }
  if (thread.worktreeMergeInProgress) {
    return c.json({ error: "Abort the active merge before going local" }, 409);
  }
  // A pre-existing (user-created) worktree must not be removed, and its branch
  // can't be checked out in the workspace while that worktree holds it.
  if (!thread.ownsWorktreeBranch) {
    return c.json(
      {
        error:
          "This thread uses a pre-existing worktree. Check out its branch from that worktree directly.",
      },
      409,
    );
  }

  const repoRoot = await getRepoRoot(ws.path);
  if (!repoRoot)
    return c.json({ error: "Workspace is not a git repository" }, 400);

  // The workspace must be clean so the branch can be checked out and the
  // worktree's carried-over changes restored onto a known-clean tree.
  let workspaceStatus: string;
  try {
    workspaceStatus = await gitStatus(ws.path);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Could not inspect workspace status") },
      409,
    );
  }
  if (workspaceStatus.trim()) {
    return c.json(
      {
        error:
          "The workspace has uncommitted changes. Commit or stash them before checking out the branch.",
      },
      409,
    );
  }

  // Carry the worktree's uncommitted changes over instead of blocking on them:
  // stash (incl. untracked) into the shared .git store before the worktree is
  // removed, then pop onto the freshly checked-out branch in the workspace.
  let worktreeStatus: string;
  try {
    worktreeStatus = await gitStatus(thread.worktreePath);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Could not inspect worktree status") },
      409,
    );
  }
  const worktreeDirty = worktreeStatus.trim().length > 0;
  const stashMessage = `lamda-checkout-local-${threadId}-${Date.now()}`;

  if (worktreeDirty) {
    try {
      await gitStash(thread.worktreePath, stashMessage);
    } catch (error) {
      return c.json(
        { error: parseGitError(error, "Could not stash the worktree's changes") },
        409,
      );
    }
  }

  const branch = thread.worktreeBranch;
  const worktreePath = thread.worktreePath;
  try {
    await relocateThreadSession(threadId, ws.path);
    if (existsSync(worktreePath)) {
      await removeWorktree(repoRoot, worktreePath, true);
    }
    await pruneWorktrees(repoRoot);
    await checkoutBranch(ws.path, branch);
    clearThreadWorktree(threadId);
  } catch (error) {
    // Best-effort rollback: only meaningful if the worktree still exists.
    if (existsSync(worktreePath)) {
      await relocateThreadSession(threadId, worktreePath).catch(() => {});
    }
    return c.json(
      { error: parseGitError(error, "Failed to check out the branch locally") },
      409,
    );
  }

  // Restore the carried-over changes. The branch is already checked out, so a
  // pop failure is non-fatal: the stash remains in the list for recovery.
  let cleanupWarning: string | undefined;
  if (worktreeDirty) {
    try {
      const ref = await findStashRef(ws.path, stashMessage);
      if (ref) {
        await gitStashPop(ws.path, ref);
      } else {
        cleanupWarning =
          "Your changes were stashed but the stash entry couldn't be located — run `git stash list` to recover them.";
      }
    } catch (error) {
      cleanupWarning = `Branch checked out, but restoring your changes failed: ${parseGitError(error, "stash pop failed")}. They remain in the stash list (\`git stash list\`).`;
    }
  }

  return c.json({ ok: true, branch, cleanupWarning });
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

  const currentWorkspaceBranch = await getCurrentBranch(ws.path);
  const mergeTarget =
    thread.worktreeBaseBranch ?? currentWorkspaceBranch ?? null;
  if (!mergeTarget || currentWorkspaceBranch !== mergeTarget) {
    return c.json(
      {
        error: mergeTarget
          ? `Checkout "${mergeTarget}" in the workspace before merging this worktree`
          : "Could not determine the intended workspace merge branch",
        expectedBranch: mergeTarget,
        currentBranch: currentWorkspaceBranch,
      },
      409,
    );
  }
  if (!thread.worktreeBaseBranch) {
    setThreadWorktreeBaseBranch(threadId, mergeTarget);
  }

  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (activeMergeOwner && activeMergeOwner.id !== threadId) {
    return c.json(
      {
        error: `Another thread (${activeMergeOwner.title}) owns the workspace's active merge`,
      },
      409,
    );
  }

  if (thread.worktreeMergeInProgress) {
    const mergePending = await isMergeInProgress(ws.path);
    if (mergePending) {
      if (!(await threadOwnsActiveGitMerge(thread, ws.path))) {
        return c.json(
          {
            error:
              "Git's active merge no longer matches this worktree. Abort it manually before retrying.",
          },
          409,
        );
      }
      const conflicts = await listMergeConflicts(ws.path).catch(() => []);
      return c.json(
        {
          error:
            conflicts.length > 0
              ? "Merge conflicts need resolution"
              : "The merge is ready to complete",
          conflicts,
          conflictState: true,
          readyToContinue: conflicts.length === 0,
        },
        409,
      );
    }

    // The server may have stopped after committing but before worktree cleanup.
    // If the incoming branch is already contained in HEAD, safely resume cleanup.
    if (await isRefAncestor(ws.path, thread.worktreeBranch)) {
      try {
        const cleanup = await finishWorktreeMerge({
          threadId,
          workspacePath: ws.path,
          repoRoot,
          worktreePath: thread.worktreePath,
          worktreeBranch: thread.worktreeBranch,
          ownsWorktreeBranch: thread.ownsWorktreeBranch,
        });
        return c.json({
          merged: true,
          branch: thread.worktreeBranch,
          cleanupWarning: cleanup.cleanupWarning,
        });
      } catch (error) {
        return c.json(
          { error: parseGitError(error, "Merge cleanup failed") },
          409,
        );
      }
    }

    setThreadWorktreeMergeInProgress(threadId, false);
    return c.json(
      {
        error:
          "The recorded merge no longer exists in Git. Its ownership state was reset; retry the merge.",
      },
      409,
    );
  }

  if (await isMergeInProgress(ws.path)) {
    return c.json(
      {
        error:
          "The workspace already has an unowned Git merge in progress. Finish or abort it before merging a worktree.",
      },
      409,
    );
  }

  const force = c.req.query("force") === "true";
  let worktreeStatus: string;
  try {
    worktreeStatus = await gitStatus(thread.worktreePath);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Could not inspect worktree status") },
      409,
    );
  }
  if (!force) {
    if (worktreeStatus.trim()) {
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

  let workspaceStatus: string;
  try {
    workspaceStatus = await gitStatus(ws.path);
  } catch (error) {
    return c.json(
      { error: parseGitError(error, "Could not inspect workspace status") },
      409,
    );
  }
  if (workspaceStatus.trim()) {
    return c.json(
      {
        error:
          "The workspace has uncommitted changes. Commit or stash them before merging a worktree.",
        workspaceDirty: true,
      },
      409,
    );
  }

  // First ask Git to prepare a non-committing merge. This performs the real
  // merge/conflict check without finalizing anything: conflicts remain active
  // for the resolver UI; a clean merge is committed below before cleanup.
  if (!claimThreadWorktreeMerge(threadId, thread.workspaceId)) {
    return c.json({ error: "Another thread claimed the workspace merge" }, 409);
  }
  let mergePending = false;
  try {
    mergePending = await mergeBranch(ws.path, thread.worktreeBranch);
  } catch (err) {
    const conflicts = await listMergeConflicts(ws.path).catch(() => []);
    if (conflicts.length > 0) {
      if (!(await recordThreadMergeHead(threadId, ws.path))) {
        setThreadWorktreeMergeInProgress(threadId, false);
        return c.json(
          { error: "Git reported conflicts without an active merge head" },
          409,
        );
      }
      return c.json(
        {
          error: "Merge conflicts need resolution",
          conflicts,
          conflictState: true,
          readyToContinue: false,
        },
        409,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/CONFLICT|MERGE_HEAD|unmerged files|fix conflicts/i.test(message)) {
      const mergeHeadRecorded = await recordThreadMergeHead(threadId, ws.path);
      if (!mergeHeadRecorded) {
        setThreadWorktreeMergeInProgress(threadId, false);
        return c.json(
          { error: parseGitError(err, "Merge failed before it could start") },
          409,
        );
      }
      return c.json(
        {
          error:
            "Git reports an unresolved merge, but no conflicted files could be identified. Abort the merge and retry.",
          conflicts: [],
          conflictState: true,
          readyToContinue: true,
        },
        409,
      );
    }
    await abortMerge(ws.path);
    setThreadWorktreeMergeInProgress(threadId, false);
    return c.json({ error: parseGitError(err, "Merge failed") }, 409);
  }

  if (mergePending) {
    if (!(await recordThreadMergeHead(threadId, ws.path))) {
      setThreadWorktreeMergeInProgress(threadId, false);
      return c.json(
        { error: "Git did not expose the pending merge head" },
        409,
      );
    }
    try {
      await continueMerge(ws.path);
    } catch (err) {
      return c.json(
        { error: parseGitError(err, "Could not complete merge") },
        409,
      );
    }
  }

  try {
    const cleanup = await finishWorktreeMerge({
      threadId,
      workspacePath: ws.path,
      repoRoot,
      worktreePath: thread.worktreePath,
      worktreeBranch: thread.worktreeBranch,
      ownsWorktreeBranch: thread.ownsWorktreeBranch,
    });
    return c.json({
      merged: true,
      branch: thread.worktreeBranch,
      cleanupWarning: cleanup.cleanupWarning,
    });
  } catch (error) {
    return c.json({ error: parseGitError(error, "Merge cleanup failed") }, 409);
  }
});

threads.post("/thread/:id/worktree/merge/resolve", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread?.worktreePath || !thread.worktreeBranch)
    return c.json({ error: "Thread is not in a worktree" }, 400);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (
    activeMergeOwner?.id !== threadId ||
    !(await threadOwnsActiveGitMerge(thread, ws.path))
  ) {
    return c.json(
      { error: "This thread does not own an active workspace merge" },
      409,
    );
  }

  type ResolveConflictBody = {
    filePath?: string;
    strategy?: "ours" | "theirs";
  };
  const body = await c.req
    .json<ResolveConflictBody>()
    .catch((): ResolveConflictBody => ({}));
  if (!body.filePath || !["ours", "theirs"].includes(body.strategy ?? "")) {
    return c.json({ error: "filePath and strategy are required" }, 400);
  }

  const conflicts = await listMergeConflicts(ws.path);
  if (!conflicts.includes(body.filePath)) {
    return c.json({ error: "File is not an active merge conflict" }, 400);
  }
  await resolveMergeConflict(ws.path, body.filePath, body.strategy!);
  return c.json({ conflicts: await listMergeConflicts(ws.path) });
});

// Returns a conflicted file's working-tree contents (with `<<<<<<<` markers) so
// it can be resolved by hand in the editor.
threads.get("/thread/:id/worktree/merge/conflict", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread?.worktreePath || !thread.worktreeBranch)
    return c.json({ error: "Thread is not in a worktree" }, 400);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (
    activeMergeOwner?.id !== threadId ||
    !(await threadOwnsActiveGitMerge(thread, ws.path))
  ) {
    return c.json(
      { error: "This thread does not own an active workspace merge" },
      409,
    );
  }

  const filePath = c.req.query("file");
  if (!filePath) return c.json({ error: "file is required" }, 400);
  const conflicts = await listMergeConflicts(ws.path);
  if (!conflicts.includes(filePath)) {
    return c.json({ error: "File is not an active merge conflict" }, 400);
  }
  try {
    return c.json({ content: await readConflictedFile(ws.path, filePath) });
  } catch (err) {
    return c.json(
      { error: parseGitError(err, "Could not read conflicted file") },
      500,
    );
  }
});

// Saves a hand-resolved version of a conflicted file and stages it.
threads.post("/thread/:id/worktree/merge/resolve-content", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread?.worktreePath || !thread.worktreeBranch)
    return c.json({ error: "Thread is not in a worktree" }, 400);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (
    activeMergeOwner?.id !== threadId ||
    !(await threadOwnsActiveGitMerge(thread, ws.path))
  ) {
    return c.json(
      { error: "This thread does not own an active workspace merge" },
      409,
    );
  }

  type ResolveContentBody = { filePath?: string; content?: string };
  const body = await c.req
    .json<ResolveContentBody>()
    .catch((): ResolveContentBody => ({}));
  if (!body.filePath || typeof body.content !== "string") {
    return c.json({ error: "filePath and content are required" }, 400);
  }
  const conflicts = await listMergeConflicts(ws.path);
  if (!conflicts.includes(body.filePath)) {
    return c.json({ error: "File is not an active merge conflict" }, 400);
  }
  try {
    await writeResolvedConflict(ws.path, body.filePath, body.content);
  } catch (err) {
    return c.json(
      { error: parseGitError(err, "Could not save resolution") },
      500,
    );
  }
  return c.json({ conflicts: await listMergeConflicts(ws.path) });
});

threads.post("/thread/:id/worktree/merge/continue", async (c) => {
  const threadId = c.req.param("id");
  const thread = getThread(threadId);
  if (!thread?.worktreePath || !thread.worktreeBranch)
    return c.json({ error: "Thread is not in a worktree" }, 400);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const repoRoot = await getRepoRoot(ws.path);
  if (!repoRoot)
    return c.json({ error: "Workspace is not a git repository" }, 400);
  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (activeMergeOwner?.id !== threadId) {
    return c.json(
      { error: "This thread does not own the workspace merge" },
      409,
    );
  }
  const currentWorkspaceBranch = await getCurrentBranch(ws.path);
  if (
    thread.worktreeBaseBranch &&
    currentWorkspaceBranch !== thread.worktreeBaseBranch
  ) {
    return c.json(
      {
        error: `Checkout "${thread.worktreeBaseBranch}" in the workspace before continuing`,
      },
      409,
    );
  }

  try {
    if (await isMergeInProgress(ws.path)) {
      if (!(await threadOwnsActiveGitMerge(thread, ws.path))) {
        return c.json(
          { error: "Git's active merge no longer matches this worktree" },
          409,
        );
      }
      await continueMerge(ws.path);
    } else if (!(await isRefAncestor(ws.path, thread.worktreeBranch))) {
      return c.json({ error: "The owned Git merge is no longer active" }, 409);
    }
  } catch (err) {
    return c.json(
      { error: parseGitError(err, "Could not continue merge") },
      409,
    );
  }
  try {
    const cleanup = await finishWorktreeMerge({
      threadId,
      workspacePath: ws.path,
      repoRoot,
      worktreePath: thread.worktreePath,
      worktreeBranch: thread.worktreeBranch,
      ownsWorktreeBranch: thread.ownsWorktreeBranch,
    });
    return c.json({
      merged: true,
      branch: thread.worktreeBranch,
      cleanupWarning: cleanup.cleanupWarning,
    });
  } catch (error) {
    return c.json({ error: parseGitError(error, "Merge cleanup failed") }, 409);
  }
});

threads.post("/thread/:id/worktree/merge/abort", async (c) => {
  const thread = getThread(c.req.param("id"));
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  const ws = getWorkspace(thread.workspaceId);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const activeMergeOwner = getActiveWorktreeMerge(thread.workspaceId);
  if (
    activeMergeOwner?.id !== thread.id ||
    !(await threadOwnsActiveGitMerge(thread, ws.path))
  ) {
    return c.json(
      { error: "This thread does not own the workspace merge" },
      409,
    );
  }
  await abortMerge(ws.path);
  if (await isMergeInProgress(ws.path)) {
    return c.json({ error: "Git could not abort the active merge" }, 409);
  }
  setThreadWorktreeMergeInProgress(thread.id, false);
  return c.json({ ok: true });
});

export default threads;
