import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { workspaces, threads } from "../schema.js"

export function listWorkspacesWithThreads() {
  const ws = db.select().from(workspaces).all()
  const th = db.select().from(threads).all()
  return ws
    .map((w) => ({
      ...w,
      threads: th
        .filter((t) => t.workspaceId === w.id && !t.isArchived)
        .sort((a, b) => {
          // Pinned threads first
          if (a.isPinned && !b.isPinned) return -1
          if (!a.isPinned && b.isPinned) return 1
          // Then by creation time
          return a.createdAt - b.createdAt
        }),
    }))
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return a.createdAt - b.createdAt
    })
}

export function getWorkspace(id: string) {
  return db.select().from(workspaces).where(eq(workspaces.id, id)).get()
}

export function getWorkspaceByPath(path: string) {
  return db.select().from(workspaces).where(eq(workspaces.path, path)).get()
}

export function insertWorkspace(name: string, path: string): string {
  const id = randomUUID()
  db.insert(workspaces)
    .values({ id, name, path, createdAt: Date.now() })
    .run()
  return id
}

export function updateWorkspaceOpenWithApp(id: string, openWithAppId: string | null) {
  db.update(workspaces).set({ openWithAppId }).where(eq(workspaces.id, id)).run()
}

export function updateWorkspaceIcon(id: string, iconPath: string | null) {
  db.update(workspaces).set({ icon: iconPath }).where(eq(workspaces.id, id)).run()
}

export function updateWorkspaceEnv(id: string, env: Record<string, string> | null) {
  db.update(workspaces).set({ env: env ? JSON.stringify(env) : null }).where(eq(workspaces.id, id)).run()
}

export function pinWorkspace(id: string) {
  db.update(workspaces).set({ isPinned: true }).where(eq(workspaces.id, id)).run()
}

export function unpinWorkspace(id: string) {
  db.update(workspaces).set({ isPinned: false }).where(eq(workspaces.id, id)).run()
}

export function deleteWorkspace(id: string) {
  db.delete(workspaces).where(eq(workspaces.id, id)).run()
}

export function deleteAllWorkspaces() {
  db.delete(workspaces).run()
}
