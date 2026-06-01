import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  listWorkspaceFileEntries,
  replaceWorkspaceFiles,
  type WorkspaceFileEntry,
} from "@lamda/db";
import { isGitRepo, listWorkspaceFiles } from "@lamda/git";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";
import { gitStatusBroadcaster } from "../git-status-broadcaster.js";

// Directories never worth indexing for fuzzy search. `git ls-files` already
// honors .gitignore, so these only matter for the non-git fallback scan and for
// cheaply discarding watcher events.
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".next",
  "out",
  ".cache",
]);

const REFRESH_DEBOUNCE_MS = 300;
const GIT_STATUS_DEBOUNCE_MS = 150;
const IDLE_WORKSPACE_TTL_MS = 30 * 60 * 1000;
const MAX_FALLBACK_ENTRIES = 50_000;

interface WorkspaceState {
  path: string;
  entries: WorkspaceFileEntry[];
  // Recursive root watcher used ONLY to refresh the flat search index and to
  // trigger git-status broadcasts. The tree itself is watched per-directory by
  // file-tree-service. Events for ignored paths are discarded with a string
  // check before any work happens.
  watcher: FSWatcher | null;
  gitWatcher: FSWatcher | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  gitStatusTimer: ReturnType<typeof setTimeout> | null;
  refreshInProgress: boolean;
  refreshQueued: boolean;
  lastAccessedAt: number;
}

/**
 * Maintains a flat, fuzzy-searchable file index per workspace, used by Cmd+P and
 * @-mentions (NOT by the file tree, which is lazy). The list is sourced from
 * `git ls-files` so .gitignore is respected for free; non-git workspaces fall
 * back to a filtered recursive scan. Directory entries are synthesized from file
 * paths so directory mentions still work.
 */
class WorkspaceIndexer {
  private workspaces = new Map<string, WorkspaceState>();

  constructor() {
    setInterval(
      () => {
        const now = Date.now();
        for (const [wsId, state] of this.workspaces) {
          if (now - state.lastAccessedAt > IDLE_WORKSPACE_TTL_MS) {
            this.stopIndexing(wsId);
          }
        }
      },
      10 * 60 * 1000,
    ).unref();
  }

  /**
   * Begin tracking a workspace. Hydrates the in-memory list from the DB snapshot
   * immediately, then refreshes from git in the background. Safe to call repeatedly.
   */
  startIndexing(workspaceId: string, workspacePath: string): void {
    const existing = this.workspaces.get(workspaceId);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      if (existing.path === workspacePath) {
        this.scheduleRefresh(workspaceId, existing, 0);
        return;
      }
      this.stopIndexing(workspaceId);
    }

    const state: WorkspaceState = {
      path: workspacePath,
      entries: listWorkspaceFileEntries(workspaceId),
      watcher: null,
      gitWatcher: null,
      refreshTimer: null,
      gitStatusTimer: null,
      refreshInProgress: false,
      refreshQueued: false,
      lastAccessedAt: Date.now(),
    };

    this.workspaces.set(workspaceId, state);
    this.attachWatcher(workspaceId, state);
    this.attachGitWatcher(workspaceId, state);
    this.scheduleRefresh(workspaceId, state, 0);
  }

  /** Convenience: start if not running, or trigger a refresh if already running. */
  ensureIndexing(workspaceId: string, workspacePath: string): void {
    this.startIndexing(workspaceId, workspacePath);
  }

  stopIndexing(workspaceId: string): void {
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    if (state.gitStatusTimer) clearTimeout(state.gitStatusTimer);
    if (state.watcher) {
      try {
        state.watcher.close();
      } catch {}
    }
    if (state.gitWatcher) {
      try {
        state.gitWatcher.close();
      } catch {}
    }
    this.workspaces.delete(workspaceId);
    // Shut down any LSP servers spawned for this workspace.
    void import("./language-service.js")
      .then((m) => m.shutdownWorkspace(workspaceId))
      .catch((err) =>
        console.warn(`[workspace-indexer] LSP shutdown failed:`, err),
      );
  }

  async reindex(workspaceId: string): Promise<void> {
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    await this.refresh(workspaceId, state);
  }

  listFiles(workspaceId: string): WorkspaceFileEntry[] {
    const state = this.workspaces.get(workspaceId);
    if (!state) return listWorkspaceFileEntries(workspaceId);
    state.lastAccessedAt = Date.now();
    return state.entries;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private isIgnored(rel: string): boolean {
    return rel.split("/").some((p) => IGNORED_DIRS.has(p));
  }

  private attachWatcher(workspaceId: string, state: WorkspaceState): void {
    try {
      const watcher = watch(
        state.path,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (filename) {
            const rel = filename.split(sep).join("/");
            // Cheap discard: ignored paths (node_modules churn, etc.) never
            // trigger a refresh or a git-status broadcast.
            if (this.isIgnored(rel)) return;
          }
          this.scheduleRefresh(workspaceId, state, REFRESH_DEBOUNCE_MS);
          this.scheduleGitStatusBroadcast(workspaceId, state);
        },
      );
      watcher.on("error", (err) => {
        console.error(
          `[workspace-indexer] watcher error for ${workspaceId}:`,
          err,
        );
      });
      state.watcher = watcher;
    } catch (err) {
      console.error(`[workspace-indexer] could not watch ${state.path}:`, err);
    }
  }

  private attachGitWatcher(workspaceId: string, state: WorkspaceState): void {
    const gitDir = join(state.path, ".git");
    try {
      const watcher = watch(
        gitDir,
        { recursive: true, persistent: false },
        () => {
          // Any .git change (index, HEAD, refs) means staging/commit/branch
          // state changed.
          this.scheduleGitStatusBroadcast(workspaceId, state);
        },
      );
      watcher.on("error", () => {});
      state.gitWatcher = watcher;
    } catch {
      // Not a git repo or .git doesn't exist — silently skip.
    }
  }

  private scheduleGitStatusBroadcast(
    workspaceId: string,
    state: WorkspaceState,
  ): void {
    if (state.gitStatusTimer) return;
    state.gitStatusTimer = setTimeout(() => {
      state.gitStatusTimer = null;
      gitStatusBroadcaster.broadcast(workspaceId);
    }, GIT_STATUS_DEBOUNCE_MS);
  }

  private scheduleRefresh(
    workspaceId: string,
    state: WorkspaceState,
    delay: number,
  ): void {
    if (state.refreshTimer) return;
    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = null;
      this.refresh(workspaceId, state).catch((err) =>
        console.error(
          `[workspace-indexer] refresh failed for ${workspaceId}:`,
          err,
        ),
      );
    }, delay);
  }

  private async refresh(
    workspaceId: string,
    state: WorkspaceState,
  ): Promise<void> {
    if (state.refreshInProgress) {
      state.refreshQueued = true;
      return;
    }
    state.refreshInProgress = true;
    try {
      const filePaths = (await isGitRepo(state.path))
        ? await listWorkspaceFiles(state.path)
        : await this.fallbackScan(state.path);

      const next = buildEntries(filePaths);
      if (!entriesEqual(state.entries, next)) {
        state.entries = next;
        replaceWorkspaceFiles(workspaceId, next);
        workspaceIndexBroadcaster.broadcast(workspaceId);
      }
    } finally {
      state.refreshInProgress = false;
      if (state.refreshQueued) {
        state.refreshQueued = false;
        this.scheduleRefresh(workspaceId, state, REFRESH_DEBOUNCE_MS);
      }
    }
  }

  /** Recursive scan honoring IGNORED_DIRS, for workspaces that aren't git repos. */
  private async fallbackScan(rootPath: string): Promise<string[]> {
    const out: string[] = [];
    const stack: string[] = [""];
    while (stack.length > 0) {
      const relDir = stack.pop()!;
      let dirents: import("node:fs").Dirent[];
      try {
        dirents = await readdir(relDir ? join(rootPath, relDir) : rootPath, {
          withFileTypes: true,
        });
      } catch {
        continue;
      }
      for (const d of dirents) {
        if (IGNORED_DIRS.has(d.name)) continue;
        const childRel = relDir ? `${relDir}/${d.name}` : d.name;
        if (d.isDirectory()) {
          stack.push(childRel);
        } else if (d.isFile()) {
          out.push(childRel);
          if (out.length >= MAX_FALLBACK_ENTRIES) return out;
        }
      }
    }
    return out;
  }
}

/** Expands a list of file paths into file entries plus synthesized ancestor dirs. */
function buildEntries(filePaths: string[]): WorkspaceFileEntry[] {
  const map = new Map<string, WorkspaceFileEntry>();
  for (const raw of filePaths) {
    const rel = raw.split(sep).join("/");
    if (!rel) continue;
    const segments = rel.split("/");
    const name = segments[segments.length - 1] ?? rel;
    map.set(rel, { relativePath: rel, name, isDirectory: false });
    for (let i = 1; i < segments.length; i++) {
      const dirRel = segments.slice(0, i).join("/");
      if (!map.has(dirRel)) {
        map.set(dirRel, {
          relativePath: dirRel,
          name: segments[i - 1]!,
          isDirectory: true,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

function entriesEqual(
  a: WorkspaceFileEntry[],
  b: WorkspaceFileEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]!.relativePath !== b[i]!.relativePath ||
      a[i]!.isDirectory !== b[i]!.isDirectory
    ) {
      return false;
    }
  }
  return true;
}

export const workspaceIndexer = new WorkspaceIndexer();
