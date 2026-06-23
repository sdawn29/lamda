import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import {
  LAMDA_DIR_NAME,
  lamdaGlobalPromptsDir,
  lamdaLocalModesDir,
  lamdaLocalPromptsDir,
  lamdaModesDir,
} from "@lamda/pi-sdk";
import { modesBroadcaster } from "../modes-broadcaster.js";
import { promptsBroadcaster } from "../prompts-broadcaster.js";

const DEBOUNCE_MS = 150;

/** The on-disk config kinds whose `.lamda` subdirectory we watch. */
type Kind = "modes" | "prompts";

/**
 * Watches the `.lamda/modes` and `.lamda/prompts` directories — globally
 * (`~/.lamda`) and per open workspace (`<cwd>/.lamda`) — and broadcasts a
 * debounced change whenever a mode or prompt file is added, edited, or removed.
 * The renderer refetches the matching pickers/command lists in response, so
 * authored files take effect live, without a server restart or manual reload.
 *
 * For a workspace we also watch the parent `.lamda` directory, so a `modes` or
 * `prompts` subdirectory created after the workspace opened is picked up (its
 * creation fires the parent watcher, which then attaches the subdir watchers).
 * The global parent `~/.lamda` is deliberately not watched: it holds the live
 * SQLite database (and its constantly-rewritten WAL), so a non-recursive watch
 * there would fire on every database write. The global `modes`/`prompts` dirs
 * are seeded at startup, so they always exist and are watched directly.
 *
 * One non-recursive watcher per directory (the config dirs are flat — a file
 * per mode/prompt). A directory that doesn't exist yet is skipped.
 */
class LamdaConfigWatcher {
  // key: `global:modes` | `global:prompts` | `ws:${id}:lamda|modes|prompts`
  private watchers = new Map<string, FSWatcher>();
  // One pending broadcast timer per kind, so bursts coalesce into one signal.
  private timers = new Map<Kind, ReturnType<typeof setTimeout>>();

  /** Watch the global `~/.lamda/{modes,prompts}` dirs. Call once at startup. */
  start(): void {
    this.watchDir("global:modes", lamdaModesDir(), () =>
      this.scheduleBroadcast("modes"),
    );
    this.watchDir("global:prompts", lamdaGlobalPromptsDir(), () =>
      this.scheduleBroadcast("prompts"),
    );
  }

  /** Watch a workspace's local `.lamda` (and its modes/prompts subdirs). */
  watchWorkspace(workspaceId: string, workspacePath: string): void {
    // The parent `.lamda` watcher catches a modes/prompts subdir appearing
    // later: on any change there, (re)attach the subdir watchers and signal
    // both kinds, since the event doesn't say which subdir changed.
    this.watchDir(
      `ws:${workspaceId}:lamda`,
      join(workspacePath, LAMDA_DIR_NAME),
      () => {
        this.attachWorkspaceSubdirs(workspaceId, workspacePath);
        this.scheduleBroadcast("modes");
        this.scheduleBroadcast("prompts");
      },
    );
    this.attachWorkspaceSubdirs(workspaceId, workspacePath);
  }

  /** Stop watching a workspace's `.lamda` directory and its subdirs. */
  stopWorkspace(workspaceId: string): void {
    this.closeWatch(`ws:${workspaceId}:lamda`);
    this.closeWatch(`ws:${workspaceId}:modes`);
    this.closeWatch(`ws:${workspaceId}:prompts`);
  }

  private attachWorkspaceSubdirs(
    workspaceId: string,
    workspacePath: string,
  ): void {
    this.watchDir(
      `ws:${workspaceId}:modes`,
      lamdaLocalModesDir(workspacePath),
      () => this.scheduleBroadcast("modes"),
    );
    this.watchDir(
      `ws:${workspaceId}:prompts`,
      lamdaLocalPromptsDir(workspacePath),
      () => this.scheduleBroadcast("prompts"),
    );
  }

  private watchDir(key: string, dir: string, onChange: () => void): void {
    if (this.watchers.has(key)) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(dir, { recursive: false, persistent: false }, onChange);
    } catch {
      // Directory doesn't exist or is unreadable — nothing to watch.
      return;
    }
    watcher.on("error", () => {});
    this.watchers.set(key, watcher);
  }

  private scheduleBroadcast(kind: Kind): void {
    if (this.timers.has(kind)) return;
    this.timers.set(
      kind,
      setTimeout(() => {
        this.timers.delete(kind);
        if (kind === "modes") modesBroadcaster.broadcast();
        else promptsBroadcaster.broadcast();
      }, DEBOUNCE_MS),
    );
  }

  private closeWatch(key: string): void {
    const watcher = this.watchers.get(key);
    if (!watcher) return;
    try {
      watcher.close();
    } catch {}
    this.watchers.delete(key);
  }
}

export const lamdaConfigWatcher = new LamdaConfigWatcher();
