const ASSISTANT_MESSAGE_CONTENT_KIND = "lamda:assistant-message/v1"
const LEGACY_ASSISTANT_MESSAGE_CONTENT_KIND = "lambda:assistant-message/v1"

type StoredAssistantMessageContentKind =
  | typeof ASSISTANT_MESSAGE_CONTENT_KIND
  | typeof LEGACY_ASSISTANT_MESSAGE_CONTENT_KIND

interface StoredAssistantMessageContent {
  type: StoredAssistantMessageContentKind
  content: string
  thinking?: string
  model?: string
  provider?: string
  thinkingLevel?: string
  responseTime?: number
}

function isStoredAssistantMessageContent(
  value: unknown
): value is StoredAssistantMessageContent {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>
  return (
    (candidate.type === ASSISTANT_MESSAGE_CONTENT_KIND ||
      candidate.type === LEGACY_ASSISTANT_MESSAGE_CONTENT_KIND) &&
    typeof candidate.content === "string" &&
    (candidate.thinking === undefined || typeof candidate.thinking === "string") &&
    (candidate.model === undefined || typeof candidate.model === "string") &&
    (candidate.provider === undefined || typeof candidate.provider === "string") &&
    (candidate.thinkingLevel === undefined || typeof candidate.thinkingLevel === "string") &&
    (candidate.responseTime === undefined || typeof candidate.responseTime === "number")
  )
}

export interface UserMessage {
  role: "user"
  content: string
}

export interface AssistantMessage {
  role: "assistant"
  content: string
  thinking: string
  model?: string
  provider?: string
  thinkingLevel?: string
  responseTime?: number
}

export type TextMessage = UserMessage | AssistantMessage

export interface ToolMessage {
  role: "tool"
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "done" | "error"
  result?: unknown
}

export type Message = TextMessage | ToolMessage

export function createAssistantMessage(
  value: Partial<Pick<AssistantMessage, "content" | "thinking" | "model" | "provider" | "thinkingLevel" | "responseTime">> = {}
): AssistantMessage {
  return {
    role: "assistant",
    content: value.content ?? "",
    thinking: value.thinking ?? "",
    ...(value.model !== undefined ? { model: value.model } : {}),
    ...(value.provider !== undefined ? { provider: value.provider } : {}),
    ...(value.thinkingLevel !== undefined ? { thinkingLevel: value.thinkingLevel } : {}),
    ...(value.responseTime !== undefined ? { responseTime: value.responseTime } : {}),
  }
}

export function parseAssistantMessageContent(
  content: string
): Pick<AssistantMessage, "content" | "thinking" | "model" | "responseTime"> {
  try {
    const parsed = JSON.parse(content) as unknown
    if (isStoredAssistantMessageContent(parsed)) {
      return {
        content: parsed.content,
        thinking: parsed.thinking ?? "",
        model: parsed.model,
        provider: parsed.provider,
        thinkingLevel: parsed.thinkingLevel,
        responseTime: parsed.responseTime,
      }
    }
  } catch {
    return {
      content,
      thinking: "",
    }
  }

  return {
    content,
    thinking: "",
  }
}

export interface StoredMessageDto {
  id: string
  threadId: string
  role: "user" | "assistant" | "tool"
  content: string
  createdAt: number
}
