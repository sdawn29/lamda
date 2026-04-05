import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { threads } from "../schema.js"

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

export function deleteThread(id: string) {
  db.delete(threads).where(eq(threads.id, id)).run()
}
