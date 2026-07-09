import { Broadcaster } from "./lib/broadcaster.js";

/**
 * Fires on every non-ignored raw filesystem watcher event for a workspace —
 * unlike `workspaceIndexBroadcaster`, which only fires when the *set* of file
 * paths changes. Content edits to an existing file never change that set, so
 * the semantic indexer subscribes here to learn about them. `relPath` is null
 * when the underlying `fs.watch` event didn't report a filename (which can
 * happen on some platforms) — subscribers should treat that as "something in
 * the tree changed" and fall back to a full manifest sweep.
 */
export const workspaceActivityBroadcaster = new Broadcaster<
  [workspaceId: string, relPath: string | null]
>();
