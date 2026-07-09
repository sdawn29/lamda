import { Hono } from "hono";
import type { WebSocket } from "ws";
import { getAvailableModels } from "@lamda/pi-sdk";
import { getWorkspace } from "@lamda/db";
import { threadStatusBroadcaster } from "../thread-status-broadcaster.js";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";
import { workspaceDirBroadcaster } from "../workspace-dir-broadcaster.js";
import { gitStatusBroadcaster } from "../git-status-broadcaster.js";
import { worktreeBroadcaster } from "../worktree-broadcaster.js";
import { modesBroadcaster } from "../modes-broadcaster.js";
import { promptsBroadcaster } from "../prompts-broadcaster.js";
import { agentsBroadcaster } from "../agents-broadcaster.js";
import { automationBroadcaster } from "../automation-broadcaster.js";
import { semanticIndexBroadcaster } from "../semantic-index-broadcaster.js";
import { backgroundTaskQueue } from "../services/background-task-queue.js";

const health = new Hono();

health.get("/models", (c) => c.json({ models: getAvailableModels() }));

health.get("/background-queue", (c) =>
  c.json({ queues: backgroundTaskQueue.stats() }),
);

export function handleGlobalEventsWs(ws: WebSocket) {
  const unsubscribeThread = threadStatusBroadcaster.subscribe(
    ({ threadId, status, reason, detail }) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      ws.send(
        JSON.stringify({
          type: "thread_status",
          threadId,
          status,
          reason,
          detail,
        }),
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

  const unsubscribeAgents = agentsBroadcaster.subscribe(() => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "agents_changed" }));
  });

  const unsubscribeAutomations = automationBroadcaster.subscribe(() => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(JSON.stringify({ type: "automations_changed" }));
  });

  const unsubscribeSemanticIndex = semanticIndexBroadcaster.subscribe(
    ({
      workspaceId,
      phase,
      current,
      total,
      initial,
      processed,
      embedded,
      error,
    }) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      const workspaceName = getWorkspace(workspaceId)?.name;
      ws.send(
        JSON.stringify({
          type: "semantic_index_progress",
          workspaceId,
          workspaceName,
          phase,
          current,
          total,
          initial,
          processed,
          embedded,
          error,
        }),
      );
    },
  );

  const cleanup = () => {
    unsubscribeThread();
    unsubscribeIndex();
    unsubscribeDir();
    unsubscribeGit();
    unsubscribeWorktree();
    unsubscribeModes();
    unsubscribePrompts();
    unsubscribeAgents();
    unsubscribeAutomations();
    unsubscribeSemanticIndex();
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

export default health;
