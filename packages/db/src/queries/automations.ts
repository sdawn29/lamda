import { and, desc, eq } from "drizzle-orm"
import { db } from "../client.js"
import { automations, automationRuns } from "../schema.js"

export type AutomationApprovalMode = "ask" | "edits_allowed" | "all_allowed"
export type AutomationStatus = "ok" | "error" | "running"

export interface DbAutomation {
  id: string
  workspaceId: string
  name: string
  prompt: string
  cron: string
  modelId: string | null
  mode: string
  approvalMode: AutomationApprovalMode
  threadId: string | null
  useWorktree: boolean
  enabled: boolean
  lastRunAt: number | null
  lastStatus: AutomationStatus | null
  lastError: string | null
  createdAt: number
}

export interface DbAutomationRun {
  id: string
  automationId: string
  threadId: string | null
  startedAt: number
  finishedAt: number | null
  status: "running" | "ok" | "error"
  error: string | null
  trigger: "scheduled" | "manual"
}

export interface CreateAutomationInput {
  name: string
  prompt: string
  cron: string
  modelId?: string | null
  mode?: string
  approvalMode?: AutomationApprovalMode
  useWorktree?: boolean
  enabled?: boolean
}

export type UpdateAutomationInput = Partial<CreateAutomationInput> & {
  threadId?: string | null
}

export function getAutomations(workspaceId: string): DbAutomation[] {
  return db
    .select()
    .from(automations)
    .where(eq(automations.workspaceId, workspaceId))
    .orderBy(automations.createdAt)
    .all()
}

export function getAutomation(id: string): DbAutomation | undefined {
  return db.select().from(automations).where(eq(automations.id, id)).get()
}

/** Every automation across all workspaces, newest first. */
export function getAllAutomations(): DbAutomation[] {
  return db.select().from(automations).orderBy(desc(automations.createdAt)).all()
}

/** All enabled automations across every workspace — used to seed the scheduler. */
export function listEnabledAutomations(): DbAutomation[] {
  return db
    .select()
    .from(automations)
    .where(eq(automations.enabled, true))
    .all()
}

export function createAutomation(
  workspaceId: string,
  input: CreateAutomationInput,
): DbAutomation {
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const row = {
    id,
    workspaceId,
    name: input.name,
    prompt: input.prompt,
    cron: input.cron,
    modelId: input.modelId ?? null,
    mode: input.mode ?? "agent",
    approvalMode: input.approvalMode ?? "all_allowed",
    threadId: null,
    useWorktree: input.useWorktree ?? true,
    enabled: input.enabled ?? true,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt,
  } satisfies DbAutomation
  db.insert(automations).values(row).run()
  return row
}

export function updateAutomation(id: string, updates: UpdateAutomationInput): void {
  const set: Record<string, unknown> = {}
  if (updates.name !== undefined) set.name = updates.name
  if (updates.prompt !== undefined) set.prompt = updates.prompt
  if (updates.cron !== undefined) set.cron = updates.cron
  if (updates.modelId !== undefined) set.modelId = updates.modelId
  if (updates.mode !== undefined) set.mode = updates.mode
  if (updates.approvalMode !== undefined) set.approvalMode = updates.approvalMode
  if (updates.useWorktree !== undefined) set.useWorktree = updates.useWorktree
  if (updates.enabled !== undefined) set.enabled = updates.enabled
  if (updates.threadId !== undefined) set.threadId = updates.threadId
  if (Object.keys(set).length === 0) return
  db.update(automations).set(set).where(eq(automations.id, id)).run()
}

export function deleteAutomation(id: string): void {
  db.delete(automations).where(eq(automations.id, id)).run()
}

/** Persist the dedicated thread created lazily on an automation's first run. */
export function setAutomationThread(id: string, threadId: string): void {
  db.update(automations).set({ threadId }).where(eq(automations.id, id)).run()
}

/** Open a run row and mark the automation as running. Returns the run id. */
export function startAutomationRun(
  automationId: string,
  trigger: "scheduled" | "manual",
  threadId: string | null,
): string {
  const id = crypto.randomUUID()
  const startedAt = Date.now()
  db.insert(automationRuns)
    .values({ id, automationId, threadId, startedAt, status: "running", trigger })
    .run()
  db.update(automations)
    .set({ lastStatus: "running", lastRunAt: startedAt, lastError: null })
    .where(eq(automations.id, automationId))
    .run()
  return id
}

/** Close a run row and record the outcome on the parent automation. */
export function finishAutomationRun(
  runId: string,
  automationId: string,
  status: "ok" | "error",
  error: string | null,
  threadId: string | null,
): void {
  const finishedAt = Date.now()
  db.update(automationRuns)
    .set({ finishedAt, status, error, ...(threadId ? { threadId } : {}) })
    .where(eq(automationRuns.id, runId))
    .run()
  db.update(automations)
    .set({ lastStatus: status, lastError: error })
    .where(eq(automations.id, automationId))
    .run()
}

export function getAutomationRuns(
  automationId: string,
  limit = 50,
): DbAutomationRun[] {
  return db
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.automationId, automationId))
    .orderBy(desc(automationRuns.startedAt))
    .limit(limit)
    .all()
}

/** True if a run is already in flight for this automation (concurrency guard). */
export function hasActiveRun(automationId: string): boolean {
  const row = db
    .select({ id: automationRuns.id })
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.automationId, automationId),
        eq(automationRuns.status, "running"),
      ),
    )
    .get()
  return !!row
}
