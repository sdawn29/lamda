import type { AssistantMessage, Message, UserMessage } from "../types"
import type { WorkingMessage } from "../components/working-block"
import { estimateMessageSize } from "../components/message-row"
import type { TurnSummary } from "@/features/git/api"
import type { CompletedGoalList, TodoGoal } from "../components/todo-panel"

const PLAN_DIR_PREFIX = ".lamda/plans/"

export type MessageGroup =
  | {
      type: "regular"
      message: Message
      index: number
      suppressThinking?: boolean
      isLastInTurnStatic: boolean
      turnMessages?: AssistantMessage[]
    }
  | {
      type: "working"
      messages: WorkingMessage[]
      startIndex: number
      finalThinking?: string
    }

// Rough height estimate (px) for a group, used as `contain-intrinsic-size` so
// off-screen groups can be skipped from layout/paint without collapsing the
// scrollbar. Only an initial guess matters — `content-visibility: auto` makes
// the browser remember each group's real measured size once it has scrolled
// into view, so this just needs to be in the right ballpark.
export function estimateGroupSize(group: MessageGroup): number {
  if (group.type === "working") {
    if (group.messages.length === 0) return 80
    let total = 0
    for (const m of group.messages) total += estimateMessageSize(m)
    return total
  }
  return estimateMessageSize(group.message)
}

export function groupChatMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let i = 0
  let suppressNextThinking = false

  const isWorkingEntry = (m: Message): boolean => {
    if (m.role === "tool") return true
    if (m.role === "assistant") {
      return (
        !(m as AssistantMessage).content.trim() &&
        !(m as AssistantMessage).errorMessage
      )
    }
    return false
  }

  while (i < messages.length) {
    const msg = messages[i]
    if (isWorkingEntry(msg)) {
      suppressNextThinking = false
      const workingMsgs: WorkingMessage[] = []
      const startIndex = i
      while (i < messages.length && isWorkingEntry(messages[i])) {
        workingMsgs.push(messages[i] as WorkingMessage)
        i++
      }
      // Pull thinking from the following assistant response into this block
      const nextMsg = i < messages.length ? messages[i] : undefined
      let finalThinking: string | undefined
      if (
        nextMsg?.role === "assistant" &&
        (nextMsg as AssistantMessage).thinking.trim().length > 0
      ) {
        finalThinking = (nextMsg as AssistantMessage).thinking
        suppressNextThinking = true
      }
      groups.push({
        type: "working",
        messages: workingMsgs,
        startIndex,
        finalThinking,
      })
    } else {
      const suppress = suppressNextThinking && msg.role === "assistant"
      suppressNextThinking = false

      // If this assistant message has thinking that wasn't already pulled into a
      // preceding working block, create a synthetic working block for it now.
      if (
        !suppress &&
        msg.role === "assistant" &&
        (msg as AssistantMessage).thinking.trim().length > 0
      ) {
        groups.push({
          type: "working",
          messages: [],
          startIndex: i,
          finalThinking: (msg as AssistantMessage).thinking,
        })
        groups.push({
          type: "regular",
          message: msg,
          index: i,
          suppressThinking: true,
          isLastInTurnStatic: false,
          turnMessages: undefined,
        })
      } else {
        groups.push({
          type: "regular",
          message: msg,
          index: i,
          suppressThinking: suppress,
          isLastInTurnStatic: false,
          turnMessages: undefined,
        })
      }
      i++
    }
  }

  // Post-pass: compute isLastInTurnStatic + turnMessages for assistant groups.
  // Backward scan to mark which assistant is last in its turn, then a forward
  // scan to collect the turn's assistant messages for the copy button.
  // Both passes are O(n) over groups, so this replaces the O(n²) per-render loop.
  let seenAssistantAfter = false
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g]
    if (group.type !== "regular") continue
    if (group.message.role === "user" || group.message.role === "abort") {
      seenAssistantAfter = false
    } else if (group.message.role === "assistant") {
      group.isLastInTurnStatic = !seenAssistantAfter
      seenAssistantAfter = true
    }
  }

  let currentTurnAssistants: AssistantMessage[] = []
  for (const group of groups) {
    if (group.type !== "regular") continue
    if (group.message.role === "user" || group.message.role === "abort") {
      currentTurnAssistants = []
    } else if (group.message.role === "assistant") {
      currentTurnAssistants = [
        ...currentTurnAssistants,
        group.message as AssistantMessage,
      ]
      if (group.isLastInTurnStatic) {
        group.turnMessages = currentTurnAssistants
      }
    }
  }

  return groups
}

export function isPlanOnlyTurn(turn: TurnSummary): boolean {
  return (
    turn.files.length > 0 &&
    turn.files.every(
      (f) =>
        f.filePath.replace(/\\/g, "/").startsWith(PLAN_DIR_PREFIX) &&
        f.filePath.toLowerCase().endsWith(".md")
    )
  )
}

function getGroupCreatedAt(group: MessageGroup): number | null {
  if (group.type === "regular") {
    return "createdAt" in group.message
      ? (group.message.createdAt ?? null)
      : null
  }

  let latest: number | null = null
  for (const message of group.messages) {
    const createdAt = message.createdAt ?? null
    if (createdAt == null) continue
    latest = latest == null ? createdAt : Math.max(latest, createdAt)
  }
  return latest
}

export function buildTurnCardsByGroup(
  groups: MessageGroup[],
  turns: TurnSummary[],
  // Timestamp (ms) of the latest commit. A completed turn that ended at or
  // before this has had its changes committed, so its "Files changed this turn"
  // card is stale (the revert checkpoint predates the commit) and is hidden.
  // 0 disables the cutoff (no commits, or the caller doesn't track it).
  committedBefore = 0
): Map<number, TurnSummary[]> {
  const completedTurns = turns
    .filter(
      (turn) =>
        !turn.inProgress &&
        turn.files.length > 0 &&
        !(committedBefore > 0 && turn.endedAt <= committedBefore)
    )
    .sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)
  const groupTimes = groups.map(getGroupCreatedAt)
  const cardsByGroup = new Map<number, TurnSummary[]>()
  let previousTurnEndedAt = -Infinity

  const isUserBoundary = (group: MessageGroup): boolean =>
    group.type === "regular" &&
    (group.message.role === "user" || group.message.role === "abort")

  for (let t = 0; t < completedTurns.length; t++) {
    const turn = completedTurns[t]
    const nextTurnStartedAt = completedTurns[t + 1]?.startedAt ?? Infinity
    let targetIndex = -1

    for (let i = 0; i < groupTimes.length; i++) {
      const createdAt = groupTimes[i]
      if (createdAt == null) continue
      if (createdAt >= turn.startedAt && createdAt <= turn.endedAt + 5_000) {
        targetIndex = i
      }
    }

    if (targetIndex === -1) {
      for (let i = 0; i < groupTimes.length; i++) {
        const createdAt = groupTimes[i]
        if (createdAt == null) continue
        if (
          createdAt > previousTurnEndedAt &&
          createdAt <= turn.endedAt + 5_000
        ) {
          targetIndex = i
        }
      }
    }

    if (targetIndex !== -1) {
      // Dock the card at the turn's end. The timestamp window above can match an
      // earlier working block when the assistant streams a closing summary after
      // its tool calls (that trailing group may have no createdAt yet, or one
      // just past the window). Advance over any trailing assistant/working groups
      // belonging to this turn so the card always renders below the whole turn,
      // stopping at the next user message or the start of the following turn.
      for (let j = targetIndex + 1; j < groups.length; j++) {
        if (isUserBoundary(groups[j])) break
        const createdAt = groupTimes[j]
        if (createdAt != null && createdAt >= nextTurnStartedAt) break
        targetIndex = j
      }

      const list = cardsByGroup.get(targetIndex) ?? []
      list.push(turn)
      cardsByGroup.set(targetIndex, list)
    }
    previousTurnEndedAt = turn.endedAt
  }

  return cardsByGroup
}

export interface MessageCheckpoint {
  /** Distinct files changed by the turn(s) this message kicked off. */
  fileCount: number
  /** A durable git checkpoint exists, so reverting here restores the code too. */
  hasCheckpoint: boolean
}

// Associate each user message with the checkpoint produced by the agent turn(s)
// it started. A message "owns" every completed turn whose start falls between it
// and the next user message — the same windowing the revert-to-message endpoint
// uses. The result lets the transcript mark which messages are restorable points.
export function buildCheckpointByUserBlock(
  messages: Message[],
  turns: TurnSummary[]
): Map<string, MessageCheckpoint> {
  const userMessages = messages.filter(
    (m): m is UserMessage => m.role === "user" && !!m.id
  )
  if (userMessages.length === 0) return new Map()

  const completedTurns = turns
    .filter((turn) => !turn.inProgress && turn.files.length > 0)
    .sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)

  const result = new Map<string, MessageCheckpoint>()
  for (let i = 0; i < userMessages.length; i++) {
    const current = userMessages[i]
    const createdAt = current.createdAt
    if (createdAt == null) continue
    const nextCreatedAt = userMessages[i + 1]?.createdAt ?? Infinity

    const files = new Set<string>()
    let hasCheckpoint = false
    for (const turn of completedTurns) {
      if (turn.startedAt < createdAt || turn.startedAt >= nextCreatedAt)
        continue
      for (const f of turn.files) files.add(f.filePath)
      if (turn.checkpointSha) hasCheckpoint = true
    }

    if (files.size > 0) {
      result.set(current.id!, { fileCount: files.size, hasCheckpoint })
    }
  }
  return result
}

// Map each fully-completed todo list to the group that contains the todo tool
// message where its last goal finished, so the whole list docks inline next to
// that turn as a single card.
export function buildCompletedTodosByGroup(
  groups: MessageGroup[],
  lists: CompletedGoalList[]
): Map<number, TodoGoal[][]> {
  const map = new Map<number, TodoGoal[][]>()
  if (lists.length === 0) return map

  const groupOfMessage = (msgIndex: number): number => {
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]
      if (group.type === "regular") {
        if (group.index === msgIndex) return g
      } else if (
        msgIndex >= group.startIndex &&
        msgIndex < group.startIndex + group.messages.length
      ) {
        return g
      }
    }
    return -1
  }

  for (const { goals, messageIndex } of lists) {
    const g = groupOfMessage(messageIndex)
    if (g === -1) continue
    const bucket = map.get(g) ?? []
    bucket.push(goals)
    map.set(g, bucket)
  }

  return map
}
