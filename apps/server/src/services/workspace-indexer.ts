import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  listWorkspaceFileEntries,
  replaceWorkspaceFiles,
  type WorkspaceFileEntry,
} from "@lamda/db";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";

const EXCLUDED_DIRS = new Set([
  ".git",
]);

const FLUSH_DEBOUNCE_MS = 150;

interface WorkspaceState {
  path: string;
  index: Map<string, WorkspaceFileEntry>;
  watcher: FSWatcher | null;
  pendingPaths: Set<string>;
  pendingFullScan: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  scanInProgress: boolean;
  flushInProgress: boolean;
  lastAccessedAt: number;
}

const IDLE_WORKSPACE_TTL_MS = 30 * 60 * 1000;

class WorkspaceIndexer {
  private workspaces = new Map<string, WorkspaceState>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [wsId, state] of this.workspaces) {
        if (now - state.lastAccessedAt > IDLE_WORKSPACE_TTL_MS) {
          this.stopIndexing(wsId);
        }
      }
    }, 10 * 60 * 1000).unref();
  }

  /**
   * Begin tracking a workspace. Returns immediately after hydrating the in-memory
   * cache from the DB snapshot; a fresh full scan runs in the background and
   * broadcasts when it completes. Safe to call repeatedly.
   */
  startIndexing(workspaceId: string, workspacePath: string): void {
    const existing = this.workspaces.get(workspaceId);
    if (existing) {
      if (existing.path === workspacePath) {
        this.queueFullScan(workspaceId, existing);
        return;
      }
      this.stopIndexing(workspaceId);
    }

    const state: WorkspaceState = {
      path: workspacePath,
      index: new Map(),
      watcher: null,
      pendingPaths: new Set(),
      pendingFullScan: false,
      flushTimer: null,
      scanInProgress: false,
      flushInProgress: false,
      lastAccessedAt: Date.now(),
    };

    for (const entry of listWorkspaceFileEntries(workspaceId)) {
      state.index.set(entry.relativePath, entry);
    }

    this.workspaces.set(workspaceId, state);
    this.attachWatcher(workspaceId, state);
    this.queueFullScan(workspaceId, state);
  }

  /**
   * Convenience: start if not running, or trigger a refresh if already running.
   */
  ensureIndexing(workspaceId: string, workspacePath: string): void {
    this.startIndexing(workspaceId, workspacePath);
  }

  stopIndexing(workspaceId: string): void {
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    if (state.flushTimer) clearTimeout(state.flushTimer);
    if (state.watcher) {
      try {
        state.watcher.close();
      } catch {}
    }
    this.workspaces.delete(workspaceId);
    // Shut down any LSP servers spawned for this workspace.
    void import("./language-service.js")
      .then((m) => m.shutdownWorkspace(workspaceId))
      .catch((err) => console.warn(`[workspace-indexer] LSP shutdown failed:`, err));
  }

  async reindex(workspaceId: string): Promise<void> {
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    await this.fullScan(workspaceId, state);
    workspaceIndexBroadcaster.broadcast(workspaceId);
  }

  listFiles(workspaceId: string): WorkspaceFileEntry[] {
    const state = this.workspaces.get(workspaceId);
    if (!state) return listWorkspaceFileEntries(workspaceId);
    state.lastAccessedAt = Date.now();
    return Array.from(state.index.values());
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private isExcluded(rel: string): boolean {
    if (!rel) return true;
    return rel.split("/").some((p) => EXCLUDED_DIRS.has(p));
  }

  private queueFullScan(workspaceId: string, state: WorkspaceState): void {
    state.pendingFullScan = true;
    if (state.flushTimer) return;
    this.scheduleFlush(workspaceId, state, 0);
  }

  private attachWatcher(workspaceId: string, state: WorkspaceState): void {
    try {
      const watcher = watch(
        state.path,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename) {
            state.pendingFullScan = true;
          } else {
            const rel = filename.split(sep).join("/");
            if (this.isExcluded(rel)) return;
            state.pendingPaths.add(rel);
          }
          this.scheduleFlush(workspaceId, state, FLUSH_DEBOUNCE_MS);
        },
      );
      watcher.on("error", (err) => {
        console.error(`[workspace-indexer] watcher error for ${workspaceId}:`, err);
      });
      state.watcher = watcher;
    } catch (err) {
      console.error(`[workspace-indexer] could not watch ${state.path}:`, err);
    }
  }

  private scheduleFlush(
    workspaceId: string,
    state: WorkspaceState,
    delay: number,
  ): void {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      this.flush(workspaceId, state).catch((err) =>
        console.error(`[workspace-indexer] flush failed for ${workspaceId}:`, err),
      );
    }, delay);
  }

  private async flush(workspaceId: string, state: WorkspaceState): Promise<void> {
    if (state.flushInProgress) {
      this.scheduleFlush(workspaceId, state, FLUSH_DEBOUNCE_MS);
      return;
    }
    state.flushInProgress = true;
    try {
      const wantsFullScan = state.pendingFullScan;
      const pending = Array.from(state.pendingPaths);
      state.pendingFullScan = false;
      state.pendingPaths.clear();

      if (wantsFullScan) {
        const changed = await this.fullScan(workspaceId, state);
        if (changed) workspaceIndexBroadcaster.broadcast(workspaceId);
      } else if (pending.length > 0) {
        const changed = await this.applyDelta(workspaceId, state, pending);
        if (changed) workspaceIndexBroadcaster.broadcast(workspaceId);
      }
    } finally {
      state.flushInProgress = false;
      if (state.pendingFullScan || state.pendingPaths.size > 0) {
        this.scheduleFlush(workspaceId, state, FLUSH_DEBOUNCE_MS);
      }
    }
  }

  private async fullScan(workspaceId: string, state: WorkspaceState): Promise<boolean> {
    if (state.scanInProgress) return false;
    state.scanInProgress = true;
    try {
      const newIndex = new Map<string, WorkspaceFileEntry>();
      let raw: import("node:fs").Dirent[];
      try {
        raw = await readdir(state.path, { withFileTypes: true, recursive: true });
      } catch (err) {
        console.error(`[workspace-indexer] readdir failed for ${state.path}:`, err);
        return false;
      }

      for (const entry of raw) {
        const fullPath = join(entry.parentPath, entry.name);
        const rel = relative(state.path, fullPath).split(sep).join("/");
        if (!rel || this.isExcluded(rel)) continue;
        if (entry.isDirectory()) {
          newIndex.set(rel, { relativePath: rel, name: entry.name, isDirectory: true });
        } else if (entry.isFile()) {
          newIndex.set(rel, { relativePath: rel, name: entry.name, isDirectory: false });
        }
      }

      const changed = !indexesEqual(state.index, newIndex);
      state.index = newIndex;
      if (changed) {
        replaceWorkspaceFiles(workspaceId, Array.from(newIndex.values()));
      }
      return changed;
    } catch (err) {
      console.error(`[workspace-indexer] full scan failed for ${workspaceId}:`, err);
      return false;
    } finally {
      state.scanInProgress = false;
    }
  }

  private async applyDelta(
    workspaceId: string,
    state: WorkspaceState,
    paths: string[],
  ): Promise<boolean> {
    let changed = false;

    for (const rel of paths) {
      if (this.isExcluded(rel)) continue;
      const fullPath = join(state.path, rel);
      let s;
      try {
        s = await stat(fullPath);
      } catch {
        if (this.removeSubtree(state, rel)) changed = true;
        continue;
      }

      const name = rel.split("/").pop() ?? rel;

      if (s.isDirectory()) {
        const existing = state.index.get(rel);
        if (!existing || !existing.isDirectory) {
          state.index.set(rel, { relativePath: rel, name, isDirectory: true });
          changed = true;
        }
        // Walk newly-added directories to capture descendants the watcher
        // may not surface as individual events.
        if (await this.scanDirectory(state, fullPath, rel)) {
          changed = true;
        }
      } else if (s.isFile()) {
        const existing = state.index.get(rel);
        if (!existing || existing.isDirectory) {
          state.index.set(rel, { relativePath: rel, name, isDirectory: false });
          changed = true;
        }
      }
    }

    if (changed) {
      replaceWorkspaceFiles(workspaceId, Array.from(state.index.values()));
    }
    return changed;
  }

  private async scanDirectory(
    state: WorkspaceState,
    fullDirPath: string,
    relDirPath: string,
  ): Promise<boolean> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(fullDirPath, { withFileTypes: true, recursive: true });
    } catch {
      return false;
    }
    let changed = false;
    for (const entry of entries) {
      const childFullPath = join(entry.parentPath, entry.name);
      const childRelInDir = relative(fullDirPath, childFullPath).split(sep).join("/");
      const childRel = childRelInDir ? `${relDirPath}/${childRelInDir}` : relDirPath;
      if (this.isExcluded(childRel)) continue;
      const isDir = entry.isDirectory();
      const isFile = entry.isFile();
      if (!isDir && !isFile) continue;
      const existing = state.index.get(childRel);
      if (!existing || existing.isDirectory !== isDir) {
        state.index.set(childRel, {
          relativePath: childRel,
          name: entry.name,
          isDirectory: isDir,
        });
        changed = true;
      }
    }
    return changed;
  }

  private removeSubtree(state: WorkspaceState, rel: string): boolean {
    let removed = state.index.delete(rel);
    const prefix = `${rel}/`;
    for (const key of state.index.keys()) {
      if (key.startsWith(prefix)) {
        state.index.delete(key);
        removed = true;
      }
    }
    return removed;
  }
}

function indexesEqual(
  a: Map<string, WorkspaceFileEntry>,
  b: Map<string, WorkspaceFileEntry>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other || other.isDirectory !== value.isDirectory || other.name !== value.name) {
      return false;
    }
  }
  return true;
}

export const workspaceIndexer = new WorkspaceIndexer();
