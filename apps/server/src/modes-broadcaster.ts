type Subscriber = () => void;

/**
 * Broadcasts "the set of available modes changed" — a mode file was added,
 * edited, or removed in the global `~/.lamda/modes` directory or a workspace's
 * local `.lamda/modes`. The renderer refetches its mode pickers in response.
 *
 * The event carries no payload: a change anywhere invalidates every mounted
 * picker. Mode lists are keyed by workspace, and a global mode is visible to all
 * of them, so scoping the signal wouldn't save meaningful work.
 */
class ModesBroadcaster {
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

export const modesBroadcaster = new ModesBroadcaster();
