import { Hono } from "hono";
import {
  getThread,
  getWorkspace,
  listCheckpointsByThread,
  getCheckpoint,
  insertCheckpoint,
} from "@lamda/db";
import {
  createShadowSnapshot,
  restoreShadowSnapshot,
  threadCheckpointRefName,
} from "@lamda/git";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { gitStatusBroadcaster } from "../git-status-broadcaster.js";
import { parseGitError } from "./git.js";

const checkpoints = new Hono();

/** The thread's effective working directory: its worktree when it runs in
 * one, else the workspace's own path. Prefers the live session's cwd (kept
 * in sync by session-service) since it's the same directory the agent is
 * actually running in. */
function resolveThreadCwd(
  thread: NonNullable<ReturnType<typeof getThread>>,
): string | null {
  const live = store.getByThreadId(thread.id);
  if (live) {
    const entry = store.get(live.sessionId);
    if (entry?.cwd) return entry.cwd;
  }
  if (thread.worktreePath) return thread.worktreePath;
  return getWorkspace(thread.workspaceId)?.path ?? null;
}

checkpoints.get("/thread/:threadId/checkpoints", (c) => {
  const threadId = c.req.param("threadId");
  if (!getThread(threadId)) return c.json({ error: "Thread not found" }, 404);
  return c.json({ checkpoints: listCheckpointsByThread(threadId) });
});

checkpoints.post(
  "/thread/:threadId/checkpoints/:checkpointId/restore",
  async (c) => {
    const threadId = c.req.param("threadId");
    const checkpointId = c.req.param("checkpointId");

    const thread = getThread(threadId);
    if (!thread) return c.json({ error: "Thread not found" }, 404);

    const checkpoint = getCheckpoint(checkpointId);
    if (!checkpoint || checkpoint.threadId !== threadId) {
      return c.json({ error: "Checkpoint not found" }, 404);
    }

    // Reject while the agent is mid-turn — restoring under it out from under a
    // running turn would race with whatever the agent is currently writing.
    const live = store.getByThreadId(threadId);
    if (live && sessionEvents.getStatus(live.sessionId).isRunning) {
      return c.json(
        { error: "Cannot restore while the agent is running" },
        409,
      );
    }

    const cwd = resolveThreadCwd(thread);
    if (!cwd) return c.json({ error: "Workspace not found" }, 404);

    // Snapshot the current state first, so the restore itself is undoable.
    // Returned to the client so the UI can offer an immediate "Undo" that
    // restores this safety checkpoint (it never anchors to a user message,
    // so the transcript's hover actions can't reach it otherwise).
    const safetySha = await createShadowSnapshot(
      cwd,
      threadCheckpointRefName(threadId),
    );
    const safetyCheckpoint = safetySha
      ? insertCheckpoint({
          threadId,
          commitSha: safetySha,
          label: "Before restore",
        })
      : null;

    try {
      await restoreShadowSnapshot(cwd, checkpoint.commitSha);
    } catch (err) {
      return c.json(
        { error: parseGitError(err, "Failed to restore checkpoint") },
        500,
      );
    }

    gitStatusBroadcaster.broadcast(thread.workspaceId);

    return c.json({
      checkpoints: listCheckpointsByThread(threadId),
      safetyCheckpoint,
    });
  },
);

export default checkpoints;
