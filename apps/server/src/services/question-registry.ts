/**
 * In-memory registry of pending `question` tool calls.
 *
 * The question tool's `execute` blocks on `waitForAnswer()` until the user
 * responds in the UI; the `/session/:id/answer` route calls `submitAnswer()` to
 * resolve that promise with the user's selection. Like the session store, this
 * lives only in memory and is keyed by tool-call id (which is globally unique
 * per agent run).
 */

interface PendingQuestion {
  resolve: (answer: string) => void;
}

const pending = new Map<string, PendingQuestion>();

/** Sentinel returned to the agent when the turn is aborted before an answer. */
const ABORTED_ANSWER = "[The user dismissed the question without answering.]";

/**
 * Register a pending question and resolve once the user answers (or the agent
 * turn is aborted). Safe to await directly inside the tool's `execute`.
 */
export function waitForAnswer(
  toolCallId: string,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve) => {
    if (signal?.aborted) {
      resolve(ABORTED_ANSWER);
      return;
    }

    const settle = (answer: string) => {
      signal?.removeEventListener("abort", onAbort);
      pending.delete(toolCallId);
      resolve(answer);
    };

    const onAbort = () => settle(ABORTED_ANSWER);

    pending.set(toolCallId, { resolve: settle });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolve a pending question with the user's answer. Returns false if there is
 * no pending question for the given tool-call id (e.g. already answered or
 * aborted).
 */
export function submitAnswer(toolCallId: string, answer: string): boolean {
  const entry = pending.get(toolCallId);
  if (!entry) return false;
  entry.resolve(answer);
  return true;
}

export function hasPendingQuestion(toolCallId: string): boolean {
  return pending.has(toolCallId);
}
