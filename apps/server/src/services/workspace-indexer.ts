import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { replaceWorkspaceFiles, type WorkspaceFileEntry } from "@lamda/db";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  ".svelte-kit",
]);

const DEBOUNCE_MS = 2000;

class WorkspaceIndexer {
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private workspacePaths = new Map<string, string>(); // workspaceId → path
  // Prevents concurrent scans for the same workspace
  private inProgressScans = new Set<string>();

  async startIndexing(workspaceId: string, workspacePath: string): Promise<void> {
    this.workspacePaths.set(workspaceId, workspacePath);

    // Already watching — indexer is running, nothing to do
    if (this.watchers.has(workspaceId)) return;

    // Another startIndexing call is already mid-scan for this workspace
    if (this.inProgressScans.has(workspaceId)) return;

    await this.runScan(workspaceId, workspacePath);
    this.setupWatcher(workspaceId, workspacePath);
  }

  stopIndexing(workspaceId: string): void {
    const timer = this.debounceTimers.get(workspaceId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(workspaceId);
    }
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      try { watcher.close(); } catch {}
      this.watchers.delete(workspaceId);
    }
    this.inProgressScans.delete(workspaceId);
    this.workspacePaths.delete(workspaceId);
  }

  async reindex(workspaceId: string): Promise<void> {
    const path = this.workspacePaths.get(workspaceId);
    if (!path) return;
    await this.runScan(workspaceId, path);
    workspaceIndexBroadcaster.broadcast(workspaceId);
  }

  private async runScan(workspaceId: string, workspacePath: string): Promise<void> {
    if (this.inProgressScans.has(workspaceId)) return;
    this.inProgressScans.add(workspaceId);
    try {
      await this.fullScan(workspaceId, workspacePath);
    } catch (err) {
      console.error(`[workspace-indexer] scan failed for ${workspaceId}:`, err);
    } finally {
      this.inProgressScans.delete(workspaceId);
    }
  }

  private async fullScan(workspaceId: string, workspacePath: string): Promise<void> {
    const rawEntries = await readdir(workspacePath, { withFileTypes: true, recursive: true });
    const seen = new Set<string>();
    const files: WorkspaceFileEntry[] = [];

    for (const entry of rawEntries) {
      const fullPath = join(entry.parentPath, entry.name);
      const rel = relative(workspacePath, fullPath).replace(/\\/g, "/");
      if (rel.split("/").some((p) => EXCLUDED_DIRS.has(p))) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);

      if (entry.isDirectory()) {
        files.push({ relativePath: rel, name: entry.name, isDirectory: true });
      } else if (entry.isFile()) {
        files.push({ relativePath: rel, name: entry.name, isDirectory: false });
      }
    }

    // replaceWorkspaceFiles yields the event loop between chunks so HTTP
    // requests are serviced while the index is being written
    await replaceWorkspaceFiles(workspaceId, files);
  }

  private scheduleRescan(workspaceId: string, workspacePath: string): void {
    const existing = this.debounceTimers.get(workspaceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(workspaceId);
      // Skip if another scan is already running for this workspace
      if (this.inProgressScans.has(workspaceId)) return;
      try {
        await this.runScan(workspaceId, workspacePath);
        workspaceIndexBroadcaster.broadcast(workspaceId);
      } catch (err) {
        console.error(`[workspace-indexer] rescan failed for ${workspaceId}:`, err);
      }
    }, DEBOUNCE_MS);

    this.debounceTimers.set(workspaceId, timer);
  }

  private setupWatcher(workspaceId: string, workspacePath: string): void {
    try {
      const watcher = watch(workspacePath, { recursive: true, persistent: false }, () => {
        this.scheduleRescan(workspaceId, workspacePath);
      });

      watcher.on("error", (err) => {
        console.error(`[workspace-indexer] watcher error for ${workspaceId}:`, err);
        this.watchers.delete(workspaceId);
      });

      this.watchers.set(workspaceId, watcher);
    } catch (err) {
      console.error(`[workspace-indexer] could not watch ${workspacePath} (file watching unavailable):`, err);
    }
  }
}

export const workspaceIndexer = new WorkspaceIndexer();
