/**
 * Thread status aligned with PI SDK AgentState.isStreaming.
 *
 * - "streaming": agent is actively processing (isStreaming: true)
 * - "idle": agent is not running (isStreaming: false)
 * - "awaiting": agent is paused waiting for the user (a gated tool needs
 *   approval, or a `question` tool is awaiting an answer). The turn is still
 *   in progress; it resumes streaming once the user responds.
 * - "error": the turn ended in failure (a server error, or an agent_end whose
 *   final assistant message stopped with an error). Lets clients surface a
 *   notification for threads that errored while not in the foreground.
 */
export type ThreadStatus = "streaming" | "idle" | "awaiting" | "error";

/** Why a thread is awaiting the user — lets clients explain the prompt precisely. */
export type ThreadAwaitingReason = "approval" | "question";

/**
 * Optional context that explains a status to the user:
 * - `reason`: for "awaiting", whether a tool needs approval or a question was asked.
 * - `detail`: a short human-readable specific — the tool name (approval), the
 *   question text (question), or the error message (error).
 */
export interface ThreadStatusContext {
  reason?: ThreadAwaitingReason;
  detail?: string;
}

export type ThreadStatusEvent = {
  threadId: string;
  status: ThreadStatus;
} & ThreadStatusContext;

type Subscriber = (event: ThreadStatusEvent) => void;

class ThreadStatusBroadcaster {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  broadcast(
    threadId: string,
    status: ThreadStatus,
    context: ThreadStatusContext = {},
  ) {
    for (const fn of this.subscribers) {
      try {
        fn({ threadId, status, ...context });
      } catch {}
    }
  }
}

export const threadStatusBroadcaster = new ThreadStatusBroadcaster();
