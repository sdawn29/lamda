// `root` is the absolute base directory the tree is rooted at — the workspace
// path for a local thread, or a git worktree path when the active thread runs
// in one. It's what the renderer keys its dir queries by, so worktree and
// workspace views of the same relative path stay distinct.
type DirChange = { workspaceId: string; root: string; dir: string };
type Subscriber = (change: DirChange) => void;

/**
 * Broadcasts scoped "a single directory's immediate children changed" events.
 * Unlike the workspace-wide index broadcaster, this carries the specific
 * directory so the renderer can invalidate just that subtree's query.
 */
class WorkspaceDirBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(workspaceId: string, root: string, dir: string) {
    for (const fn of this.subscribers) {
      try {
        fn({ workspaceId, root, dir });
      } catch {}
    }
  }
}

export const workspaceDirBroadcaster = new WorkspaceDirBroadcaster();
