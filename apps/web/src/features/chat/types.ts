/**
 * Message types that mirror pi-agent's structure with all data fields.
 * This replaces the legacy string-based content parsing.
 */

// ── User Messages ─────────────────────────────────────────────────────────────

export interface UserMessage {
  role: "user"
  content: string
  createdAt?: number
}

// ── Assistant Messages ────────────────────────────────────────────────────────

export interface AssistantMessage {
  role: "assistant"
  content: string
  thinking: string
  model?: string
  provider?: string
  thinkingLevel?: string
  responseTime?: number
  errorMessage?: string
  createdAt?: number
}

export function createAssistantMessage(
  value: Partial<
    Pick<
      AssistantMessage,
      | "content"
      | "thinking"
      | "model"
      | "provider"
      | "thinkingLevel"
      | "responseTime"
      | "errorMessage"
    >
  > = {}
): AssistantMessage {
  return {
    role: "assistant",
    content: value.content ?? "",
    thinking: value.thinking ?? "",
    ...(value.model !== undefined ? { model: value.model } : {}),
    ...(value.provider !== undefined ? { provider: value.provider } : {}),
    ...(value.thinkingLevel !== undefined
      ? { thinkingLevel: value.thinkingLevel }
      : {}),
    ...(value.responseTime !== undefined
      ? { responseTime: value.responseTime }
      : {}),
    ...(value.errorMessage !== undefined
      ? { errorMessage: value.errorMessage }
      : {}),
  }
}

// ── Tool Messages ─────────────────────────────────────────────────────────────

export interface ToolMessage {
  role: "tool"
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "done" | "error"
  result?: unknown
  duration?: number
  startTime?: number
}

// ── Error Messages ────────────────────────────────────────────────────────────

export interface ErrorMessage {
  role: "error"
  id: string
  title: string
  message: string
  retryable?: boolean
  retryCount?: number
  action?: ErrorAction
}

export type ErrorAction =
  | { type: "retry"; prompt?: string }
  | { type: "continue" }
  | { type: "dismiss" }

export function createErrorMessage(
  title: string,
  message: string,
  options: { retryable?: boolean; retryCount?: number; action?: ErrorAction } = {}
): ErrorMessage {
  return {
    role: "error",
    id: crypto.randomUUID(),
    title,
    message,
    ...(options.retryable !== undefined ? { retryable: options.retryable } : {}),
    ...(options.retryCount !== undefined ? { retryCount: options.retryCount } : {}),
    ...(options.action !== undefined ? { action: options.action } : {}),
  }
}

// ── Abort Messages ─────────────────────────────────────────────────────────────

export interface AbortMessage {
  role: "abort"
  id: string
  createdAt?: number
}

// ── Union Type ─────────────────────────────────────────────────────────────────

export type Message = UserMessage | AssistantMessage | ToolMessage | ErrorMessage | AbortMessage

// ── Database Block Types ─────────────────────────────────────────────────────

/**
 * Complete message block as stored in the database.
 * This is the full structure that includes all data fields.
 */
export interface MessageBlock {
  id: string
  threadId: string
  blockIndex: number
  role: "user" | "assistant" | "tool" | "abort"
  content: string | null
  thinking: string | null
  model: string | null
  provider: string | null
  thinkingLevel: string | null
  responseTime: number | null
  errorMessage: string | null
  toolCallId: string | null
  toolName: string | null
  toolArgs: string | null
  toolResult: string | null
  toolStatus: "running" | "done" | "error" | null
  toolDuration: number | null
  toolStartTime: number | null
  createdAt: number
}

// ── Legacy Support ────────────────────────────────────────────────────────────

/**
 * Legacy message format for backward compatibility during migration.
 * @deprecated Use MessageBlock and the new message types instead.
 */
export interface StoredMessageDto {
  id: string
  threadId: string
  role: "user" | "assistant" | "tool"
  content: string
  createdAt: number
}

// ── Conversion Functions ──────────────────────────────────────────────────────

/**
 * Convert a database MessageBlock to a UI Message.
 * This handles the transformation from block storage to view format.
 */
export function blockToMessage(block: MessageBlock): Message {
  switch (block.role) {
    case "user":
      return {
        role: "user",
        content: block.content ?? "",
        createdAt: block.createdAt,
      }

    case "assistant":
      return {
        role: "assistant",
        content: block.content ?? "",
        thinking: block.thinking ?? "",
        model: block.model ?? undefined,
        provider: block.provider ?? undefined,
        thinkingLevel: block.thinkingLevel ?? undefined,
        responseTime: block.responseTime ?? undefined,
        errorMessage: block.errorMessage ?? undefined,
        createdAt: block.createdAt,
      }

    case "tool": {
      let result: unknown = undefined
      if (block.toolResult) {
        try {
          result = JSON.parse(block.toolResult)
        } catch {
          result = block.toolResult
        }
      }

      let args: unknown = undefined
      if (block.toolArgs) {
        try {
          args = JSON.parse(block.toolArgs)
        } catch {
          args = block.toolArgs
        }
      }

      return {
        role: "tool",
        toolCallId: block.toolCallId ?? "",
        toolName: block.toolName ?? "tool",
        args,
        status: block.toolStatus ?? "running",
        result,
        duration: block.toolDuration ?? undefined,
        startTime: block.toolStartTime ?? undefined,
      }
    }

    case "abort":
      return {
        role: "abort",
        id: block.id,
        createdAt: block.createdAt,
      }

    default:
      // Fallback for unknown roles
      return {
        role: "user",
        content: block.content ?? JSON.stringify(block),
        createdAt: block.createdAt,
      }
  }
}

/**
 * Convert an array of blocks to UI messages.
 */
export function blocksToMessages(blocks: MessageBlock[]): Message[] {
  return blocks.map(blockToMessage)
}
