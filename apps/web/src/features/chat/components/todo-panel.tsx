import { memo, useMemo, useState } from "react"
import { CheckIcon, ChevronRightIcon, ListTodoIcon, MinusIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import type { Message, ToolMessage } from "../types"

// ── Types (local mirror of pi-sdk types) ─────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed"
export type GoalStatus = "active" | "completed"

export interface TodoItem {
  id: string
  goalId: string | null
  content: string
  status: TodoStatus
}

export interface TodoGoal {
  id: string
  description: string
  status: GoalStatus
  tasks: TodoItem[]
}

// ── Parse goals from a ToolMessage result ─────────────────────────────────────

function extractGoals(msg: ToolMessage): TodoGoal[] | null {
  const raw = msg.result ?? msg.partialResult
  if (!raw) return null

  let text: string | null = null
  if (typeof raw === "string") {
    text = raw
  } else if (typeof raw === "object" && raw !== null) {
    const parts = (
      (raw as Record<string, unknown>).content as
        | { type: string; text?: string }[]
        | undefined
    ) ?? []
    text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("")
  }

  if (!text) return null
  try {
    const obj = JSON.parse(text) as Record<string, unknown>
    if (Array.isArray(obj.goals)) return obj.goals as TodoGoal[]
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Scan messages from the end to find the most-recent todo state.
 * Falls back to the previous stable result if the latest call is still
 * streaming with no partial data, so the panel never blanks mid-update.
 */
export function deriveGoalsFromMessages(messages: Message[]): {
  goals: TodoGoal[]
  isLive: boolean
} {
  let goals: TodoGoal[] = []
  let isLive = false

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "tool" || msg.toolName.toLowerCase() !== "todo") continue

    if (msg.status === "running") {
      isLive = true
      const partial = extractGoals(msg)
      if (partial) {
        const active = partial.filter((g) => g.status !== "completed")
        if (active.length > 0) {
          goals = active
          break
        }
      }
      continue
    }

    const parsed = extractGoals(msg)
    if (parsed) {
      // Only keep active goals — completed ones have already been cleared from the DB.
      goals = parsed.filter((g) => g.status !== "completed")
      break
    }
  }

  return { goals, isLive }
}

export interface CompletedGoalList {
  /** Every goal in the list, in first-seen order, in its final (done) snapshot. */
  goals: TodoGoal[]
  /** Index of the todo message where the last goal of the list completed. */
  messageIndex: number
}

/**
 * Group goals into "lists" and return only those whose every member has
 * completed, so a finished list docks inline as a single unit rather than
 * leaking individual goals as they finish.
 *
 * Goals belong to the same list if they ever co-occur in a snapshot (computed
 * transitively via union-find — goals are deleted one at a time as they finish,
 * so a single all-completed snapshot never exists, but each completed goal
 * still shares at least one earlier snapshot with the rest of its list). A goal
 * surfaces as completed in the final snapshot returned just before it is
 * deleted from the DB; we anchor the list to the latest such completion so it
 * lands at the turn where the whole list wrapped up.
 */
export function deriveCompletedGoalLists(
  messages: Message[],
): CompletedGoalList[] {
  // Union-find over goal ids.
  const parent = new Map<string, string>()
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x)
  }
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    ensure(a)
    ensure(b)
    parent.set(find(a), find(b))
  }

  const latest = new Map<string, TodoGoal>() // latest snapshot of each goal
  const firstSeen = new Map<string, number>() // appearance order, for stable sort
  const completedAt = new Map<string, number>() // message index of first completion
  let order = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== "tool" || msg.toolName.toLowerCase() !== "todo") continue
    // Only trust committed (non-streaming) snapshots so a partial mid-update
    // doesn't anchor a goal that isn't actually finished yet.
    if (msg.status === "running") continue

    const parsed = extractGoals(msg)
    if (!parsed || parsed.length === 0) continue

    // Co-occurrence: everything in this snapshot is part of one list.
    parsed.forEach((g) => ensure(g.id))
    for (let k = 1; k < parsed.length; k++) union(parsed[0].id, parsed[k].id)

    for (const goal of parsed) {
      if (!firstSeen.has(goal.id)) firstSeen.set(goal.id, order++)
      latest.set(goal.id, goal)
      if (goal.status === "completed" && !completedAt.has(goal.id)) {
        completedAt.set(goal.id, i)
      }
    }
  }

  // Bucket goal ids by their list root.
  const lists = new Map<string, string[]>()
  for (const id of parent.keys()) {
    const root = find(id)
    const arr = lists.get(root) ?? []
    arr.push(id)
    lists.set(root, arr)
  }

  const result: CompletedGoalList[] = []
  for (const ids of lists.values()) {
    // Only emit once every goal in the list has completed.
    if (!ids.every((id) => completedAt.has(id))) continue
    const ordered = ids
      .slice()
      .sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0))
    const goals = ordered
      .map((id) => latest.get(id))
      .filter((g): g is TodoGoal => g != null)
    const messageIndex = Math.max(...ordered.map((id) => completedAt.get(id)!))
    result.push({ goals, messageIndex })
  }

  result.sort((a, b) => a.messageIndex - b.messageIndex)
  return result
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ status }: { status: TodoStatus }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150",
        status === "completed"
          ? "border-muted-foreground/30 bg-muted-foreground/15"
          : status === "in_progress"
            ? "border-muted-foreground/50"
            : "border-muted-foreground/25",
      )}
    >
      {status === "completed" && (
        <CheckIcon className="h-2.5 w-2.5 text-muted-foreground/60" strokeWidth={2.5} />
      )}
      {status === "in_progress" && (
        <MinusIcon className="h-2.5 w-2.5 text-muted-foreground/50" strokeWidth={2.5} />
      )}
    </span>
  )
}

// ── GoalSection ───────────────────────────────────────────────────────────────

function GoalSection({
  goal,
  isLive,
  isLast,
}: {
  goal: TodoGoal
  isLive: boolean
  isLast: boolean
}) {
  // A goal arrives as "completed" in the final snapshot returned just before
  // it is deleted from the DB — show everything checked off.
  const isDone = goal.status === "completed"
  const completedCount = goal.tasks.filter((t) => t.status === "completed").length
  const total = goal.tasks.length
  const activeTask = !isDone && goal.tasks.find((t) => t.status === "in_progress")

  return (
    <div className={cn("px-3 py-2", !isLast && "border-b border-border/40")}>
      {/* Goal header */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            "flex-1 text-xs font-medium",
            isDone
              ? "text-muted-foreground/40 line-through"
              : isLive && activeTask
                ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
                : "text-muted-foreground/80",
          )}
        >
          {goal.description}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/35">
          {completedCount}/{total}
        </span>
      </div>

      {/* Tasks — force all to "completed" appearance when goal is done */}
      <ul className="flex flex-col">
        {goal.tasks.map((task) => {
          const effectiveStatus: TodoStatus = isDone ? "completed" : task.status
          return (
            <li key={task.id} className="flex items-center gap-2 py-0.5">
              <Checkbox status={effectiveStatus} />
              <span
                className={cn(
                  "text-sm leading-snug",
                  effectiveStatus === "completed"
                    ? "text-muted-foreground/40 line-through"
                    : effectiveStatus === "in_progress"
                      ? isLive
                        ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/50 via-foreground to-muted-foreground/50 bg-size-[200%_100%] bg-clip-text text-transparent"
                        : "text-foreground/80"
                      : "text-muted-foreground/60",
                )}
              >
                {task.content}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── TodoListCard (presentational) ─────────────────────────────────────────────

function TodoListCard({ goals, isLive }: { goals: TodoGoal[]; isLive: boolean }) {
  const [expanded, setExpanded] = useState(false)

  const totalTasks = goals.reduce((n, g) => n + g.tasks.length, 0)
  // A goal marked "completed" counts all its tasks as done — individual tasks
  // may have been skipped or left pending when the goal was closed out.
  const completedTasks = goals.reduce(
    (n, g) =>
      n +
      (g.status === "completed"
        ? g.tasks.length
        : g.tasks.filter((t) => t.status === "completed").length),
    0,
  )
  const allDone = totalTasks > 0 && completedTasks === totalTasks

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border/40">
      {/* Header / trigger */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ListTodoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        <span
          className={cn(
            "flex-1 text-xs font-medium",
            isLive && !allDone
              ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
              : "text-muted-foreground",
          )}
        >
          {allDone
            ? `${totalTasks} task${totalTasks === 1 ? "" : "s"} complete`
            : `${completedTasks} of ${totalTasks} task${totalTasks === 1 ? "" : "s"} done`}
        </span>

        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>

      {/* Collapsible goal sections */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/40">
            {goals.map((goal, i) => (
              <GoalSection
                key={goal.id}
                goal={goal}
                isLive={isLive}
                isLast={i === goals.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TodoPanel (floating, live goals) ──────────────────────────────────────────

interface TodoPanelProps {
  messages: Message[]
}

/**
 * Sticky panel above the input that tracks the currently-active todo list while
 * the agent is working. Completed goals are cleared here and re-rendered inline
 * via {@link CompletedTodoPanel} anchored to the turn they finished in.
 */
export const TodoPanel = memo(function TodoPanel({ messages }: TodoPanelProps) {
  const { goals, isLive } = useMemo(
    () => deriveGoalsFromMessages(messages),
    [messages],
  )

  if (goals.length === 0) return null

  return <TodoListCard goals={goals} isLive={isLive} />
})

// ── CompletedTodoPanel (inline, docked into the conversation) ──────────────────

/** A finished todo list docked inline within the message rows. */
export const CompletedTodoPanel = memo(function CompletedTodoPanel({
  goals,
}: {
  goals: TodoGoal[]
}) {
  if (goals.length === 0) return null

  return <TodoListCard goals={goals} isLive={false} />
})
