/**
 * In-memory registry of pending tool-approval requests.
 *
 * When the agent is about to run a gated tool, the approval bridge blocks on
 * `waitForApproval()` until the user responds in the UI; the
 * `/session/:id/tool-approval` route calls `submitApproval()` to resolve that
 * promise with the user's choice. Like the question registry, this lives only
 * in memory and is keyed by tool-call id (globally unique per agent run).
 */

/** The user's choice for a single tool-approval prompt. */
export type ApprovalDecision = "once" | "always" | "never";

interface PendingApproval {
  resolve: (decision: ApprovalDecision) => void;
}

const pending = new Map<string, PendingApproval>();

/** Treated as a block when the turn is aborted before the user responds. */
const ABORTED_DECISION: ApprovalDecision = "never";

/**
 * Register a pending approval and resolve once the user responds (or the agent
 * turn is aborted, which resolves as "never"). Safe to await inside the bridge.
 */
export function waitForApproval(
  toolCallId: string,
  signal?: AbortSignal,
): Promise<ApprovalDecision> {
  return new Promise<ApprovalDecision>((resolve) => {
    if (signal?.aborted) {
      resolve(ABORTED_DECISION);
      return;
    }

    const settle = (decision: ApprovalDecision) => {
      signal?.removeEventListener("abort", onAbort);
      pending.delete(toolCallId);
      resolve(decision);
    };

    const onAbort = () => settle(ABORTED_DECISION);

    pending.set(toolCallId, { resolve: settle });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolve a pending approval with the user's decision. Returns false if there
 * is no pending approval for the given tool-call id (e.g. already resolved or
 * aborted).
 */
export function submitApproval(
  toolCallId: string,
  decision: ApprovalDecision,
): boolean {
  const entry = pending.get(toolCallId);
  if (!entry) return false;
  entry.resolve(decision);
  return true;
}

export function hasPendingApproval(toolCallId: string): boolean {
  return pending.has(toolCallId);
}
