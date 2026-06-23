type Subscriber = () => void;

/**
 * Broadcasts "the set of prompt templates changed" — a prompt file was added,
 * edited, or removed in the global `~/.lamda/prompts` directory or a workspace's
 * local `.lamda/prompts`. The renderer refetches its slash-command lists in
 * response, so a freshly authored prompt is usable without a server restart.
 *
 * The event carries no payload: a change anywhere invalidates every mounted
 * command list. Command lists are keyed by session/workspace, and a global
 * prompt is visible to all of them, so scoping the signal wouldn't save work.
 */
class PromptsBroadcaster {
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

export const promptsBroadcaster = new PromptsBroadcaster();
