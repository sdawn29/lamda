import { writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { dbPath, type AttachmentMetadata } from "@lamda/db";

const ATTACHMENTS_DIR_NAME = "attachments";
const APP_DATA_DIR = join(homedir(), ".lamda");

/**
 * Get the attachments directory path.
 */
function getAttachmentsDir(): string {
  return join(APP_DATA_DIR, ATTACHMENTS_DIR_NAME);
}

/**
 * Remove every on-disk artifact under the app data dir (`~/.lamda`) — stored
 * attachments, managed worktrees, prompt templates, etc. — while preserving the
 * live SQLite database files. The database is held open by the running server
 * and is already emptied logically by the caller (`deleteAllWorkspaces()`), so
 * we leave `db.sqlite` and its `-wal`/`-shm` sidecars in place rather than risk
 * corrupting the open connection. Used by the "Delete all data" reset.
 */
export async function clearAppDataDir(): Promise<void> {
  const dbBasename = basename(dbPath);
  const preserve = new Set([
    dbBasename,
    `${dbBasename}-wal`,
    `${dbBasename}-shm`,
    `${dbBasename}-journal`,
  ]);

  let entries: string[];
  try {
    entries = await readdir(APP_DATA_DIR);
  } catch {
    // Data dir doesn't exist yet — nothing to clear.
    return;
  }

  await Promise.all(
    entries
      .filter((name) => !preserve.has(name))
      .map((name) =>
        rm(join(APP_DATA_DIR, name), { recursive: true, force: true }),
      ),
  );
}

/**
 * Directory holding a single thread's attachments.
 */
export function threadAttachmentDir(threadId: string): string {
  return join(getAttachmentsDir(), threadId);
}

/**
 * Derive a filesystem-safe extension from the original filename (preferred) or
 * the MIME type. Returns an extension WITHOUT the leading dot, or "" if none.
 */
function deriveExtension(filename: string, mediaType: string): string {
  const fromName = extname(filename).replace(/^\./, "").toLowerCase();
  if (fromName) return fromName.replace(/[^a-z0-9]/g, "");
  // Fall back to a coarse mime → extension guess.
  const subtype = mediaType.split("/")[1]?.split(";")[0]?.toLowerCase();
  return subtype ? subtype.replace(/[^a-z0-9]/g, "") : "";
}

/**
 * Write an attachment file and return its metadata. Supports any file format —
 * the original extension is preserved so the file can be served back later.
 * @param threadId The thread ID for organizing attachments
 * @param filename The original filename
 * @param mediaType The MIME type of the file
 * @param data The base64-encoded file data
 * @param kind The attachment kind ("image" | "text" | "file")
 * @returns Attachment metadata (with the absolute on-disk path)
 */
export async function writeAttachment(
  threadId: string,
  filename: string,
  mediaType: string,
  data: string,
  kind: "image" | "text" | "file",
  attachmentId?: string
): Promise<AttachmentMetadata & { path: string }> {
  const id = attachmentId || randomUUID();
  const ext = deriveExtension(filename, mediaType);

  // Ensure thread-specific directory exists
  const threadDir = threadAttachmentDir(threadId);
  await mkdir(threadDir, { recursive: true });

  // Decode base64 and write file, preserving the original extension.
  const storedName = ext ? `${id}.${ext}` : id;
  const filePath = join(threadDir, storedName);
  const buffer = Buffer.from(data, "base64");
  await writeFile(filePath, buffer);

  return {
    id,
    filename,
    mediaType,
    size: buffer.length,
    kind,
    createdAt: Date.now(),
    path: filePath,
  };
}

/**
 * Locate a stored attachment by id, regardless of its extension. Returns the
 * absolute path, or null when no matching file exists.
 */
export async function findAttachmentFile(
  threadId: string,
  attachmentId: string
): Promise<string | null> {
  try {
    const dir = threadAttachmentDir(threadId);
    const entries = await readdir(dir);
    const match = entries.find(
      (name) => name === attachmentId || name.startsWith(`${attachmentId}.`)
    );
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}
