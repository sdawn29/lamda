import { existsSync } from "node:fs";
import { clearThreadWorktree, listWorkspacesWithThreads } from "@lamda/db";
import { store } from "./store.js";
import { workspaceIndexer } from "./services/workspace-indexer.js";
import {
  createSessionForThread,
  openSessionForThread,
} from "./services/session-service.js";

/**
 * Recreate Pi sessions for every persisted thread on server startup.
 * Threads with a saved session_file are resumed (context restored);
 * threads without one get a fresh session.
 * Individual failures are logged but non-fatal — other sessions still work.
 */
export async function bootstrapSessions(): Promise<void> {
  const workspaceList = listWorkspacesWithThreads();

  const tasks = workspaceList.flatMap((ws) =>
    ws.threads.map(async (thread) => {
      // Run the thread in its worktree when one is attached and still on disk;
      // a worktree removed out-of-band is detached persistently so the renderer,
      // terminal, and next restart all agree on the same cwd.
      if (thread.worktreePath && !existsSync(thread.worktreePath)) {
        clearThreadWorktree(thread.id);
        thread.worktreePath = null;
        thread.worktreeBranch = null;
        thread.worktreeBaseBranch = null;
        thread.ownsWorktreeBranch = false;
        thread.worktreeMergeInProgress = false;
        thread.worktreeMergeHeadSha = null;
      }
      const cwd = thread.worktreePath ? thread.worktreePath : ws.path;

      if (thread.sessionFile) {
        try {
          const handle = await openSessionForThread(
            thread.id,
            thread.sessionFile,
            cwd,
            ws.id,
          );
          store.create(handle, cwd, thread.id, ws.id);
          return;
        } catch (err) {
          // A corrupt/unreadable session file must not leave a dead thread —
          // fall back to a fresh session so the thread stays usable.
          console.error(
            `[bootstrap] failed to resume thread ${thread.id}; starting fresh:`,
            err,
          );
        }
      }

      await createSessionForThread(thread.id, cwd, ws.id);
    }),
  );

  const results = await Promise.allSettled(tasks);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[bootstrap] session ${i} failed:`, r.reason);
    }
  });

  const total = results.length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (total > 0) {
    console.error(`[bootstrap] restored ${total - failed}/${total} sessions`);
  }

  // Start file indexing for all workspaces (non-blocking)
  for (const ws of workspaceList) {
    workspaceIndexer.startIndexing(ws.id, ws.path);
  }
}
