import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { workspaceFiles } from "../schema.js"

export interface WorkspaceFileEntry {
  relativePath: string
  name: string
  isDirectory: boolean
}

const CHUNK_SIZE = 200

export function replaceWorkspaceFiles(workspaceId: string, files: WorkspaceFileEntry[]): void {
  db.transaction(() => {
    db.delete(workspaceFiles).where(eq(workspaceFiles.workspaceId, workspaceId)).run()
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE)
      db.insert(workspaceFiles)
        .values(chunk.map((f) => ({ workspaceId, relativePath: f.relativePath, name: f.name, isDirectory: f.isDirectory })))
        .onConflictDoNothing()
        .run()
    }
  })
}

export function listWorkspaceFileEntries(workspaceId: string): WorkspaceFileEntry[] {
  return db
    .select({ relativePath: workspaceFiles.relativePath, name: workspaceFiles.name, isDirectory: workspaceFiles.isDirectory })
    .from(workspaceFiles)
    .where(eq(workspaceFiles.workspaceId, workspaceId))
    .all()
}

export function clearWorkspaceFileEntries(workspaceId: string): void {
  db.delete(workspaceFiles).where(eq(workspaceFiles.workspaceId, workspaceId)).run()
}

export function hasWorkspaceFileIndex(workspaceId: string): boolean {
  const row = db
    .select({ relativePath: workspaceFiles.relativePath })
    .from(workspaceFiles)
    .where(eq(workspaceFiles.workspaceId, workspaceId))
    .limit(1)
    .get()
  return row !== undefined
}
