import { Broadcaster } from "./lib/broadcaster.js";

/**
 * Broadcasts "the set of automations changed" — one was created, edited,
 * deleted, or a scheduled/manual run started or finished (which may also create
 * a new thread). The renderer refetches the automations list, their run
 * histories, and the workspace/thread tree in response.
 *
 * The event carries no payload: changes are infrequent and the affected queries
 * are cheap to refetch, so a single global signal keeps every client in sync
 * without per-client bookkeeping.
 */
export const automationBroadcaster = new Broadcaster();
