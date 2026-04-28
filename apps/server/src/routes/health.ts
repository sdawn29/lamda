import { Hono } from "hono";
import type { WebSocket } from "ws";
import { getAvailableModels } from "@lamda/pi-sdk";
import { threadStatusBroadcaster } from "../thread-status-broadcaster.js";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";

const health = new Hono();

health.get("/models", (c) => c.json({ models: getAvailableModels() }));

export function handleGlobalEventsWs(ws: WebSocket) {
  const unsubscribeThread = threadStatusBroadcaster.subscribe(({ threadId, status }) => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "thread_status", threadId, status }));
  });

  const unsubscribeIndex = workspaceIndexBroadcaster.subscribe((workspaceId) => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "workspace_files_updated", workspaceId }));
  });

  const cleanup = () => {
    unsubscribeThread();
    unsubscribeIndex();
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

export default health;
