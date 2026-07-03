import { Broadcaster } from "./lib/broadcaster.js";

// Notifies the renderer when a thread's git worktree was removed out-of-band
// (external `git worktree remove`, manual delete, prune) and the server has
// auto-detached the thread back to its workspace directory. The UI uses it to
// refresh the worktree selector and any cwd-scoped views without a reload.
type WorktreeDetachedEvent = { workspaceId: string; threadId: string };

class WorktreeBroadcaster {
  private inner = new Broadcaster<[WorktreeDetachedEvent]>();

  subscribe(fn: (event: WorktreeDetachedEvent) => void): () => void {
    return this.inner.subscribe(fn);
  }

  broadcast(workspaceId: string, threadId: string): void {
    this.inner.broadcast({ workspaceId, threadId });
  }
}

export const worktreeBroadcaster = new WorktreeBroadcaster();
