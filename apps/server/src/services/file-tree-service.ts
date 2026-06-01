import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceFileEntry } from "@lamda/db";
import { workspaceDirBroadcaster } from "../workspace-dir-broadcaster.js";

const DEBOUNCE_MS = 150;
const WATCHER_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

interface DirWatch {
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | null;
  lastAccessedAt: number;
}

/**
 * Lazy, on-demand file tree. Reads a single directory's immediate children at a
 * time (O(dir), never O(repo)) and attaches a non-recursive watcher per directory
 * that has been read. When a watched directory changes, it broadcasts a scoped
 * event so the renderer can refetch just that subtree. Watchers self-evict after
 * an idle TTL, so `node_modules` is only ever read or watched if the user opens it.
 */
class FileTreeService {
  // key: `${workspaceId}\0${relPath}`
  private watches = new Map<string, DirWatch>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, w] of this.watches) {
        if (now - w.lastAccessedAt > WATCHER_TTL_MS) {
          this.closeWatch(key, w);
        }
      }
    }, SWEEP_INTERVAL_MS).unref();
  }

  /** Reads the immediate children of one directory, sorted dirs-first then by name. */
  async readDir(
    workspacePath: string,
    relPath: string,
  ): Promise<WorkspaceFileEntry[]> {
    const abs = relPath ? join(workspacePath, relPath) : workspacePath;
    const dirents = await readdir(abs, { withFileTypes: true });

    const entries: WorkspaceFileEntry[] = [];
    for (const d of dirents) {
      // Hide the internal git database (matches prior tree behavior and avoids
      // noisy watcher churn); everything else — including node_modules — is
      // browsable on demand.
      if (d.name === ".git") continue;
      const isDirectory = d.isDirectory();
      if (!isDirectory && !d.isFile()) continue;
      const childRel = relPath ? `${relPath}/${d.name}` : d.name;
      entries.push({ relativePath: childRel, name: d.name, isDirectory });
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  /** Ensures a non-recursive watcher exists for a directory; refreshes its TTL. */
  watchDir(workspaceId: string, workspacePath: string, relPath: string): void {
    const key = `${workspaceId}\0${relPath}`;
    const existing = this.watches.get(key);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      return;
    }

    const abs = relPath ? join(workspacePath, relPath) : workspacePath;
    let watcher: FSWatcher;
    try {
      watcher = watch(abs, { recursive: false, persistent: false }, () => {
        const w = this.watches.get(key);
        if (!w || w.timer) return;
        w.timer = setTimeout(() => {
          w.timer = null;
          workspaceDirBroadcaster.broadcast(workspaceId, relPath);
        }, DEBOUNCE_MS);
      });
    } catch {
      // Directory vanished or is unreadable — nothing to watch.
      return;
    }
    watcher.on("error", () => {});
    this.watches.set(key, {
      watcher,
      timer: null,
      lastAccessedAt: Date.now(),
    });
  }

  /** Tears down every watcher for a workspace (called when it closes). */
  stopWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}\0`;
    for (const [key, w] of this.watches) {
      if (key.startsWith(prefix)) this.closeWatch(key, w);
    }
  }

  private closeWatch(key: string, w: DirWatch): void {
    if (w.timer) clearTimeout(w.timer);
    try {
      w.watcher.close();
    } catch {}
    this.watches.delete(key);
  }
}

export const fileTreeService = new FileTreeService();
