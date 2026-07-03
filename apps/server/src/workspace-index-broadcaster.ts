import { Broadcaster } from "./lib/broadcaster.js";

export const workspaceIndexBroadcaster = new Broadcaster<
  [workspaceId: string]
>();
