import { Hono } from "hono";
import type { WebSocket } from "ws";
import { getAvailableModels } from "@lamda/pi-sdk";
import { threadStatusBroadcaster } from "../thread-status-broadcaster.js";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";
import { workspaceDirBroadcaster } from "../workspace-dir-broadcaster.js";
import { gitStatusBroadcaster } from "../git-status-broadcaster.js";
import { worktreeBroadcaster } from "../worktree-broadcaster.js";
import { modesBroadcaster } from "../modes-broadcaster.js";
import { promptsBroadcaster } from "../prompts-broadcaster.js";
import { automationBroadcaster } from "../automation-broadcaster.js";

const health = new Hono();

health.get("/models", (c) => c.json({ models: getAvailableModels() }));

export function handleGlobalEventsWs(ws: WebSocket) {
  const unsubscribeThread = threadStatusBroadcaster.subscribe(
    ({ threadId, status, reason, detail }) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      ws.send(
        JSON.stringify({ type: "thread_status", threadId, status, reason, detail }),
      );
    },
  );

  const unsubscribeIndex = workspaceIndexBroadcaster.subscribe(
    (workspaceId) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      ws.send(JSON.stringify({ type: "workspace_files_updated", workspaceId }));
    },
  );

  const unsubscribeDir = workspaceDirBroadcaster.subscribe(
    ({ workspaceId, root, dir }) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      ws.send(
        JSON.stringify({
          type: "workspace_dir_changed",
          workspaceId,
          root,
          dir,
        }),
      );
    },
  );

  const unsubscribeGit = gitStatusBroadcaster.subscribe((workspaceId) => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "git_status_changed", workspaceId }));
  });

  const unsubscribeWorktree = worktreeBroadcaster.subscribe(
    ({ workspaceId, threadId }) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      ws.send(
        JSON.stringify({ type: "worktree_detached", workspaceId, threadId }),
      );
    },
  );

  const unsubscribeModes = modesBroadcaster.subscribe(() => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "modes_changed" }));
  });

  const unsubscribePrompts = promptsBroadcaster.subscribe(() => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "prompts_changed" }));
  });

  const unsubscribeAutomations = automationBroadcaster.subscribe(() => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "automations_changed" }));
  });

  const cleanup = () => {
    unsubscribeThread();
    unsubscribeIndex();
    unsubscribeDir();
    unsubscribeGit();
    unsubscribeWorktree();
    unsubscribeModes();
    unsubscribePrompts();
    unsubscribeAutomations();
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

export default health;
