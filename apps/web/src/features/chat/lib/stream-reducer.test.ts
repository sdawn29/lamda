import { describe, it, expect } from "vitest"
import {
  applyQueuedEvent,
  finalizeRunningTools,
  mergeRunningTools,
  reconcileOptimisticUserMessages,
  type QueuedEvent,
} from "./stream-reducer"
import type {
  AssistantMessage,
  Message,
  ToolMessage,
  UserMessage,
} from "../types"
import type { AgentEndMessage } from "../session-events"

function assistant(
  overrides: Partial<AssistantMessage> = {}
): AssistantMessage {
  return {
    role: "assistant",
    content: "",
    thinking: "",
    ...overrides,
  }
}

function tool(overrides: Partial<ToolMessage> = {}): ToolMessage {
  return {
    role: "tool",
    toolCallId: "call-1",
    toolName: "read",
    args: {},
    status: "running",
    ...overrides,
  }
}

describe("applyQueuedEvent", () => {
  it("message_start appends a fresh assistant message", () => {
    const result = applyQueuedEvent([], { kind: "message_start" })
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe("assistant")
  })

  it("live message_start keeps a completed trailing assistant message", () => {
    const start: Message[] = [assistant({ content: "done thinking" })]
    const result = applyQueuedEvent(start, { kind: "message_start" })
    expect(result).toHaveLength(2)
    expect((result[0] as AssistantMessage).content).toBe("done thinking")
  })

  it("replayed message_start replaces the stale trailing assistant row", () => {
    const start: Message[] = [
      { role: "user", content: "hi" },
      assistant({ content: "stale partial answer" }),
    ]
    const result = applyQueuedEvent(start, {
      kind: "message_start",
      replayed: true,
    })
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe("user")
    expect((result[1] as AssistantMessage).content).toBe("")
  })

  it("replayed message_start drops the stale assistant row and its tool rows", () => {
    const start: Message[] = [
      { role: "user", content: "hi" },
      assistant({ content: "calling tools" }),
      tool({ toolCallId: "call-1" }),
      tool({ toolCallId: "call-2" }),
    ]
    const result = applyQueuedEvent(start, {
      kind: "message_start",
      replayed: true,
    })
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe("user")
    expect(result[1].role).toBe("assistant")
    expect((result[1] as AssistantMessage).content).toBe("")
  })

  it("replayed message_start leaves earlier turn messages intact", () => {
    const start: Message[] = [
      assistant({ content: "first message of the turn" }),
      tool({ toolCallId: "call-1", status: "done" }),
      assistant({ content: "stale current message" }),
    ]
    const result = applyQueuedEvent(start, {
      kind: "message_start",
      replayed: true,
    })
    expect(result).toHaveLength(3)
    expect((result[0] as AssistantMessage).content).toBe(
      "first message of the turn"
    )
    expect(result[1].role).toBe("tool")
    expect((result[2] as AssistantMessage).content).toBe("")
  })

  it("replayed message_start appends when the trailing row is a user message", () => {
    const start: Message[] = [{ role: "user", content: "hi" }]
    const result = applyQueuedEvent(start, {
      kind: "message_start",
      replayed: true,
    })
    expect(result).toHaveLength(2)
    expect(result[1].role).toBe("assistant")
  })

  it("text_delta appends to the trailing assistant message", () => {
    const start: Message[] = [assistant({ content: "Hel" })]
    const result = applyQueuedEvent(start, { kind: "text_delta", delta: "lo" })
    expect((result[0] as AssistantMessage).content).toBe("Hello")
  })

  it("text_delta creates a new assistant message when the trailing message isn't one", () => {
    const start: Message[] = [{ role: "user", content: "hi" }]
    const result = applyQueuedEvent(start, { kind: "text_delta", delta: "hey" })
    expect(result).toHaveLength(2)
    expect((result[1] as AssistantMessage).content).toBe("hey")
  })

  it("thinking_delta appends to the trailing assistant message's thinking", () => {
    const start: Message[] = [assistant({ thinking: "Thin" })]
    const result = applyQueuedEvent(start, {
      kind: "thinking_delta",
      delta: "king",
    })
    expect((result[0] as AssistantMessage).thinking).toBe("Thinking")
  })

  it("tool_start upserts a new running tool message by toolCallId", () => {
    const result = applyQueuedEvent([], {
      kind: "tool_start",
      toolCallId: "call-1",
      toolName: "write",
      args: { path: "a.ts" },
      startTime: 100,
    })
    expect(result).toHaveLength(1)
    const t = result[0] as ToolMessage
    expect(t.toolCallId).toBe("call-1")
    expect(t.status).toBe("running")
    expect(t.toolName).toBe("write")
  })

  it("tool_start updates an existing tool message in place rather than duplicating", () => {
    const start: Message[] = [tool({ toolCallId: "call-1", toolName: "read" })]
    const result = applyQueuedEvent(start, {
      kind: "tool_start",
      toolCallId: "call-1",
      toolName: "read",
      args: {},
      startTime: 200,
    })
    expect(result).toHaveLength(1)
  })

  it("tool_end settles a running tool to done with its result", () => {
    const start: Message[] = [tool({ toolCallId: "call-1", status: "running" })]
    const result = applyQueuedEvent(start, {
      kind: "tool_end",
      toolCallId: "call-1",
      toolName: "read",
      status: "done",
      result: { content: [{ type: "text", text: "ok" }] },
      duration: 42,
    })
    const t = result[0] as ToolMessage
    expect(t.status).toBe("done")
    expect(t.duration).toBe(42)
  })

  it("tool_end is a no-op when the tool was already finalized (e.g. by agent_end)", () => {
    const start: Message[] = [
      tool({ toolCallId: "call-1", status: "done", result: "first" }),
    ]
    const result = applyQueuedEvent(start, {
      kind: "tool_end",
      toolCallId: "call-1",
      toolName: "read",
      status: "error",
      result: "second",
    })
    // Unchanged — same reference, since applyQueuedEvent returns `msgs` untouched.
    expect(result).toBe(start)
    expect((result[0] as ToolMessage).result).toBe("first")
  })

  it("compaction_end appends a compaction row only on success", () => {
    const success = applyQueuedEvent([], {
      kind: "compaction_end",
      reason: "threshold",
    })
    expect(success).toHaveLength(1)
    expect(success[0].role).toBe("compaction")

    const failed = applyQueuedEvent([], {
      kind: "compaction_end",
      reason: "threshold",
      errorMessage: "boom",
    })
    expect(failed).toHaveLength(0)

    const aborted = applyQueuedEvent([], {
      kind: "compaction_end",
      reason: "threshold",
      aborted: true,
    })
    expect(aborted).toHaveLength(0)
  })

  it("agent_end stamps model/provider/responseTime onto the last assistant message", () => {
    const start: Message[] = [assistant({ content: "done" })]
    const event: QueuedEvent = {
      kind: "agent_end",
      agentMessages: [],
      meta: {
        startTime: Date.now() - 500,
        model: "claude",
        provider: "anthropic",
      },
    }
    const result = applyQueuedEvent(start, event)
    const last = result[result.length - 1] as AssistantMessage
    expect(last.model).toBe("claude")
    expect(last.provider).toBe("anthropic")
    expect(last.responseTime).toBeGreaterThanOrEqual(500)
  })

  it("agent_end finalizes still-running tools via finalizeRunningTools", () => {
    const start: Message[] = [
      tool({ toolCallId: "call-1", status: "running", startTime: 0 }),
    ]
    const agentMessages: AgentEndMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "file contents" }],
        isError: false,
      },
    ]
    const result = applyQueuedEvent(start, {
      kind: "agent_end",
      agentMessages,
      meta: null,
    })
    const t = result[0] as ToolMessage
    expect(t.status).toBe("done")
  })

  it("agent_end attaches a parsed error message from the failing assistant turn", () => {
    const start: Message[] = [assistant({ content: "" })]
    const agentMessages: AgentEndMessage[] = [
      {
        role: "assistant",
        stopReason: "error",
        errorMessage: "plain failure",
      },
    ]
    const result = applyQueuedEvent(start, {
      kind: "agent_end",
      agentMessages,
      meta: null,
    })
    const last = result[result.length - 1] as AssistantMessage
    expect(last.errorMessage).toBe("plain failure")
  })
})

describe("mergeRunningTools", () => {
  it("inserts new running tools right after the last assistant message", () => {
    const messages: Message[] = [
      assistant({ content: "working on it" }),
      { role: "user", content: "ok" },
    ]
    const running: Message[] = [tool({ toolCallId: "call-1" })]
    const result = mergeRunningTools(messages, running)
    expect(result[1].role).toBe("tool")
  })

  it("skips tools that already exist regardless of their current status", () => {
    const messages: Message[] = [tool({ toolCallId: "call-1", status: "done" })]
    const running: Message[] = [
      tool({ toolCallId: "call-1", status: "running" }),
    ]
    const result = mergeRunningTools(messages, running)
    expect(result).toHaveLength(1)
    expect((result[0] as ToolMessage).status).toBe("done")
  })

  it("returns the same array reference when there is nothing new to merge", () => {
    const messages: Message[] = [tool({ toolCallId: "call-1" })]
    const result = mergeRunningTools(messages, [])
    expect(result).toBe(messages)
  })
})

describe("finalizeRunningTools", () => {
  it("maps a matching toolResult onto the running tool", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1", status: "running", startTime: 0 }),
    ]
    const agentMessages: AgentEndMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "hi" }],
        isError: false,
      },
    ]
    const result = finalizeRunningTools(messages, agentMessages)
    const t = result[0] as ToolMessage
    expect(t.status).toBe("done")
  })

  it("marks isError toolResults as error", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1", status: "running" }),
    ]
    const agentMessages: AgentEndMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "boom" }],
        isError: true,
      },
    ]
    const result = finalizeRunningTools(messages, agentMessages)
    expect((result[0] as ToolMessage).status).toBe("error")
  })

  it("falls back to an aborted message when no result exists and the turn was aborted", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1", status: "running" }),
    ]
    const agentMessages: AgentEndMessage[] = [
      { role: "assistant", stopReason: "aborted" },
    ]
    const result = finalizeRunningTools(messages, agentMessages)
    const t = result[0] as ToolMessage
    expect(t.status).toBe("error")
    expect(JSON.stringify(t.result)).toContain("Operation aborted")
  })

  it("leaves non-running tools and non-tool messages untouched", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1", status: "done", result: "cached" }),
      { role: "user", content: "hi" },
    ]
    const result = finalizeRunningTools(messages, [])
    expect((result[0] as ToolMessage).result).toBe("cached")
    expect(result[1].role).toBe("user")
  })

  it("settles an interrupted subagent's streamed transcript as aborted", () => {
    const partialDetails = {
      kind: "subagent_run",
      agent: "explore",
      agentLabel: "Explore",
      color: "teal",
      icon: "telescope",
      status: "running",
      startedAt: 1000,
      blocks: [
        {
          role: "tool",
          toolCallId: "sub-1",
          toolName: "read",
          args: {},
          status: "done",
        },
      ],
    }
    const messages: Message[] = [
      tool({
        toolCallId: "call-1",
        toolName: "delegate",
        status: "running",
        partialResult: { content: [], details: partialDetails },
      }),
    ]
    const agentMessages: AgentEndMessage[] = [
      { role: "assistant", stopReason: "aborted" },
    ]
    const result = finalizeRunningTools(messages, agentMessages)
    const t = result[0] as ToolMessage
    expect(t.status).toBe("error")
    const details = (
      t.result as {
        details: { status: string; endedAt?: number; blocks: unknown[] }
      }
    ).details
    expect(details.status).toBe("aborted")
    expect(details.endedAt).toBeTypeOf("number")
    // The streamed transcript survives into the settled result.
    expect(details.blocks).toHaveLength(1)
  })

  it("keeps a completed subagent's details as done in the fallback path", () => {
    const messages: Message[] = [
      tool({
        toolCallId: "call-1",
        toolName: "delegate",
        status: "running",
        partialResult: {
          content: [],
          details: {
            kind: "subagent_run",
            agent: "general",
            agentLabel: "General",
            color: "emerald",
            icon: "bot",
            status: "done",
            startedAt: 1000,
            endedAt: 2000,
            blocks: [],
          },
        },
      }),
    ]
    const result = finalizeRunningTools(messages, [
      { role: "assistant", stopReason: "aborted" },
    ])
    const details = (
      (result[0] as ToolMessage).result as { details: { status: string } }
    ).details
    expect(details.status).toBe("done")
  })
})

function optimisticUser(overrides: Partial<UserMessage> = {}): UserMessage {
  return { role: "user", content: "hi", ...overrides }
}

function persistedUser(overrides: Partial<UserMessage> = {}): UserMessage {
  return { role: "user", id: "block-1", content: "hi", ...overrides }
}

describe("reconcileOptimisticUserMessages", () => {
  it("matches an optimistic row to its persisted row by clientId", () => {
    const optimistic = optimisticUser({ clientId: "c1", content: "hello" })
    const persisted = persistedUser({
      id: "b1",
      clientId: "c1",
      content: "hello",
    })
    const result = reconcileOptimisticUserMessages([optimistic], [persisted])
    expect((result[0] as UserMessage).id).toBe("b1")
    expect((result[0] as UserMessage).clientId).toBe("c1")
  })

  it("gives two identical-content optimistic rows their own persisted row when clientIds differ", () => {
    // This is the bug the clientId redesign fixes: matching by content alone
    // would collapse both onto the same persisted row (e.g. steering
    // "continue" twice).
    const first = optimisticUser({ clientId: "c1", content: "continue" })
    const second = optimisticUser({ clientId: "c2", content: "continue" })
    const persistedFirst = persistedUser({
      id: "b1",
      clientId: "c1",
      content: "continue",
    })
    const persistedSecond = persistedUser({
      id: "b2",
      clientId: "c2",
      content: "continue",
    })
    const result = reconcileOptimisticUserMessages(
      [first, second],
      [persistedFirst, persistedSecond]
    )
    expect((result[0] as UserMessage).id).toBe("b1")
    expect((result[1] as UserMessage).id).toBe("b2")
  })

  it("falls back to matching by content for rows with no clientId", () => {
    const optimistic = optimisticUser({ content: "legacy row" })
    const persisted = persistedUser({ id: "b1", content: "legacy row" })
    const result = reconcileOptimisticUserMessages([optimistic], [persisted])
    expect((result[0] as UserMessage).id).toBe("b1")
  })

  it("leaves an optimistic row unmatched when no persisted row corresponds to it", () => {
    const optimistic = optimisticUser({ clientId: "c1", content: "hello" })
    const result = reconcileOptimisticUserMessages([optimistic], [])
    expect((result[0] as UserMessage).id).toBeUndefined()
  })

  it("does not touch already-persisted (id-bearing) messages", () => {
    const alreadyPersisted = persistedUser({ id: "b0", content: "old" })
    const result = reconcileOptimisticUserMessages(
      [alreadyPersisted],
      [persistedUser({ id: "b1", clientId: "c1", content: "old" })]
    )
    expect((result[0] as UserMessage).id).toBe("b0")
  })
})
