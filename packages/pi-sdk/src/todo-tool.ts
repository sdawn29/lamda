import type { ToolDefinition } from "@earendil-works/pi-coding-agent"
import {
  insertGoal,
  countGoalsByThread,
  insertTodo,
  updateTodo,
  getTodo,
  listTodosByGoal,
  deleteTodo,
  deleteGoalWithTasks,
  listGoalsWithTasks,
  type GoalRow,
  type TodoRow,
  type GoalStatus,
  type TodoStatus,
} from "@lamda/db"

// ── Constants ─────────────────────────────────────────────────────────────────

export const TODO_TOOL_NAME = "todo"

// ── Public types ──────────────────────────────────────────────────────────────

export type { TodoStatus, GoalStatus }

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

export interface TodoResult {
  operation: string
  goals: TodoGoal[]
  message?: string
}

// ── Serialization ─────────────────────────────────────────────────────────────

function toGoal(goal: GoalRow, tasks: TodoRow[]): TodoGoal {
  return {
    id: goal.id,
    description: goal.description,
    status: goal.status,
    tasks: tasks.map((t) => ({
      id: t.id,
      goalId: t.goalId,
      content: t.content,
      status: t.status,
    })),
  }
}

/** Read the live DB state and serialize every goal+tasks for this thread. */
function snapshot(threadId: string): TodoGoal[] {
  return listGoalsWithTasks(threadId).map(({ goal, tasks }) => toGoal(goal, tasks))
}

/** Build a tool response from a pre-built goals array (used after deletion). */
function respond(
  operation: string,
  goals: TodoGoal[],
  message?: string,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  const payload: TodoResult = { operation, goals, ...(message ? { message } : {}) }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: { goals },
  }
}

/** Build a tool response from the current DB state. */
function ok(
  operation: string,
  threadId: string,
  message?: string,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return respond(operation, snapshot(threadId), message)
}

function err(message: string): {
  content: { type: "text"; text: string }[]
  details: Record<string, unknown>
} {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    details: {},
  }
}

/**
 * If every task under `goalId` is completed, schedule a background deletion
 * of the goal and return the remaining active goals (excluding the finishing
 * goal) so the panel disappears immediately.
 *
 * Deletion runs via `setImmediate` — the tool response is returned first and
 * the DB write happens on the next event-loop tick.
 *
 * Returns null when the goal still has incomplete tasks (nothing to do).
 */
function tryFinalizeGoal(goalId: string, threadId: string): TodoGoal[] | null {
  const remaining = listTodosByGoal(goalId)
  // Bail if no tasks (abandoned goal) or any task is still incomplete.
  if (remaining.length === 0 || !remaining.every((t) => t.status === "completed")) {
    return null
  }
  // Build the response snapshot with the finishing goal marked "completed".
  // The floating TodoPanel filters completed goals out, so it disappears on
  // this very call; the inline CompletedTodoPanel keys off this completed
  // snapshot to dock the finished list into the conversation. Goal rows are
  // never set to "completed" in the DB, so we override the status here.
  const finalGoals = snapshot(threadId).map((g) =>
    g.id === goalId ? { ...g, status: "completed" as GoalStatus } : g,
  )
  // Schedule the actual DB deletion in the background.
  setImmediate(() => {
    try { deleteGoalWithTasks(goalId) } catch { /* ignore */ }
  })
  return finalGoals
}

// ── Tool factory ──────────────────────────────────────────────────────────────

/**
 * Create the todo tool bound to a specific thread.
 * Goals and tasks are stored in the DB, scoped to `threadId`.
 *
 * When every task under a goal is marked completed the goal is automatically
 * deleted from the DB. The tool result for that call still contains the goal
 * with all tasks showing as "completed" so the UI can display a final
 * completion state before clearing.
 */
export function createTodoTool(threadId: string): ToolDefinition {
  return {
    name: TODO_TOOL_NAME,
    label: "todo",
    description: `Manage a goal-oriented todo list for the current thread.

Each goal has a short description and an ordered list of tasks. When every task under a goal is marked completed the goal is automatically removed — the response for that call still shows all tasks as completed so the user sees the final state.

Operations:
- create  — Create a new goal with its tasks in one call.
            Required: \`goal\` (string) and \`items\` (array of { content }).
- update  — Change the status or content of a task.
            Required: \`id\` (task id). Optional: \`status\`, \`content\`.
- delete  — Remove a single task by \`id\`.
- list    — Show all active goals and their tasks for this thread.

Task statuses: pending → in_progress → completed

Best practices:
1. At the start of any complex, multi-step task call "create" with a clear goal description
   and every planned step as items.
2. Mark each task "in_progress" before you begin it.
3. Mark it "completed" as soon as it is done — the goal auto-clears when all tasks finish.
4. Create a new goal for each distinct objective.
5. Skip todos for trivial single-step work.`,

    parameters: {
      type: "object",
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: ["create", "update", "delete", "list"],
          description: "The todo operation to perform.",
        },
        goal: {
          type: "string",
          description: "A short description of the goal (required for 'create').",
        },
        items: {
          type: "array",
          description: "Tasks to create under the goal (required for 'create').",
          items: {
            type: "object",
            required: ["content"],
            properties: {
              content: { type: "string", description: "Description of the task." },
            },
          },
        },
        id: {
          type: "string",
          description: "Task ID to update or delete.",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: "New task status (for 'update').",
        },
        content: {
          type: "string",
          description: "New task description (for 'update').",
        },
      },
    },

    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>
      const operation = typeof p.operation === "string" ? p.operation : undefined
      if (!operation) return err("Missing required parameter: operation")

      switch (operation) {
        // ── list ────────────────────────────────────────────────────────────
        case "list": {
          return ok("list", threadId)
        }

        // ── create ──────────────────────────────────────────────────────────
        case "create": {
          const goalDesc = typeof p.goal === "string" ? p.goal.trim() : ""
          if (!goalDesc) return err("'create' requires a non-empty 'goal' string.")

          const rawItems = p.items
          if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return err("'create' requires a non-empty 'items' array.")
          }

          const goalSortOrder = countGoalsByThread(threadId)
          const goalId = insertGoal(threadId, goalDesc, goalSortOrder)

          let created = 0
          for (const item of rawItems as { content?: unknown }[]) {
            if (typeof item.content !== "string" || !item.content.trim()) continue
            insertTodo(threadId, item.content.trim(), goalId, created)
            created++
          }

          if (created === 0) {
            return err("No valid tasks to create. Each item needs a non-empty 'content' string.")
          }

          return ok(
            "create",
            threadId,
            `Goal "${goalDesc}" created with ${created} task${created === 1 ? "" : "s"}.`,
          )
        }

        // ── update ──────────────────────────────────────────────────────────
        case "update": {
          const id = typeof p.id === "string" ? p.id.trim() : null
          if (!id) return err("'update' requires an 'id'.")

          const task = getTodo(id)
          if (!task) return err(`No task with id "${id}".`)

          const updates: { content?: string; status?: TodoStatus } = {}

          if (typeof p.status === "string") {
            const s = p.status as TodoStatus
            if (!["pending", "in_progress", "completed"].includes(s)) {
              return err("'status' must be one of: pending, in_progress, completed.")
            }
            updates.status = s
          }

          if (typeof p.content === "string" && p.content.trim()) {
            updates.content = p.content.trim()
          }

          if (Object.keys(updates).length === 0) {
            return err("'update' requires at least one of 'status' or 'content'.")
          }

          updateTodo(id, updates)

          // When the last task of a goal is marked completed, capture the
          // all-done snapshot, wipe the goal from DB, and return that snapshot
          // so the UI displays the completed state before clearing.
          if (updates.status === "completed" && task.goalId) {
            const finalSnapshot = tryFinalizeGoal(task.goalId, threadId)
            if (finalSnapshot) {
              return respond("update", finalSnapshot, "All tasks done — goal cleared.")
            }
          }

          return ok("update", threadId, "Task updated.")
        }

        // ── delete ──────────────────────────────────────────────────────────
        case "delete": {
          const id = typeof p.id === "string" ? p.id.trim() : null
          if (!id) return err("'delete' requires an 'id'.")

          const task = getTodo(id)
          if (!task) return err(`No task with id "${id}".`)

          deleteTodo(id)

          // If deleting this task leaves only completed tasks, finalize the goal.
          if (task.goalId) {
            const finalSnapshot = tryFinalizeGoal(task.goalId, threadId)
            if (finalSnapshot) {
              return respond("delete", finalSnapshot, "Task deleted — goal cleared.")
            }
          }

          return ok("delete", threadId, "Task deleted.")
        }

        default:
          return err(`Unknown operation "${operation}". Use: create, update, delete, list.`)
      }
    },
  }
}
