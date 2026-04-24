type Subscriber = (workspaceId: string) => void;

class WorkspaceIndexBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(workspaceId: string) {
    for (const fn of this.subscribers) {
      try {
        fn(workspaceId);
      } catch {}
    }
  }
}

export const workspaceIndexBroadcaster = new WorkspaceIndexBroadcaster();
