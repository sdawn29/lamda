type DirChange = { workspaceId: string; dir: string };
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

  broadcast(workspaceId: string, dir: string) {
    for (const fn of this.subscribers) {
      try {
        fn({ workspaceId, dir });
      } catch {}
    }
  }
}

export const workspaceDirBroadcaster = new WorkspaceDirBroadcaster();
