import { Broadcaster } from "./lib/broadcaster.js";

/**
 * Broadcasts "the set of available subagents changed" — an agent file was
 * added, edited, or removed in the global `~/.lamda/agents` directory or a
 * workspace's local `.lamda/agents`. The renderer refetches its agent lists
 * (Settings → Agents) in response.
 *
 * The event carries no payload, mirroring {@link modesBroadcaster}: a change
 * anywhere invalidates every mounted list.
 */
export const agentsBroadcaster = new Broadcaster();
