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

export interface SessionTurnFileChangedEvent {
  filePath: string;
  postStatusCode: string;
  wasCreatedByTurn: boolean;
}

export interface SessionPlanSavedEvent {
  /** Absolute path on the server's filesystem. */
  filePath: string;
  /** Workspace-relative forward-slash path (always starts with `.lamda/plans/`). */
  relativePath: string;
}

export interface SessionAgentEndEvent {
  messages?: AgentEndMessage[];
}

export interface SessionToolApprovalRequestEvent {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** What an Always/Don't-allow decision will remember (e.g. `git status`). */
  scopeLabel: string;
}

export interface SessionToolApprovalResolvedEvent {
  toolCallId: string;
  decision: "once" | "always" | "never" | "reject";
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
  onTurnFileChanged?: (event: SessionTurnFileChangedEvent) => void;
  onPlanSaved?: (event: SessionPlanSavedEvent) => void;
  onToolApprovalRequest?: (event: SessionToolApprovalRequestEvent) => void;
  onToolApprovalResolved?: (event: SessionToolApprovalResolvedEvent) => void;
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
  /** Called with the numeric event id from each server message, for lastEventId tracking. */
  onEventId?: (id: string) => void;
}

export interface SessionServerErrorEvent {
  message: string
}

export function subscribeToSessionEvents(
  ws: WebSocket,
  handlers: SessionEventHandlers
) {
  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as { type: string; id?: number } & Record<string, unknown>
      if (data.id !== undefined) {
        handlers.onEventId?.(String(data.id))
      }
      switch (data.type) {
        case "message_start":
          handlers.onMessageStart(data as SessionMessageStartEvent)
          break
        case "message_update":
          handlers.onMessageUpdate(data as SessionMessageUpdateEvent)
          break
        case "message_end":
          handlers.onMessageEnd(data as unknown as SessionMessageEndEvent)
          break
        case "tool_execution_start":
          handlers.onToolExecutionStart(data as unknown as SessionToolExecutionStartEvent)
          break
        case "tool_execution_update":
          handlers.onToolExecutionUpdate(data as unknown as SessionToolExecutionUpdateEvent)
          break
        case "tool_execution_end":
          handlers.onToolExecutionEnd(data as unknown as SessionToolExecutionEndEvent)
          break
        case "turn_start":
          handlers.onTurnStart(data as unknown as SessionTurnStartEvent)
          break
        case "turn_end":
          handlers.onTurnEnd(data as unknown as SessionTurnEndEvent)
          break
        case "agent_start":
          handlers.onAgentStart(data as unknown as SessionAgentStartEvent)
          break
        case "agent_end":
          handlers.onAgentEnd(data as unknown as SessionAgentEndEvent)
          break
        case "turn_file_changed":
          handlers.onTurnFileChanged?.(data as unknown as SessionTurnFileChangedEvent)
          break
        case "plan_saved":
          handlers.onPlanSaved?.(data as unknown as SessionPlanSavedEvent)
          break
        case "tool_approval_request":
          handlers.onToolApprovalRequest?.(data as unknown as SessionToolApprovalRequestEvent)
          break
        case "tool_approval_resolved":
          handlers.onToolApprovalResolved?.(data as unknown as SessionToolApprovalResolvedEvent)
          break
        case "queue_update":
          handlers.onQueueUpdate(data as unknown as SessionQueueUpdateEvent)
          break
        case "auto_retry_start":
          handlers.onAutoRetryStart(data as unknown as SessionAutoRetryStartEvent)
          break
        case "auto_retry_end":
          handlers.onAutoRetryEnd(data as unknown as SessionAutoRetryEndEvent)
          break
        case "compaction_start":
          handlers.onCompactionStart(data as unknown as { reason: "manual" | "threshold" | "overflow" })
          break
        case "compaction_end":
          handlers.onCompactionEnd(data as unknown as {
            reason: "manual" | "threshold" | "overflow"
            aborted: boolean
            willRetry: boolean
            errorMessage?: string
          })
          break
        case "server_error":
          handlers.onServerError(data as unknown as SessionServerErrorEvent)
          break
      }
    } catch (error) {
      console.error("[ws:session]", error)
    }
  }

  // Unclean close (network drop, server crash) — fire transport error only if the
  // WebSocket was terminated without a proper close handshake.  Clean closes
  // (code 1000, e.g. from our own cleanup calling ws.close()) set wasClean=true
  // and are silently ignored here; the doneFlag guard in the handler catches any
  // edge cases.
  const handleClose = (event: CloseEvent) => {
    if (!event.wasClean) {
      handlers.onTransportError?.(event)
    }
  }

  ws.addEventListener("message", handleMessage)
  ws.addEventListener("close", handleClose)

  if (handlers.onTransportError) {
    ws.addEventListener("error", handlers.onTransportError)
  }

  return () => {
    ws.removeEventListener("message", handleMessage)
    ws.removeEventListener("close", handleClose)
    if (handlers.onTransportError) {
      ws.removeEventListener("error", handlers.onTransportError)
    }
  }
}
