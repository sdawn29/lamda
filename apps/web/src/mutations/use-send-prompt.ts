import { useMutation } from "@tanstack/react-query"
import { sendPrompt } from "@/api/sessions"

export function useSendPrompt(sessionId: string) {
  return useMutation({
    mutationFn: (text: string) => sendPrompt(sessionId, text),
  })
}
