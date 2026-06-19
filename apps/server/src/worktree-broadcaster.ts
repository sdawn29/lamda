// Notifies the renderer when a thread's git worktree was removed out-of-band
// (external `git worktree remove`, manual delete, prune) and the server has
// auto-detached the thread back to its workspace directory. The UI uses it to
// refresh the worktree selector and any cwd-scoped views without a reload.
type WorktreeDetachedEvent = { workspaceId: string; threadId: string };
type Subscriber = (event: WorktreeDetachedEvent) => void;

class WorktreeBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(workspaceId: string, threadId: string) {
    for (const fn of this.subscribers) {
      try {
        fn({ workspaceId, threadId });
      } catch {}
    }
  }
}

export const worktreeBroadcaster = new WorktreeBroadcaster();
