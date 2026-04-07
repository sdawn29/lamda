import { useQuery } from "@tanstack/react-query"
import { listMessages, type StoredMessageDto } from "@/api/workspaces"
import type { Message } from "@/components/chat-types"

function storedToMessage(m: StoredMessageDto): Message {
  if (m.role === "tool") {
    const data = JSON.parse(m.content) as {
      toolCallId: string
      toolName: string
      args: unknown
      result: unknown
      status: "running" | "done" | "error"
    }
    return {
      role: "tool",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      result: data.result,
      status: data.status,
    }
  }
  return { role: m.role as "user" | "assistant", content: m.content }
}

export const messagesQueryKey = (sessionId: string) =>
  ["messages", sessionId] as const

export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async () => {
      const { messages: stored } = await listMessages(sessionId)
      return stored.map(storedToMessage)
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!sessionId,
  })
}
