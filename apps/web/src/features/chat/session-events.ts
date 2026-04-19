import {
  addEventSourceListener,
  addJsonEventSourceListener,
} from "@/shared/lib/sse"

export type AgentEndMessage =
  | {
      role: "assistant"
      stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted"
      errorMessage?: string
    }
  | {
      role: "toolResult"
      toolCallId: string
      toolName: string
      content: {
        type: string
        text?: string
        data?: string
        mimeType?: string
      }[]
      details?: unknown
      isError: boolean
    }
  | {
      role: string
      [key: string]: unknown
    }

export interface SessionMessageStartEvent {
  message?: { role?: string }
}

export interface SessionMessageUpdateEvent {
  assistantMessageEvent?: { type: string; delta?: string; partial?: { model?: string; provider?: string } }
}

export interface SessionToolExecutionStartEvent {
  toolCallId: string
  toolName: string
  args: unknown
}

export interface SessionToolExecutionUpdateEvent {
  toolCallId: string
  toolName?: string
  args?: unknown
  partialResult: unknown
}

export interface SessionToolExecutionEndEvent {
  toolCallId: string
  toolName?: string
  result: unknown
  isError: boolean
}

export interface SessionAgentEndEvent {
  messages?: AgentEndMessage[]
}

export interface SessionSdkErrorEvent {
  message: string
}

export interface SessionEventHandlers {
  onMessageStart: (event: SessionMessageStartEvent) => void
  onMessageUpdate: (event: SessionMessageUpdateEvent) => void
  onToolExecutionStart: (event: SessionToolExecutionStartEvent) => void
  onToolExecutionUpdate: (event: SessionToolExecutionUpdateEvent) => void
  onToolExecutionEnd: (event: SessionToolExecutionEndEvent) => void
  onAgentEnd: (event: SessionAgentEndEvent) => void
  onCompactionStart: () => void
  onCompactionEnd: () => void
  onSdkError: (event: SessionSdkErrorEvent) => void
  onTransportError?: (event: Event) => void
}

export function subscribeToSessionEvents(
  eventSource: EventSource,
  handlers: SessionEventHandlers
) {
  const cleanups = [
    addJsonEventSourceListener<SessionMessageStartEvent>(
      eventSource,
      "message_start",
      handlers.onMessageStart
    ),
    addJsonEventSourceListener<SessionMessageUpdateEvent>(
      eventSource,
      "message_update",
      handlers.onMessageUpdate
    ),
    addJsonEventSourceListener<SessionToolExecutionStartEvent>(
      eventSource,
      "tool_execution_start",
      handlers.onToolExecutionStart
    ),
    addJsonEventSourceListener<SessionToolExecutionUpdateEvent>(
      eventSource,
      "tool_execution_update",
      handlers.onToolExecutionUpdate
    ),
    addJsonEventSourceListener<SessionToolExecutionEndEvent>(
      eventSource,
      "tool_execution_end",
      handlers.onToolExecutionEnd
    ),
    addJsonEventSourceListener<SessionAgentEndEvent>(
      eventSource,
      "agent_end",
      handlers.onAgentEnd
    ),
    addEventSourceListener(eventSource, "compaction_start", () => {
      handlers.onCompactionStart()
    }),
    addEventSourceListener(eventSource, "compaction_end", () => {
      handlers.onCompactionEnd()
    }),
    addJsonEventSourceListener<SessionSdkErrorEvent>(
      eventSource,
      "sdk_error",
      handlers.onSdkError
    ),
  ]

  if (handlers.onTransportError) {
    cleanups.push(
      addEventSourceListener(eventSource, "error", handlers.onTransportError)
    )
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}
