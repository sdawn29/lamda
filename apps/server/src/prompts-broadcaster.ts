import { Broadcaster } from "./lib/broadcaster.js";

/**
 * Broadcasts "the set of prompt templates changed" — a prompt file was added,
 * edited, or removed in the global `~/.lamda/prompts` directory or a workspace's
 * local `.lamda/prompts`. The renderer refetches its slash-command lists in
 * response, so a freshly authored prompt is usable without a server restart.
 *
 * The event carries no payload: a change anywhere invalidates every mounted
 * command list. Command lists are keyed by session/workspace, and a global
 * prompt is visible to all of them, so scoping the signal wouldn't save work.
 */
export const promptsBroadcaster = new Broadcaster();
