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

export interface SessionQueueUpdateEvent {
  steering: readonly string[];
  followUp: readonly string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionTurnStartEvent {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionTurnEndEvent {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionAgentStartEvent {}

export interface SessionAgentEndEvent {
  messages?: AgentEndMessage[];
}

export interface SessionAutoRetryStartEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

export interface SessionAutoRetryEndEvent {
  success: boolean;
  attempt: number;
  finalError?: string;
}

export interface SessionMessageEndEvent {
  message: unknown;
}

export interface SessionEventHandlers {
  onMessageStart: (event: SessionMessageStartEvent) => void;
  onMessageUpdate: (event: SessionMessageUpdateEvent) => void;
  onMessageEnd: (event: SessionMessageEndEvent) => void;
  onToolExecutionStart: (event: SessionToolExecutionStartEvent) => void;
  onToolExecutionUpdate: (event: SessionToolExecutionUpdateEvent) => void;
  onToolExecutionEnd: (event: SessionToolExecutionEndEvent) => void;
  onTurnStart: (event: SessionTurnStartEvent) => void;
  onTurnEnd: (event: SessionTurnEndEvent) => void;
  onAgentStart: (event: SessionAgentStartEvent) => void;
  onAgentEnd: (event: SessionAgentEndEvent) => void;
  onQueueUpdate: (event: SessionQueueUpdateEvent) => void;
  onAutoRetryStart: (event: SessionAutoRetryStartEvent) => void;
  onAutoRetryEnd: (event: SessionAutoRetryEndEvent) => void;
  onCompactionStart: (event: { reason: "manual" | "threshold" | "overflow" }) => void;
  onCompactionEnd: (event: {
    reason: "manual" | "threshold" | "overflow";
    aborted: boolean;
    willRetry: boolean;
    errorMessage?: string;
  }) => void;
  onServerError: (event: SessionServerErrorEvent) => void;
  onTransportError?: (event: Event) => void;
}

export interface SessionServerErrorEvent {
  message: string
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
    addJsonEventSourceListener<SessionMessageEndEvent>(
      eventSource,
      "message_end",
      handlers.onMessageEnd
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
    addJsonEventSourceListener<SessionTurnStartEvent>(
      eventSource,
      "turn_start",
      handlers.onTurnStart
    ),
    addJsonEventSourceListener<SessionTurnEndEvent>(
      eventSource,
      "turn_end",
      handlers.onTurnEnd
    ),
    addJsonEventSourceListener<SessionAgentStartEvent>(
      eventSource,
      "agent_start",
      handlers.onAgentStart
    ),
    addJsonEventSourceListener<SessionAgentEndEvent>(
      eventSource,
      "agent_end",
      handlers.onAgentEnd
    ),
    addJsonEventSourceListener<SessionQueueUpdateEvent>(
      eventSource,
      "queue_update",
      handlers.onQueueUpdate
    ),
    addJsonEventSourceListener<SessionAutoRetryStartEvent>(
      eventSource,
      "auto_retry_start",
      handlers.onAutoRetryStart
    ),
    addJsonEventSourceListener<SessionAutoRetryEndEvent>(
      eventSource,
      "auto_retry_end",
      handlers.onAutoRetryEnd
    ),
    addJsonEventSourceListener<{ reason: "manual" | "threshold" | "overflow" }>(
      eventSource,
      "compaction_start",
      handlers.onCompactionStart
    ),
    addJsonEventSourceListener<{
      reason: "manual" | "threshold" | "overflow";
      aborted: boolean;
      willRetry: boolean;
      errorMessage?: string;
    }>(
      eventSource,
      "compaction_end",
      handlers.onCompactionEnd
    ),
    addJsonEventSourceListener<SessionServerErrorEvent>(
      eventSource,
      "server_error",
      handlers.onServerError
    ),
  ];

  if (handlers.onTransportError) {
    cleanups.push(
      addEventSourceListener(eventSource, "error", handlers.onTransportError)
    );
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
