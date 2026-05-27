/**
 * Thread status aligned with PI SDK AgentState.isStreaming.
 *
 * - "streaming": agent is actively processing (isStreaming: true)
 * - "idle": agent is not running (isStreaming: false)
 */
export type ThreadStatus = "streaming" | "idle";

export type ThreadStatusEvent = { threadId: string; status: ThreadStatus };

type Subscriber = (event: ThreadStatusEvent) => void;

class ThreadStatusBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(threadId: string, status: ThreadStatus) {
    for (const fn of this.subscribers) {
      try {
        fn({ threadId, status });
      } catch {}
    }
  }
}

export const threadStatusBroadcaster = new ThreadStatusBroadcaster();
