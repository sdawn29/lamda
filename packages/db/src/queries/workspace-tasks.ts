import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { workspaceTasks } from "../schema.js"

export interface DbWorkspaceTask {
  id: string
  workspaceId: string
  icon: string | null
  command: string
  createdAt: number
}

export function getWorkspaceTasks(workspaceId: string): DbWorkspaceTask[] {
  return db
    .select()
    .from(workspaceTasks)
    .where(eq(workspaceTasks.workspaceId, workspaceId))
    .orderBy(workspaceTasks.createdAt)
    .all()
}

export function createWorkspaceTask(
  workspaceId: string,
  task: { icon?: string; command: string }
): DbWorkspaceTask {
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  db.insert(workspaceTasks)
    .values({ id, workspaceId, icon: task.icon ?? null, command: task.command, createdAt })
    .run()
  return { id, workspaceId, icon: task.icon ?? null, command: task.command, createdAt }
}

export function updateWorkspaceTask(
  workspaceId: string,
  id: string,
  updates: { icon?: string; command?: string }
): void {
  db.update(workspaceTasks)
    .set({
      ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
      ...(updates.command !== undefined ? { command: updates.command } : {}),
    })
    .where(eq(workspaceTasks.id, id))
    .run()
}

export function deleteWorkspaceTask(workspaceId: string, id: string): void {
  db.delete(workspaceTasks).where(eq(workspaceTasks.id, id)).run()
}
