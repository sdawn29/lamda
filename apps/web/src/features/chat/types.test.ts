import { describe, it, expect } from "vitest"
import { blocksToMessages, blockToMessage, parseErrorMessage } from "./types"
import type { MessageBlock } from "./types"

function block(overrides: Partial<MessageBlock> = {}): MessageBlock {
  return {
    id: "b1",
    threadId: "t1",
    blockIndex: 0,
    role: "user",
    content: null,
    thinking: null,
    model: null,
    provider: null,
    thinkingLevel: null,
    responseTime: null,
    errorMessage: null,
    toolCallId: null,
    toolName: null,
    toolArgs: null,
    toolResult: null,
    toolStatus: null,
    toolDuration: null,
    toolStartTime: null,
    attachments: null,
    clientId: null,
    createdAt: 1000,
    ...overrides,
  }
}

describe("blockToMessage / blocksToMessages", () => {
  it("converts a user block, parsing attachments JSON", () => {
    const b = block({
      role: "user",
      content: "hello",
      attachments: JSON.stringify([
        {
          id: "a1",
          filename: "x.png",
          mediaType: "image/png",
          size: 10,
          kind: "image",
        },
      ]),
    })
    const msg = blockToMessage(b)
    expect(msg.role).toBe("user")
    if (msg.role === "user") {
      expect(msg.content).toBe("hello")
      expect(msg.attachments).toHaveLength(1)
      expect(msg.attachments?.[0].filename).toBe("x.png")
    }
  })

  it("falls back to no attachments when the JSON is invalid", () => {
    const b = block({ role: "user", content: "hi", attachments: "{not json" })
    const msg = blockToMessage(b)
    if (msg.role === "user") {
      expect(msg.attachments).toBeUndefined()
    }
  })

  it("converts an assistant block, parsing the error message envelope", () => {
    const b = block({
      role: "assistant",
      content: "the answer",
      thinking: "reasoning",
      model: "claude",
      provider: "anthropic",
      errorMessage: JSON.stringify({ error: { message: "rate limited" } }),
    })
    const msg = blockToMessage(b)
    expect(msg.role).toBe("assistant")
    if (msg.role === "assistant") {
      expect(msg.content).toBe("the answer")
      expect(msg.model).toBe("claude")
      expect(msg.errorMessage).toBe("rate limited")
    }
  })

  it("converts a tool block, parsing toolArgs/toolResult JSON with raw-string fallback", () => {
    const b = block({
      role: "tool",
      toolCallId: "call-1",
      toolName: "read",
      toolArgs: JSON.stringify({ path: "a.ts" }),
      toolResult: "not json",
      toolStatus: "done",
    })
    const msg = blockToMessage(b)
    expect(msg.role).toBe("tool")
    if (msg.role === "tool") {
      expect(msg.args).toEqual({ path: "a.ts" })
      expect(msg.result).toBe("not json")
      expect(msg.status).toBe("done")
    }
  })

  it("converts abort and compaction blocks", () => {
    expect(blockToMessage(block({ role: "abort" })).role).toBe("abort")
    const compaction = blockToMessage(
      block({ role: "compaction", content: "manual" })
    )
    expect(compaction.role).toBe("compaction")
    if (compaction.role === "compaction") {
      expect(compaction.reason).toBe("manual")
    }
  })

  it("round-trips a full transcript of blocks in order", () => {
    const blocks: MessageBlock[] = [
      block({ id: "u1", role: "user", content: "question", blockIndex: 0 }),
      block({
        id: "t1",
        role: "tool",
        toolCallId: "call-1",
        toolName: "read",
        toolStatus: "done",
        blockIndex: 1,
      }),
      block({ id: "a1", role: "assistant", content: "answer", blockIndex: 2 }),
    ]
    const messages = blocksToMessages(blocks)
    expect(messages.map((m) => m.role)).toEqual(["user", "tool", "assistant"])
  })
})

describe("parseErrorMessage", () => {
  it("extracts error.message from a JSON envelope", () => {
    expect(
      parseErrorMessage(JSON.stringify({ error: { message: "boom" } }))
    ).toBe("boom")
  })

  it("extracts a plain string error field", () => {
    expect(parseErrorMessage(JSON.stringify({ error: "boom" }))).toBe("boom")
  })

  it("extracts a JSON envelope embedded after leading text", () => {
    const raw = `Request failed: ${JSON.stringify({ error: { message: "nested boom" } })}`
    expect(parseErrorMessage(raw)).toBe("nested boom")
  })

  it("returns the raw string when it isn't parseable JSON", () => {
    expect(parseErrorMessage("plain text error")).toBe("plain text error")
  })
})
