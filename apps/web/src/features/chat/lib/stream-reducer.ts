// Pure state-transition logic for the session WebSocket event stream.
//
// Extracted from use-session-stream.ts so it can be unit tested without
// pulling in React/DOM — every export here is a pure function operating on
// plain arrays and objects. use-session-stream.ts imports from this file and
// owns all the side-effecting glue (WebSocket, refs, React state).

import { createAssistantMessage, parseErrorMessage } from "../types"
import type {
  AssistantMessage,
  Message,
  ToolMessage,
  UserMessage,
} from "../types"
import type { AgentEndMessage } from "../session-events"
import type { SubagentRunDetails } from "./subagent"

export interface TurnMeta {
  startTime: number
  model?: string
  provider?: string
  thinkingLevel?: string
}

export function upsertToolMessage(
  prev: Message[],
  toolCallId: string,
  updater: (existing?: ToolMessage) => ToolMessage
): Message[] {
  const index = prev.findIndex(
    (msg) => msg.role === "tool" && msg.toolCallId === toolCallId
  )
  if (index === -1) return [...prev, updater()]
  return [
    ...prev.slice(0, index),
    updater(prev[index] as ToolMessage),
    ...prev.slice(index + 1),
  ]
}

export function mergeRunningTools(
  messages: Message[],
  runningTools: Message[]
): Message[] {
  if (runningTools.length === 0) return messages

  // Check ALL existing tool messages regardless of status — not just running ones.
  // The async listRunningTools fetch in onAgentStart can resolve after tool_start +
  // tool_end have already been processed (completing the tool). Filtering only for
  // status === "running" would miss the completed entry and insert a duplicate.
  const existingIds = new Set(
    messages
      .filter((m): m is ToolMessage => m.role === "tool")
      .map((m) => m.toolCallId)
  )

  const newTools = runningTools.filter(
    (m): m is ToolMessage => m.role === "tool" && !existingIds.has(m.toolCallId)
  )

  if (newTools.length === 0) return messages

  const lastAssistantIdx = messages.reduceRight(
    (found, msg, i) => (found === -1 && msg.role === "assistant" ? i : found),
    -1
  )

  if (lastAssistantIdx === -1) return [...messages, ...newTools]

  const insertIdx = lastAssistantIdx + 1
  return [
    ...messages.slice(0, insertIdx),
    ...newTools,
    ...messages.slice(insertIdx),
  ]
}

export function appendAssistantDelta(
  prev: Message[],
  type: "text_delta" | "thinking_delta",
  delta: string
): Message[] {
  const last = prev[prev.length - 1]
  if (last?.role !== "assistant") {
    return [
      ...prev,
      type === "thinking_delta"
        ? createAssistantMessage({ thinking: delta })
        : createAssistantMessage({ content: delta }),
    ]
  }
  if (type === "thinking_delta") {
    return [...prev.slice(0, -1), { ...last, thinking: last.thinking + delta }]
  }
  return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
}

export function finalizeRunningTools(
  prev: Message[],
  runMessages: AgentEndMessage[]
): Message[] {
  const toolResults = new Map(
    runMessages
      .filter(
        (msg): msg is Extract<AgentEndMessage, { role: "toolResult" }> =>
          msg.role === "toolResult"
      )
      .map((msg) => [msg.toolCallId, msg])
  )

  const assistantFailure = [...runMessages]
    .reverse()
    .find(
      (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
        msg.role === "assistant" &&
        (msg.stopReason === "aborted" || msg.stopReason === "error")
    )

  const fallbackError = assistantFailure?.errorMessage
    ? assistantFailure.errorMessage
    : assistantFailure?.stopReason === "aborted"
      ? "Operation aborted"
      : "Tool execution ended without a final result."

  return prev.map((msg) => {
    if (msg.role !== "tool" || msg.status !== "running") return msg
    const result = toolResults.get(msg.toolCallId)
    if (result) {
      const duration = msg.startTime ? Date.now() - msg.startTime : msg.duration
      return {
        ...msg,
        toolName: result.toolName || msg.toolName,
        status: result.isError ? "error" : "done",
        result: { content: result.content, details: result.details },
        duration,
      }
    }
    // A subagent (task tool) whose parent turn ended without a result was
    // interrupted mid-run: settle its streamed transcript as aborted so the
    // card renders the partial run instead of a bare error line.
    const partialDetails = (
      msg.partialResult as { details?: SubagentRunDetails } | undefined
    )?.details
    if (partialDetails?.kind === "subagent_run") {
      return {
        ...msg,
        status: "error",
        result: {
          content: [{ type: "text", text: fallbackError }],
          details: {
            ...partialDetails,
            status:
              partialDetails.status === "done" ? "done" : ("aborted" as const),
            endedAt: partialDetails.endedAt ?? Date.now(),
          },
        },
        duration:
          msg.duration ??
          (msg.startTime ? Date.now() - msg.startTime : undefined),
      }
    }
    return {
      ...msg,
      status: "error",
      result: msg.result ?? {
        content: [{ type: "text", text: fallbackError }],
      },
      duration:
        msg.duration ??
        (msg.startTime ? Date.now() - msg.startTime : undefined),
    }
  })
}

export function findLastAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return i
  }
  return -1
}

// ── Queue event types ─────────────────────────────────────────────────────────
//
// Every WebSocket event is normalized into one of these before entering the
// queue. The queue is drained once per animation frame, applying all events
// in arrival order as pure transforms on the messages array, then issuing a
// single setQueryData call and firing side-effects.

export type QueuedEvent =
  | { kind: "agent_start"; runningTools: ToolMessage[] }
  | { kind: "message_start"; replayed?: boolean }
  | { kind: "text_delta"; delta: string }
  | { kind: "thinking_delta"; delta: string }
  | {
      kind: "tool_start"
      toolCallId: string
      toolName: string
      args: unknown
      startTime: number
    }
  | {
      kind: "tool_update"
      toolCallId: string
      toolName?: string
      args?: unknown
      partialResult: unknown
    }
  | {
      kind: "tool_end"
      toolCallId: string
      toolName?: string
      status: "done" | "error"
      result: unknown
      duration?: number
    }
  | {
      kind: "agent_end"
      agentMessages: AgentEndMessage[]
      meta: TurnMeta | null
    }
  | { kind: "auto_retry_start"; attempt: number; errorMessage: string }
  | {
      kind: "auto_retry_end"
      success: boolean
      finalError?: string
      lastPrompt: { text: string; thinkingLevel?: string } | null
    }
  | { kind: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | {
      kind: "compaction_end"
      reason: "manual" | "threshold" | "overflow"
      errorMessage?: string
      aborted?: boolean
      willRetry?: boolean
    }
  | {
      kind: "server_error"
      message: string
      lastPrompt: { text: string; thinkingLevel?: string } | null
    }
  | {
      kind: "transport_error"
      lastPrompt: { text: string; thinkingLevel?: string } | null
    }

// Pure state transition — no side effects allowed here.
export function applyQueuedEvent(
  msgs: Message[],
  event: QueuedEvent
): Message[] {
  switch (event.kind) {
    case "agent_start":
      return mergeRunningTools(msgs, event.runningTools)

    case "message_start": {
      if (!event.replayed) return [...msgs, createAssistantMessage()]
      // Replayed start of the in-flight assistant message: a fresh WS connect
      // during a run gets the whole current message replayed by the server, so
      // the transcript may already hold that message's rows — streamed on a
      // previous mount (thread switch away and back mid-turn) or fetched as
      // partially-persisted blocks. Drop the trailing assistant row (and the
      // tool rows that followed it, which the replay also rebuilds) so the
      // replay replaces the block instead of appending a duplicate answer.
      let end = msgs.length
      while (end > 0 && msgs[end - 1].role === "tool") end--
      const base =
        end > 0 && msgs[end - 1].role === "assistant"
          ? msgs.slice(0, end - 1)
          : msgs
      return [...base, createAssistantMessage()]
    }

    case "text_delta":
      return appendAssistantDelta(msgs, "text_delta", event.delta)

    case "thinking_delta":
      return appendAssistantDelta(msgs, "thinking_delta", event.delta)

    case "tool_start":
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: event.args ?? existing?.args ?? {},
        status: "running" as const,
        result: existing?.result,
        partialResult: existing?.partialResult,
        duration: existing?.duration,
        startTime: event.startTime,
      }))

    case "tool_update":
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: event.args ?? existing?.args ?? {},
        status: "running" as const,
        result: existing?.result,
        partialResult: event.partialResult,
        duration: existing?.duration,
        startTime: existing?.startTime,
      }))

    case "tool_end": {
      // If agent_end's finalizeRunningTools already settled this tool,
      // skip — applying tool_end on top would cause a spurious re-render.
      const alreadyFinalized = msgs.some(
        (m) =>
          m.role === "tool" &&
          (m as ToolMessage).toolCallId === event.toolCallId &&
          (m as ToolMessage).status !== "running"
      )
      if (alreadyFinalized) return msgs
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: existing?.args ?? {},
        status: event.status,
        result: event.result,
        partialResult: existing?.partialResult,
        duration: event.duration,
        startTime: existing?.startTime,
      }))
    }

    case "compaction_end": {
      if (!event.errorMessage && !event.aborted) {
        return [
          ...msgs,
          {
            role: "compaction" as const,
            id: crypto.randomUUID(),
            reason: event.reason,
            createdAt: Date.now(),
          },
        ]
      }
      return msgs
    }

    case "agent_end": {
      let result = finalizeRunningTools(msgs, event.agentMessages)
      const { meta } = event

      if (meta) {
        const lastIdx = findLastAssistantIndex(result)
        if (lastIdx !== -1) {
          const last = result[lastIdx] as AssistantMessage
          result = [
            ...result.slice(0, lastIdx),
            {
              ...last,
              model: meta.model,
              provider: meta.provider,
              thinkingLevel: meta.thinkingLevel,
              responseTime: Date.now() - meta.startTime,
            },
            ...result.slice(lastIdx + 1),
          ]
        }
      }

      const assistantError = [...event.agentMessages]
        .reverse()
        .find(
          (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
            msg.role === "assistant" &&
            msg.stopReason === "error" &&
            !!msg.errorMessage
        )

      if (assistantError?.errorMessage) {
        const errorText = parseErrorMessage(assistantError.errorMessage)
        const lastIdx = findLastAssistantIndex(result)
        if (lastIdx !== -1) {
          const last = result[lastIdx] as AssistantMessage
          result = [
            ...result.slice(0, lastIdx),
            { ...last, errorMessage: errorText },
            ...result.slice(lastIdx + 1),
          ]
        } else {
          result = [
            ...result,
            createAssistantMessage({ errorMessage: errorText }),
          ]
        }
      }

      return result
    }

    // Side-effect-only events — messages state unchanged.
    default:
      return msgs
  }
}

// ── Post-turn optimistic reconciliation ───────────────────────────────────────
//
// After a turn ends, use-chat-stream.ts refetches the server's persisted
// messages and swaps each optimistic (id-less) user row for its persisted
// counterpart, so fork/revert block ids appear without remounting the row.
//
// Matches primarily by clientId — a stable identity carried from the
// optimistic row all the way through the send request to the persisted DB
// block. Content is only a fallback, for rows sent before clientId threading
// existed on that path: matching by content alone collapses two identical
// messages (e.g. steering "continue" twice) onto the same persisted row.

/** Builds a MessageBlock/UserMessage clientId → row lookup for reconciliation. */
export function reconcileOptimisticUserMessages(
  msgs: Message[],
  serverMessages: Message[]
): Message[] {
  const serverUserByClientId = new Map<string, UserMessage>()
  const serverUserByContent = new Map<string, UserMessage>()
  for (const m of serverMessages) {
    if (m.role === "user" && m.id) {
      if (m.clientId) serverUserByClientId.set(m.clientId, m)
      else serverUserByContent.set(m.content, m)
    }
  }
  if (serverUserByClientId.size === 0 && serverUserByContent.size === 0) {
    return msgs
  }

  return msgs.map((msg): Message => {
    if (msg.role !== "user" || msg.id) return msg
    const persisted =
      (msg.clientId && serverUserByClientId.get(msg.clientId)) ||
      serverUserByContent.get(msg.content)
    // Carry the optimistic row's clientId onto the persisted row so its React
    // key stays constant — the row reconciles in place (gaining its
    // id/createdAt) instead of remounting.
    return persisted ? { ...persisted, clientId: msg.clientId } : msg
  })
}
