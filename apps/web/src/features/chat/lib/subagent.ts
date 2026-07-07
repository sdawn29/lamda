// Client mirror of the server's subagent transcript shapes — see
// apps/server/src/services/subagent-transcript.ts (keep in sync). A `task`
// tool call's partial result / final result carries the nested subagent run:
//   partialResult = { content: [], details: SubagentRunDetails }
//   result        = { content: [{type:"text",text}], details: SubagentRunDetails }

import type { Message, ToolMessage } from "../types"

export const TASK_TOOL_NAME = "task"

export type SubagentRunStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "aborted"

export type SubagentBlock =
  | { role: "assistant"; content: string; thinking: string }
  | {
      role: "tool"
      toolCallId: string
      toolName: string
      args: unknown
      status: "running" | "done" | "error"
      result?: unknown
      duration?: number
    }

export interface SubagentRunStats {
  toolCalls: number
  totalTokens: number
  cost: number
}

export interface SubagentRunDetails {
  kind: "subagent_run"
  /** Agent id (e.g. "explore"). */
  agent: string
  agentLabel: string
  color: string
  icon: string
  /** `provider::model` actually used, when known. */
  model?: string
  status: SubagentRunStatus
  startedAt: number
  endedAt?: number
  blocks: SubagentBlock[]
  truncated?: boolean
  errorMessage?: string
  stats?: SubagentRunStats
}

export function isTaskToolMessage(msg: ToolMessage): boolean {
  return msg.toolName.toLowerCase() === TASK_TOOL_NAME
}

/** The model-provided 3-7 word task summary from the task tool's args. */
export function taskDescription(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  const description = (args as { description?: unknown }).description
  return typeof description === "string" ? description : ""
}

/** The agent id from the task tool's args — the pre-transcript fallback label. */
export function taskAgentId(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  const agent = (args as { agent?: unknown }).agent
  return typeof agent === "string" ? agent : ""
}

/**
 * Effective run status for a `task` tool call. The nested run's own status is
 * authoritative (it distinguishes queued/aborted); before the first snapshot
 * arrives, fall back to the tool call's coarse status.
 */
export function subagentStatus(msg: ToolMessage): SubagentRunStatus {
  return (
    getSubagentDetails(msg)?.status ??
    (msg.status === "running"
      ? "running"
      : msg.status === "error"
        ? "error"
        : "done")
  )
}

function detailsFrom(value: unknown): SubagentRunDetails | null {
  if (!value || typeof value !== "object") return null
  const details = (value as { details?: unknown }).details
  if (!details || typeof details !== "object") return null
  if ((details as { kind?: unknown }).kind !== "subagent_run") return null
  return details as SubagentRunDetails
}

/**
 * Pull the nested run out of a `task` tool message. While running, the live
 * `partialResult` snapshot is freshest; a settled tool's final `result` wins
 * over any stale partial. A running block fetched from the DB (mid-run
 * refresh) carries its last snapshot in `result`, so that's the running
 * fallback.
 */
export function getSubagentDetails(
  msg: ToolMessage
): SubagentRunDetails | null {
  if (msg.status === "running") {
    return detailsFrom(msg.partialResult) ?? detailsFrom(msg.result)
  }
  return detailsFrom(msg.result) ?? detailsFrom(msg.partialResult)
}

/** Map the nested transcript into the chat's Message shapes for rendering. */
export function subagentBlocksToMessages(blocks: SubagentBlock[]): Message[] {
  return blocks.map((block): Message => {
    if (block.role === "assistant") {
      return {
        role: "assistant",
        content: block.content,
        thinking: block.thinking,
      }
    }
    return {
      role: "tool",
      toolCallId: block.toolCallId,
      toolName: block.toolName,
      args: block.args,
      status: block.status,
      result: block.result,
      duration: block.duration,
    }
  })
}

/**
 * One-line hint of what the subagent is doing right now: the trailing running
 * tool's name, else "thinking" while a reply streams.
 */
export function describeSubagentActivity(
  details: SubagentRunDetails
): string | null {
  for (let i = details.blocks.length - 1; i >= 0; i--) {
    const block = details.blocks[i]
    if (block.role === "tool" && block.status === "running") {
      return block.toolName
    }
  }
  const tail = details.blocks.at(-1)
  if (tail?.role === "assistant") {
    return tail.content.trim() ? "responding" : "thinking"
  }
  return null
}
