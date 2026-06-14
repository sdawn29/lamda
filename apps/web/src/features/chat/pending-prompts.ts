/**
 * One-shot registry of sessions whose first prompt was just fired (from the
 * new-thread flow) but hasn't been confirmed running by the stream yet.
 *
 * The new-thread view sends the prompt in the background and navigates straight
 * to the thread view. Without this hint, `useChatStream` mounts with
 * isLoading=false and the working/thinking indicator only appears once the
 * WebSocket delivers agent_start — a visible gap on slow model starts. Marking
 * the session here lets the thread view show the working state immediately.
 *
 * Keyed by sessionId; consumed once by the thread view on mount.
 */
const pendingPromptSessions = new Set<string>()

export function markPendingPrompt(sessionId: string): void {
  pendingPromptSessions.add(sessionId)
}

export function hasPendingPrompt(sessionId: string): boolean {
  return pendingPromptSessions.has(sessionId)
}

export function clearPendingPrompt(sessionId: string): void {
  pendingPromptSessions.delete(sessionId)
}
