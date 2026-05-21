import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  abortSession,
  generateTitle,
  sendPrompt,
  steer,
  followUp,
  revertToMessage,
  type SendPromptParams,
} from "./api"
import { messagesQueryKey } from "./queries"
import { gitKeys } from "@/features/git/queries"

// ── Send prompt ───────────────────────────────────────────────────────────────

export function useSendPrompt(sessionId: string) {
  // No onSuccess invalidation: the optimistic user message is already in the
  // cache and the WS stream is the canonical source of agent state. Invalidating
  // here would race with the optimistic write (DB may not yet contain the new
  // user message when the POST response returns) and briefly drop the row.
  return useMutation({
    mutationFn: (params: SendPromptParams) => sendPrompt(sessionId, params),
  })
}

// ── Steer ────────────────────────────────────────────────────────────────────

/**
 * Queue a steering message while the agent is running.
 * Delivered after the current assistant turn finishes its tool calls.
 */
export function useSteer(sessionId: string) {
  // WS stream handles the message delivery — no need to invalidate.
  return useMutation({
    mutationFn: (text: string) => steer(sessionId, text),
  })
}

// ── Follow-up ────────────────────────────────────────────────────────────────

/**
 * Queue a follow-up message to be processed after the agent finishes.
 * Only delivered when agent has no more tool calls or steering messages.
 */
export function useFollowUp(sessionId: string) {
  // WS stream handles the message delivery — no need to invalidate.
  return useMutation({
    mutationFn: (text: string) => followUp(sessionId, text),
  })
}

// ── Abort ───────────────────────────────────────────────────────────────────

export function useAbortSession(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => abortSession(sessionId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
  })
}

// ── Generate title ───────────────────────────────────────────────────────────

export function useGenerateTitle() {
  return useMutation({
    mutationFn: (message: string) => generateTitle(message),
  })
}

// ── Revert to message ────────────────────────────────────────────────────────

export function useRevertToMessage(
  sessionId: string,
  onSuccess?: (text: string) => void
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockId: string) => revertToMessage(sessionId, blockId),
    onSuccess: ({ text }) => {
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
      void queryClient.invalidateQueries({ queryKey: gitKeys.turns(sessionId) })
      void queryClient.invalidateQueries({ queryKey: gitKeys.status(sessionId) })
      void queryClient.invalidateQueries({ queryKey: gitKeys.diffStat(sessionId) })
      onSuccess?.(text)
    },
  })
}
