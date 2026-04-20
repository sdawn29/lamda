import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  abortSession,
  generateTitle,
  sendPrompt,
  steer,
  followUp,
  type SendPromptParams,
} from "./api"
import { messagesQueryKey } from "./queries"

// ── Send prompt ───────────────────────────────────────────────────────────────

export function useSendPrompt(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: SendPromptParams) => sendPrompt(sessionId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
  })
}

// ── Steer ────────────────────────────────────────────────────────────────────

/**
 * Queue a steering message while the agent is running.
 * Delivered after the current assistant turn finishes its tool calls.
 */
export function useSteer(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => steer(sessionId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
  })
}

// ── Follow-up ────────────────────────────────────────────────────────────────

/**
 * Queue a follow-up message to be processed after the agent finishes.
 * Only delivered when agent has no more tool calls or steering messages.
 */
export function useFollowUp(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => followUp(sessionId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
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
