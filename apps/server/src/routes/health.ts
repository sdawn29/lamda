import { Hono } from "hono";
import os from "node:os";
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

interface CpuSnapshot {
  idle: number;
  total: number;
  processUsage: NodeJS.CpuUsage;
  timestamp: number;
}

let lastCpuSnapshot: CpuSnapshot | null = null;

function readCpuSnapshot(): CpuSnapshot {
  const totals = os.cpus().reduce(
    (acc, cpu) => {
      const total = Object.values(cpu.times).reduce(
        (sum, time) => sum + time,
        0,
      );
      return {
        idle: acc.idle + cpu.times.idle,
        total: acc.total + total,
      };
    },
    { idle: 0, total: 0 },
  );

  return {
    ...totals,
    processUsage: process.cpuUsage(),
    timestamp: Date.now(),
  };
}

function getResourceSnapshot() {
  const current = readCpuSnapshot();
  const previous = lastCpuSnapshot;
  lastCpuSnapshot = current;

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const processMemory = process.memoryUsage();

  let cpuPercent: number | null = null;
  let processCpuPercent: number | null = null;
  if (previous) {
    const idleDelta = current.idle - previous.idle;
    const totalDelta = current.total - previous.total;
    if (totalDelta > 0) {
      cpuPercent = Math.max(
        0,
        Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100),
      );
    }

    const elapsedMicros = (current.timestamp - previous.timestamp) * 1000;
    const usageDelta =
      current.processUsage.user -
      previous.processUsage.user +
      current.processUsage.system -
      previous.processUsage.system;
    if (elapsedMicros > 0) {
      processCpuPercent = Math.max(
        0,
        Math.min(100, (usageDelta / elapsedMicros / os.cpus().length) * 100),
      );
    }
  }

  return {
    sampledAt: current.timestamp,
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? "Unknown CPU",
      cpuPercent,
      loadAverage: os.loadavg(),
      totalMemory,
      freeMemory,
      usedMemory: totalMemory - freeMemory,
      memoryPercent:
        totalMemory > 0 ? ((totalMemory - freeMemory) / totalMemory) * 100 : 0,
      uptimeSeconds: os.uptime(),
    },
    process: {
      pid: process.pid,
      cpuPercent: processCpuPercent,
      uptimeSeconds: process.uptime(),
      memory: {
        rss: processMemory.rss,
        heapTotal: processMemory.heapTotal,
        heapUsed: processMemory.heapUsed,
        external: processMemory.external,
      },
    },
    queues: backgroundTaskQueue.stats(),
  };
}

health.get("/models", (c) => c.json({ models: getAvailableModels() }));

health.get("/background-queue", (c) =>
  c.json({ queues: backgroundTaskQueue.stats() }),
);

health.get("/resources", (c) => c.json(getResourceSnapshot()));

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
