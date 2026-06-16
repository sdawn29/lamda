/**
 * Thread status aligned with PI SDK AgentState.isStreaming.
 *
 * - "streaming": agent is actively processing (isStreaming: true)
 * - "idle": agent is not running (isStreaming: false)
 * - "awaiting": agent is paused waiting for the user (a gated tool needs
 *   approval, or a `question` tool is awaiting an answer). The turn is still
 *   in progress; it resumes streaming once the user responds.
 */
export type ThreadStatus = "streaming" | "idle" | "awaiting";

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
