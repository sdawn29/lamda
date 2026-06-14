import { readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Per-workspace persistence of remembered tool-approval decisions, stored at
 * `<workspace>/.lamda/tool-approvals.json`. Mirrors how `.lamda/plans` already
 * lives inside the workspace. Only "Always allow"/"Don't allow" choices are
 * written here; "Allow once" is not persisted.
 *
 * The file is the source of truth: reads are cached in memory (it's consulted on
 * every gated tool call) but the cache is keyed on the file's mtime, so editing
 * `.lamda/tool-approvals.json` by hand — or deleting it — takes effect on the
 * next lookup without restarting the server.
 */

export type ToolDecision = "allow" | "deny";

const APPROVALS_FILE = ".lamda/tool-approvals.json";
const VERSION = 1;

interface ToolApprovalsFile {
  version: number;
  tools: Record<string, ToolDecision>;
}

interface CacheEntry {
  data: ToolApprovalsFile;
  /** File mtime in ms; -1 when the file is absent. Reload when it changes. */
  mtimeMs: number;
}

const cache = new Map<string, CacheEntry>();

function filePath(cwd: string): string {
  return join(cwd, APPROVALS_FILE);
}

/** Current mtime of the approvals file, or -1 if it doesn't exist. */
function currentMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

function load(cwd: string): ToolApprovalsFile {
  const path = filePath(cwd);
  const mtimeMs = currentMtimeMs(path);

  const cached = cache.get(cwd);
  // Reuse the cache only when the file is unchanged since we last read it.
  if (cached && cached.mtimeMs === mtimeMs) return cached.data;

  let data: ToolApprovalsFile = { version: VERSION, tools: {} };
  if (mtimeMs !== -1) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as ToolApprovalsFile;
      if (parsed && typeof parsed === "object" && parsed.tools) {
        data = { version: VERSION, tools: { ...parsed.tools } };
      }
    } catch {
      /* corrupt file — start fresh */
    }
  }
  cache.set(cwd, { data, mtimeMs });
  return data;
}

/** Look up a remembered decision for a tool in this workspace, if any. */
export function getToolDecision(cwd: string, toolName: string): ToolDecision | null {
  return load(cwd).tools[toolName] ?? null;
}

/** Persist a remembered decision for a tool in this workspace. */
export function setToolDecision(
  cwd: string,
  toolName: string,
  decision: ToolDecision,
): void {
  // load() picks up any external edits first, so our change merges onto the
  // current file contents rather than a stale in-memory copy.
  const data = load(cwd);
  data.tools[toolName] = decision;
  const path = filePath(cwd);
  try {
    mkdirSync(join(cwd, ".lamda"), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2));
    // Refresh the cached mtime to our just-written file so the next lookup
    // doesn't needlessly re-read it.
    cache.set(cwd, { data, mtimeMs: currentMtimeMs(path) });
  } catch (err) {
    console.warn("[tool-approval-store] failed to persist decision:", err);
    // Keep the in-memory decision so the running session still honors it.
    cache.set(cwd, { data, mtimeMs: cache.get(cwd)?.mtimeMs ?? -1 });
  }
}
