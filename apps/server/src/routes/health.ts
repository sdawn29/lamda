import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getAvailableModels } from "@lamda/pi-sdk";
import { threadStatusBroadcaster } from "../thread-status-broadcaster.js";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";

const health = new Hono();

health.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

health.get("/events", (c) => {
  const response = streamSSE(c, async (stream) => {
    const unsubscribeThread = threadStatusBroadcaster.subscribe(({ threadId, status }) => {
      stream.writeSSE({
        event: "thread_status",
        data: JSON.stringify({ threadId, status }),
      });
    });

    const unsubscribeIndex = workspaceIndexBroadcaster.subscribe((workspaceId) => {
      stream.writeSSE({
        event: "workspace_files_updated",
        data: JSON.stringify({ workspaceId }),
      });
    });

    stream.onAbort(() => {
      unsubscribeThread();
      unsubscribeIndex();
    });
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  });
  response.headers.set("Cache-Control", "no-cache, no-transform");
  response.headers.set("X-Accel-Buffering", "no");
  return response;
});

health.get("/models", (c) => c.json({ models: getAvailableModels() }));

export default health;
