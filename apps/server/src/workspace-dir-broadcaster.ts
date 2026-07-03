import { Broadcaster } from "./lib/broadcaster.js";

// `root` is the absolute base directory the tree is rooted at — the workspace
// path for a local thread, or a git worktree path when the active thread runs
// in one. It's what the renderer keys its dir queries by, so worktree and
// workspace views of the same relative path stay distinct.
type DirChange = { workspaceId: string; root: string; dir: string };

/**
 * Broadcasts scoped "a single directory's immediate children changed" events.
 * Unlike the workspace-wide index broadcaster, this carries the specific
 * directory so the renderer can invalidate just that subtree's query.
 *
 * Composes the generic Broadcaster (rather than using it directly) so the
 * call site keeps its positional `broadcast(workspaceId, root, dir)` shape
 * instead of callers having to build the DirChange object themselves.
 */
class WorkspaceDirBroadcaster {
  private inner = new Broadcaster<[DirChange]>();

  subscribe(fn: (change: DirChange) => void): () => void {
    return this.inner.subscribe(fn);
  }

  broadcast(workspaceId: string, root: string, dir: string): void {
    this.inner.broadcast({ workspaceId, root, dir });
  }
}

export const workspaceDirBroadcaster = new WorkspaceDirBroadcaster();
