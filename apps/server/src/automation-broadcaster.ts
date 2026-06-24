type Subscriber = () => void;

/**
 * Broadcasts "the set of automations changed" — one was created, edited,
 * deleted, or a scheduled/manual run started or finished (which may also create
 * a new thread). The renderer refetches the automations list, their run
 * histories, and the workspace/thread tree in response.
 *
 * The event carries no payload: changes are infrequent and the affected queries
 * are cheap to refetch, so a single global signal keeps every client in sync
 * without per-client bookkeeping.
 */
class AutomationBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch {}
    }
  }
}

export const automationBroadcaster = new AutomationBroadcaster();
