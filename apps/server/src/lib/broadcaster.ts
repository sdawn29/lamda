/**
 * Generic in-process pub/sub used by the various `*-broadcaster.ts` modules
 * to fan a server-side event out to every subscriber (typically one per
 * connected client). Each broadcaster module wraps this in its own typed
 * singleton — see git-status-broadcaster.ts for the simplest example, and
 * thread-status-broadcaster.ts for one that composes this internally to keep
 * a `broadcast(threadId, status, context)`-shaped call site while still
 * sharing this dispatch logic.
 */
export class Broadcaster<Args extends unknown[] = []> {
  private subscribers = new Set<(...args: Args) => void>();

  subscribe(fn: (...args: Args) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(...args: Args): void {
    for (const fn of this.subscribers) {
      try {
        fn(...args);
      } catch (err) {
        console.warn("[broadcaster] subscriber threw:", err);
      }
    }
  }
}
