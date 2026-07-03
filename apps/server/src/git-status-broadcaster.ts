import { Broadcaster } from "./lib/broadcaster.js";

export const gitStatusBroadcaster = new Broadcaster<[workspaceId: string]>();
