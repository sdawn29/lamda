import { randomUUID } from "node:crypto"
import { eq, and, ne } from "drizzle-orm"
import { db } from "../client.js"
import { threads, workspaces } from "../schema.js"

export function insertThread(workspaceId: string): string {
  const id = randomUUID()
  db.insert(threads)
    .values({ id, workspaceId, title: "New Thread", createdAt: Date.now() })
    .run()
  return id
}

export function getThread(id: string) {
  return db.select().from(threads).where(eq(threads.id, id)).get()
}

export function updateThreadTitle(id: string, title: string) {
  db.update(threads).set({ title }).where(eq(threads.id, id)).run()
}

export function updateThreadSessionFile(id: string, sessionFile: string) {
  db.update(threads).set({ sessionFile }).where(eq(threads.id, id)).run()
}

export function updateThreadModel(id: string, modelId: string | null) {
  db.update(threads).set({ modelId }).where(eq(threads.id, id)).run()
}

export function updateThreadStopped(id: string, isStopped: boolean) {
  db.update(threads).set({ isStopped }).where(eq(threads.id, id)).run()
}

export function updateThreadLastAccessed(id: string) {
  db.update(threads).set({ lastAccessedAt: Date.now() }).where(eq(threads.id, id)).run()
}

export function archiveThread(id: string) {
  db.update(threads).set({ isArchived: true }).where(eq(threads.id, id)).run()
}

export function unarchiveThread(id: string) {
  db.update(threads).set({ isArchived: false }).where(eq(threads.id, id)).run()
}

export function pinThread(id: string) {
  db.update(threads).set({ isPinned: true }).where(eq(threads.id, id)).run()
}

export function unpinThread(id: string) {
  db.update(threads).set({ isPinned: false }).where(eq(threads.id, id)).run()
}

export function listArchivedThreadsWithWorkspace() {
  return db
    .select({
      id: threads.id,
      workspaceId: threads.workspaceId,
      workspaceName: workspaces.name,
      workspacePath: workspaces.path,
      title: threads.title,
      modelId: threads.modelId,
      isStopped: threads.isStopped,
      isArchived: threads.isArchived,
      sessionFile: threads.sessionFile,
      lastAccessedAt: threads.lastAccessedAt,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .innerJoin(workspaces, eq(threads.workspaceId, workspaces.id))
    .where(eq(threads.isArchived, true))
    .all()
}

export function deleteThread(id: string) {
  db.delete(threads).where(eq(threads.id, id)).run()
}
