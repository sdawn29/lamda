import type { SessionEvent } from "@lamda/pi-sdk";

// Shapes that ride inside the parent `delegate` tool call's streaming updates and
// final result:
//   tool_execution_update.partialResult = { content: [], details: SubagentRunDetails }
//   tool_execution_end.result           = { content: [{type:"text",text}], details: SubagentRunDetails }
// The web mirrors these in `features/chat/lib/subagent.ts` — keep them in sync.

export type SubagentRunStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "aborted";

/** Nested transcript entry — deliberately shaped like the web's Message variants. */
export type SubagentBlock =
  | { role: "assistant"; content: string; thinking: string }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      args: unknown;
      status: "running" | "done" | "error";
      /** `{ content, details }` — the same shape the web's ToolCallBlock reads. */
      result?: unknown;
      duration?: number;
    };

export interface SubagentRunStats {
  toolCalls: number;
  totalTokens: number;
  cost: number;
}

export interface SubagentRunDetails {
  /** Discriminator the web renderer checks before treating a tool as a subagent. */
  kind: "subagent_run";
  /** Agent id (e.g. "explore"). */
  agent: string;
  agentLabel: string;
  color: string;
  icon: string;
  /** `provider::model` actually used, when known. */
  model?: string;
  status: SubagentRunStatus;
  startedAt: number;
  endedAt?: number;
  blocks: SubagentBlock[];
  /** Caps were hit — middle blocks were elided, head + tail preserved. */
  truncated?: boolean;
  errorMessage?: string;
  stats: SubagentRunStats;
}

export interface SubagentRunInfo {
  agent: string;
  agentLabel: string;
  color: string;
  icon: string;
  model?: string;
}

/**
 * How urgently a consumed event should reach the client:
 * "eager" flushes immediately (nested tool start/end — the visible state
 * change), "throttle" batches (per-token text deltas), "ignore" changed nothing.
 */
export type SubagentUpdateHint = "eager" | "throttle" | "ignore";

/** Per-block text cap. Beyond this the block stops growing (marker appended). */
const MAX_BLOCK_TEXT = 16_384;
/** Nested tool results larger than this (JSON) drop their `details` payload. */
const MAX_RESULT_JSON = 16_384;
/** Total transcript block cap; middle blocks are elided beyond it. */
const MAX_BLOCKS = 300;
/** Blocks preserved at the head when the transcript is elided. */
const HEAD_BLOCKS = 20;

const TRUNCATION_MARKER = "\n… [truncated]";

function capText(existing: string, delta: string): string {
  if (existing.endsWith(TRUNCATION_MARKER)) return existing;
  if (existing.length + delta.length <= MAX_BLOCK_TEXT) return existing + delta;
  const room = Math.max(0, MAX_BLOCK_TEXT - existing.length);
  return existing + delta.slice(0, room) + TRUNCATION_MARKER;
}

/**
 * Bound a nested tool result before it enters the transcript: text content is
 * capped, inline images are dropped (base64 payloads would bloat every
 * snapshot), and oversized `details` are removed — the web's generic tool card
 * renders fine from text content alone.
 */
function trimToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { content?: unknown; details?: unknown };
  const content = Array.isArray(r.content)
    ? r.content.map((item) => {
        const it = item as { type?: string; text?: string };
        if (it?.type === "text" && typeof it.text === "string") {
          return { type: "text", text: capText("", it.text) };
        }
        if (it?.type === "image") {
          return { type: "text", text: "[image omitted from subagent transcript]" };
        }
        return item;
      })
    : r.content;
  let details = r.details;
  if (details !== undefined) {
    try {
      if (JSON.stringify(details).length > MAX_RESULT_JSON) details = undefined;
    } catch {
      details = undefined;
    }
  }
  return { content, details };
}

/**
 * Folds a subagent session's event stream into a bounded, serializable
 * transcript (`SubagentRunDetails`). Pure with respect to I/O — the runner owns
 * throttling, persistence, and the session lifecycle — so the fold logic is
 * unit-testable with synthetic events.
 */
export class SubagentTranscriptRecorder {
  private readonly details: SubagentRunDetails;
  private readonly toolStartTimes = new Map<string, number>();
  private lastAssistantError: string | undefined;

  constructor(info: SubagentRunInfo) {
    this.details = {
      kind: "subagent_run",
      agent: info.agent,
      agentLabel: info.agentLabel,
      color: info.color,
      icon: info.icon,
      model: info.model,
      status: "queued",
      startedAt: Date.now(),
      blocks: [],
      stats: { toolCalls: 0, totalTokens: 0, cost: 0 },
    };
  }

  get status(): SubagentRunStatus {
    return this.details.status;
  }

  /** Error reported by the model provider mid-run (assistant stopReason "error"). */
  get assistantError(): string | undefined {
    return this.lastAssistantError;
  }

  markRunning(): void {
    if (this.details.status === "queued") {
      this.details.status = "running";
      this.details.startedAt = Date.now();
    }
  }

  /** Settle the run. Terminal — later events no longer change the status. */
  finish(status: "done" | "error" | "aborted", errorMessage?: string): void {
    this.details.status = status;
    this.details.endedAt = Date.now();
    if (errorMessage) this.details.errorMessage = errorMessage;
    // A tool still marked running when the run settles was interrupted.
    for (const block of this.details.blocks) {
      if (block.role === "tool" && block.status === "running") {
        block.status = "error";
        block.result = {
          content: [{ type: "text", text: "Interrupted." }],
        };
      }
    }
  }

  /** Text of the last assistant block — the subagent's final report. */
  lastAssistantText(): string {
    for (let i = this.details.blocks.length - 1; i >= 0; i--) {
      const block = this.details.blocks[i];
      if (block.role === "assistant" && block.content.trim()) {
        return block.content;
      }
    }
    return "";
  }

  /**
   * Fold one session event into the transcript. Returns how urgently the
   * change should be surfaced to the client.
   */
  handleEvent(event: SessionEvent): SubagentUpdateHint {
    switch (event.type) {
      case "message_start": {
        const msg = event as { message?: { role?: string } };
        if (msg.message?.role !== "assistant") return "ignore";
        this.pushBlock({ role: "assistant", content: "", thinking: "" });
        return "throttle";
      }
      case "message_update": {
        const msg = event as {
          assistantMessageEvent?: { type: string; delta?: string };
        };
        const ev = msg.assistantMessageEvent;
        if (!ev || typeof ev.delta !== "string") return "ignore";
        const tail = this.details.blocks.at(-1);
        if (!tail || tail.role !== "assistant") return "ignore";
        if (ev.type === "text_delta") {
          tail.content = capText(tail.content, ev.delta);
          return "throttle";
        }
        if (ev.type === "thinking_delta") {
          tail.thinking = capText(tail.thinking, ev.delta);
          return "throttle";
        }
        return "ignore";
      }
      case "message_end": {
        const msg = event as {
          message?: {
            role?: string;
            stopReason?: string;
            errorMessage?: string;
            usage?: { totalTokens?: number; cost?: { total?: number } };
          };
        };
        const m = msg.message;
        if (m?.role !== "assistant") return "ignore";
        if (m.usage) {
          this.details.stats.totalTokens += m.usage.totalTokens ?? 0;
          this.details.stats.cost += m.usage.cost?.total ?? 0;
        }
        if (m.stopReason === "error" && m.errorMessage) {
          this.lastAssistantError = m.errorMessage;
        }
        return "throttle";
      }
      case "tool_execution_start": {
        const msg = event as {
          toolCallId: string;
          toolName: string;
          args: unknown;
        };
        this.details.stats.toolCalls += 1;
        this.toolStartTimes.set(msg.toolCallId, Date.now());
        this.pushBlock({
          role: "tool",
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          args: msg.args,
          status: "running",
        });
        return "eager";
      }
      case "tool_execution_end": {
        const msg = event as {
          toolCallId: string;
          result: unknown;
          isError: boolean;
        };
        const startedAt = this.toolStartTimes.get(msg.toolCallId);
        this.toolStartTimes.delete(msg.toolCallId);
        for (let i = this.details.blocks.length - 1; i >= 0; i--) {
          const block = this.details.blocks[i];
          if (block.role === "tool" && block.toolCallId === msg.toolCallId) {
            block.status = msg.isError ? "error" : "done";
            block.result = trimToolResult(msg.result);
            if (startedAt) block.duration = Date.now() - startedAt;
            break;
          }
        }
        return "eager";
      }
      default:
        return "ignore";
    }
  }

  /**
   * A serializable copy of the transcript with fresh object identities, so a
   * client that replaces `partialResult` by reference re-renders every time.
   */
  snapshot(): SubagentRunDetails {
    return structuredClone(this.details);
  }

  private pushBlock(block: SubagentBlock): void {
    this.details.blocks.push(block);
    // Elide the oldest middle block (head and tail stay) once over the cap. A
    // running tool block elided here would just ignore its later end event.
    if (this.details.blocks.length > MAX_BLOCKS) {
      this.details.blocks.splice(HEAD_BLOCKS, 1);
      this.details.truncated = true;
    }
  }
}
