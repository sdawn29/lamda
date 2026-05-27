import { randomUUID } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { db } from "../client.js"
import { threadTodoGoals, threadTodos } from "../schema.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed"
export type GoalStatus = "active" | "completed"

export interface GoalRow {
  id: string
  threadId: string
  description: string
  status: GoalStatus
  sortOrder: number
  createdAt: number
}

export interface TodoRow {
  id: string
  threadId: string
  goalId: string | null
  content: string
  status: TodoStatus
  sortOrder: number
  createdAt: number
}

export interface GoalWithTasks {
  goal: GoalRow
  tasks: TodoRow[]
}

// ── Goal queries ──────────────────────────────────────────────────────────────

export function insertGoal(threadId: string, description: string, sortOrder = 0): string {
  const id = randomUUID()
  db.insert(threadTodoGoals)
    .values({ id, threadId, description, status: "active", sortOrder, createdAt: Date.now() })
    .run()
  return id
}

/**
 * Delete a goal and all its tasks in one operation.
 * Tasks are deleted first (no DB-level cascade on goal_id).
 */
export function deleteGoalWithTasks(goalId: string): void {
  db.delete(threadTodos).where(eq(threadTodos.goalId, goalId)).run()
  db.delete(threadTodoGoals).where(eq(threadTodoGoals.id, goalId)).run()
}

export function countGoalsByThread(threadId: string): number {
  return (
    db.select().from(threadTodoGoals).where(eq(threadTodoGoals.threadId, threadId)).all().length
  )
}

// ── Todo queries ──────────────────────────────────────────────────────────────

export function insertTodo(
  threadId: string,
  content: string,
  goalId: string | null = null,
  sortOrder = 0,
): string {
  const id = randomUUID()
  db.insert(threadTodos)
    .values({ id, threadId, goalId, content, status: "pending", sortOrder, createdAt: Date.now() })
    .run()
  return id
}

export function updateTodo(
  id: string,
  updates: { content?: string; status?: TodoStatus },
): void {
  if (Object.keys(updates).length === 0) return
  db.update(threadTodos).set(updates).where(eq(threadTodos.id, id)).run()
}

export function getTodo(id: string): TodoRow | undefined {
  return db.select().from(threadTodos).where(eq(threadTodos.id, id)).get() as TodoRow | undefined
}

export function listTodosByGoal(goalId: string): TodoRow[] {
  return db
    .select()
    .from(threadTodos)
    .where(eq(threadTodos.goalId, goalId))
    .orderBy(asc(threadTodos.sortOrder), asc(threadTodos.createdAt))
    .all() as TodoRow[]
}

export function deleteTodo(id: string): void {
  db.delete(threadTodos).where(eq(threadTodos.id, id)).run()
}

// ── Combined queries ──────────────────────────────────────────────────────────

export function listGoalsWithTasks(threadId: string): GoalWithTasks[] {
  const goals = db
    .select()
    .from(threadTodoGoals)
    .where(eq(threadTodoGoals.threadId, threadId))
    .orderBy(asc(threadTodoGoals.sortOrder), asc(threadTodoGoals.createdAt))
    .all() as GoalRow[]

  const tasks = db
    .select()
    .from(threadTodos)
    .where(eq(threadTodos.threadId, threadId))
    .orderBy(asc(threadTodos.sortOrder), asc(threadTodos.createdAt))
    .all() as TodoRow[]

  return goals.map((goal) => ({
    goal,
    tasks: tasks.filter((t) => t.goalId === goal.id),
  }))
}
