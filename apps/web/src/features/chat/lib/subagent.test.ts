import { describe, expect, it } from "vitest"
import {
  describeSubagentActivity,
  getSubagentDetails,
  subagentBlocksToMessages,
  type SubagentBlock,
  type SubagentRunDetails,
} from "./subagent"
import type { ToolMessage } from "../types"

function details(
  overrides: Partial<SubagentRunDetails> = {}
): SubagentRunDetails {
  return {
    kind: "subagent_run",
    agent: "explore",
    agentLabel: "Explore",
    color: "teal",
    icon: "telescope",
    status: "running",
    startedAt: 1000,
    blocks: [],
    ...overrides,
  }
}

function taskMsg(overrides: Partial<ToolMessage> = {}): ToolMessage {
  return {
    role: "tool",
    toolCallId: "call-1",
    toolName: "task",
    args: { agent: "explore", description: "Find things", prompt: "…" },
    status: "running",
    ...overrides,
  }
}

describe("getSubagentDetails", () => {
  it("prefers the live partialResult while running", () => {
    const msg = taskMsg({
      partialResult: { content: [], details: details({ status: "running" }) },
      result: { content: [], details: details({ status: "queued" }) },
    })
    expect(getSubagentDetails(msg)?.status).toBe("running")
  })

  it("falls back to a DB-restored result while running", () => {
    const msg = taskMsg({
      result: { content: [], details: details({ status: "running" }) },
    })
    expect(getSubagentDetails(msg)?.status).toBe("running")
  })

  it("prefers the final result over a stale partial once settled", () => {
    const msg = taskMsg({
      status: "done",
      partialResult: { content: [], details: details({ status: "running" }) },
      result: { content: [], details: details({ status: "done" }) },
    })
    expect(getSubagentDetails(msg)?.status).toBe("done")
  })

  it("rejects results without the subagent_run discriminator", () => {
    const msg = taskMsg({
      status: "done",
      result: { content: [{ type: "text", text: "plain" }], details: {} },
    })
    expect(getSubagentDetails(msg)).toBeNull()
  })
})

describe("subagentBlocksToMessages", () => {
  it("maps assistant and tool blocks onto Message shapes", () => {
    const blocks: SubagentBlock[] = [
      { role: "assistant", content: "hi", thinking: "hmm" },
      {
        role: "tool",
        toolCallId: "t1",
        toolName: "read",
        args: { path: "a.ts" },
        status: "done",
        result: { content: [{ type: "text", text: "ok" }] },
        duration: 42,
      },
    ]
    const messages = subagentBlocksToMessages(blocks)
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "hi",
      thinking: "hmm",
    })
    expect(messages[1]).toMatchObject({
      role: "tool",
      toolCallId: "t1",
      toolName: "read",
      status: "done",
      duration: 42,
    })
  })
})

describe("describeSubagentActivity", () => {
  it("names the trailing running tool", () => {
    const d = details({
      blocks: [
        { role: "assistant", content: "…", thinking: "" },
        {
          role: "tool",
          toolCallId: "t1",
          toolName: "bash",
          args: {},
          status: "running",
        },
      ],
    })
    expect(describeSubagentActivity(d)).toBe("bash")
  })

  it("reports thinking/responding when a reply streams", () => {
    expect(
      describeSubagentActivity(
        details({ blocks: [{ role: "assistant", content: "", thinking: "" }] })
      )
    ).toBe("thinking")
    expect(
      describeSubagentActivity(
        details({
          blocks: [{ role: "assistant", content: "Answer…", thinking: "" }],
        })
      )
    ).toBe("responding")
  })

  it("returns null for an empty transcript", () => {
    expect(describeSubagentActivity(details())).toBeNull()
  })
})
