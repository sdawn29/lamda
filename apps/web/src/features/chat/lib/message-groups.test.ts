import { describe, it, expect } from "vitest"
import {
  groupChatMessages,
  isPlanOnlyTurn,
  buildTurnCardsByGroup,
} from "./message-groups"
import type { AssistantMessage, Message, ToolMessage } from "../types"
import type { TurnFileSummary, TurnSummary } from "@/features/git/api"

function assistant(
  overrides: Partial<AssistantMessage> = {}
): AssistantMessage {
  return { role: "assistant", content: "", thinking: "", ...overrides }
}

function tool(overrides: Partial<ToolMessage> = {}): ToolMessage {
  return {
    role: "tool",
    toolCallId: "call-1",
    toolName: "read",
    args: {},
    status: "done",
    ...overrides,
  }
}

function turnFile(overrides: Partial<TurnFileSummary> = {}): TurnFileSummary {
  return {
    filePath: "src/a.ts",
    postStatusCode: "M",
    wasCreatedByTurn: false,
    ...overrides,
  }
}

function turn(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    id: 1,
    sessionId: "s1",
    threadId: "t1",
    startedAt: 0,
    endedAt: 100,
    checkpointSha: "abc",
    files: [turnFile()],
    inProgress: false,
    ...overrides,
  }
}

describe("groupChatMessages", () => {
  it("keeps plain user/assistant text messages as separate regular groups", () => {
    const messages: Message[] = [
      { role: "user", content: "hi" },
      assistant({ content: "hello" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups).toHaveLength(2)
    expect(groups[0].type).toBe("regular")
    expect(groups[1].type).toBe("regular")
  })

  it("groups consecutive tool calls into a single working block", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1" }),
      tool({ toolCallId: "call-2" }),
      assistant({ content: "done" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups[0].type).toBe("working")
    if (groups[0].type === "working") {
      expect(groups[0].messages).toHaveLength(2)
    }
    expect(groups[1].type).toBe("regular")
  })

  it("treats a contentless assistant message (mid-turn) as a working entry", () => {
    const messages: Message[] = [
      assistant({ content: "" }),
      tool({ toolCallId: "call-1" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe("working")
  })

  it("collapses consecutive identical pure-error assistant messages and counts repeats", () => {
    const messages: Message[] = [
      assistant({ errorMessage: "network down" }),
      assistant({ errorMessage: "network down" }),
      assistant({ errorMessage: "network down" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe("regular")
    if (groups[0].type === "regular") {
      expect(groups[0].repeatCount).toBe(3)
    }
  })

  it("does not collapse pure errors with different messages", () => {
    const messages: Message[] = [
      assistant({ errorMessage: "network down" }),
      assistant({ errorMessage: "rate limited" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups).toHaveLength(2)
  })

  it("pulls trailing assistant thinking into the preceding working block and suppresses it on the regular group", () => {
    const messages: Message[] = [
      tool({ toolCallId: "call-1" }),
      assistant({ content: "final answer", thinking: "let me think" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups[0].type).toBe("working")
    if (groups[0].type === "working") {
      expect(groups[0].finalThinking).toBe("let me think")
    }
    expect(groups[1].type).toBe("regular")
    if (groups[1].type === "regular") {
      expect(groups[1].suppressThinking).toBe(true)
    }
  })

  it("creates a synthetic working block for standalone assistant thinking with no preceding tool calls", () => {
    const messages: Message[] = [
      assistant({ content: "final answer", thinking: "reasoning" }),
    ]
    const groups = groupChatMessages(messages)
    expect(groups).toHaveLength(2)
    expect(groups[0].type).toBe("working")
    expect(groups[1].type).toBe("regular")
  })

  it("marks only the last assistant message in a turn as isLastInTurnStatic and collects turnMessages", () => {
    const messages: Message[] = [
      { role: "user", content: "go" },
      assistant({ content: "step 1" }),
      assistant({ content: "step 2" }),
    ]
    const groups = groupChatMessages(messages)
    const regularGroups = groups.filter((g) => g.type === "regular")
    const [, first, second] = regularGroups
    expect(first.isLastInTurnStatic).toBe(false)
    expect(second.isLastInTurnStatic).toBe(true)
    expect(second.turnMessages).toHaveLength(2)
  })
})

describe("isPlanOnlyTurn", () => {
  it("is true when every file is a markdown file under .lamda/plans/", () => {
    expect(
      isPlanOnlyTurn(
        turn({ files: [turnFile({ filePath: ".lamda/plans/foo.md" })] })
      )
    ).toBe(true)
  })

  it("is false when any file falls outside .lamda/plans/", () => {
    expect(
      isPlanOnlyTurn(
        turn({
          files: [
            turnFile({ filePath: ".lamda/plans/foo.md" }),
            turnFile({ filePath: "src/index.ts" }),
          ],
        })
      )
    ).toBe(false)
  })

  it("is false when there are no files", () => {
    expect(isPlanOnlyTurn(turn({ files: [] }))).toBe(false)
  })
})

describe("buildTurnCardsByGroup", () => {
  it("docks a completed turn's card at the group whose timestamp falls in its window", () => {
    const messages: Message[] = [
      { role: "user", content: "go", createdAt: 0 },
      assistant({ content: "done", createdAt: 50 }),
    ]
    const groups = groupChatMessages(messages)
    const t = turn({ startedAt: 0, endedAt: 50, inProgress: false })
    const cardsByGroup = buildTurnCardsByGroup(groups, [t])
    const totalCards = [...cardsByGroup.values()].reduce(
      (n, list) => n + list.length,
      0
    )
    expect(totalCards).toBe(1)
  })

  it("ignores in-progress turns and turns with no files", () => {
    const messages: Message[] = [assistant({ content: "done", createdAt: 50 })]
    const groups = groupChatMessages(messages)
    const inProgress = turn({ inProgress: true })
    const noFiles = turn({ files: [] })
    const cardsByGroup = buildTurnCardsByGroup(groups, [inProgress, noFiles])
    expect(cardsByGroup.size).toBe(0)
  })

  it("hides a completed turn's card once its changes are committed (committedBefore cutoff)", () => {
    const messages: Message[] = [assistant({ content: "done", createdAt: 50 })]
    const groups = groupChatMessages(messages)
    const t = turn({ startedAt: 0, endedAt: 50 })
    const cardsByGroup = buildTurnCardsByGroup(
      groups,
      [t],
      /* committedBefore */ 100
    )
    expect(cardsByGroup.size).toBe(0)
  })
})
