import { useMutation, useQueryClient } from "@tanstack/react-query"
import { abortSession, generateTitle, sendPrompt } from "./api"
import { messagesQueryKey } from "./queries"

// ── Send prompt ───────────────────────────────────────────────────────────────

interface SendPromptVars {
  text: string
  model?: { provider: string; modelId: string }
  thinkingLevel?: string
}

export function useSendPrompt(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ text, model, thinkingLevel }: SendPromptVars) =>
      sendPrompt(sessionId, text, model, thinkingLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
  })
}

export function useAbortSession(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => abortSession(sessionId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
    },
  })
}

// ── Generate title ────────────────────────────────────────────────────────────

export function useGenerateTitle() {
  return useMutation({
    mutationFn: (message: string) => generateTitle(message),
  })
}
