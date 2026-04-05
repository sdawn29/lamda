import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { workspaces, threads } from "../schema.js"

export function listWorkspacesWithThreads() {
  const ws = db.select().from(workspaces).all()
  const th = db.select().from(threads).all()
  return ws.map((w) => ({
    ...w,
    threads: th
      .filter((t) => t.workspaceId === w.id)
      .sort((a, b) => a.createdAt - b.createdAt),
  }))
}

export function getWorkspace(id: string) {
  return db.select().from(workspaces).where(eq(workspaces.id, id)).get()
}

export function insertWorkspace(name: string, path: string): string {
  const id = randomUUID()
  db.insert(workspaces)
    .values({ id, name, path, createdAt: Date.now() })
    .run()
  return id
}

export function deleteWorkspace(id: string) {
  db.delete(workspaces).where(eq(workspaces.id, id)).run()
}

export function deleteAllWorkspaces() {
  db.delete(workspaces).run()
}
