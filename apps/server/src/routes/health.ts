import { Hono } from "hono";
import os from "node:os";
import v8 from "node:v8";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { WebSocket } from "ws";
import { getAvailableModels } from "@lamda/pi-sdk";
import { dbPath, getWorkspace } from "@lamda/db";
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

// ── Resource sampler ─────────────────────────────────────────────────────────
// A single unref'd interval owns all CPU-delta bookkeeping and appends to a
// rolling history buffer, so `/resources` reads are consistent regardless of
// how many clients poll and chart history survives page reloads.

const SAMPLE_INTERVAL_MS = 2_000;
const HISTORY_LIMIT = 150; // ~5 minutes at 2s per sample

interface ResourceHistoryPoint {
  sampledAt: number;
  systemCpu: number | null;
  appCpu: number | null;
  systemMemory: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  loopDelayMs: number | null;
  loopDelayMaxMs: number | null;
  activeLanes: number;
  queuedJobs: number;
}

type ResourceSample = ReturnType<typeof takeResourceSample>;

const loopDelayHistogram = monitorEventLoopDelay({ resolution: 20 });
const resourceHistory: ResourceHistoryPoint[] = [];
let latestSample: ResourceSample | null = null;
let samplerStarted = false;

function toMs(nanoseconds: number): number | null {
  return Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : null;
}

function takeResourceSample() {
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

  const loopDelay = {
    meanMs: loopDelayHistogram.count > 0 ? toMs(loopDelayHistogram.mean) : null,
    maxMs: loopDelayHistogram.count > 0 ? toMs(loopDelayHistogram.max) : null,
    p99Ms:
      loopDelayHistogram.count > 0
        ? toMs(loopDelayHistogram.percentile(99))
        : null,
  };
  loopDelayHistogram.reset();

  const queues = backgroundTaskQueue.stats();

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
      nodeVersion: process.version,
      cpuPercent: processCpuPercent,
      uptimeSeconds: process.uptime(),
      eventLoop: loopDelay,
      heapLimit: v8.getHeapStatistics().heap_size_limit,
      memory: {
        rss: processMemory.rss,
        heapTotal: processMemory.heapTotal,
        heapUsed: processMemory.heapUsed,
        external: processMemory.external,
        arrayBuffers: processMemory.arrayBuffers,
      },
    },
    queues,
  };
}

function recordResourceSample(): void {
  const sample = takeResourceSample();
  latestSample = sample;
  resourceHistory.push({
    sampledAt: sample.sampledAt,
    systemCpu: sample.system.cpuPercent,
    appCpu: sample.process.cpuPercent,
    systemMemory: sample.system.memoryPercent,
    rss: sample.process.memory.rss,
    heapUsed: sample.process.memory.heapUsed,
    heapTotal: sample.process.memory.heapTotal,
    external: sample.process.memory.external,
    loopDelayMs: sample.process.eventLoop.meanMs,
    loopDelayMaxMs: sample.process.eventLoop.maxMs,
    activeLanes: sample.queues.filter((queue) => queue.active).length,
    queuedJobs: sample.queues.reduce(
      (total, queue) => total + queue.pending,
      0,
    ),
  });
  if (resourceHistory.length > HISTORY_LIMIT) {
    resourceHistory.splice(0, resourceHistory.length - HISTORY_LIMIT);
  }
}

function ensureResourceSampler(): void {
  if (samplerStarted) return;
  samplerStarted = true;
  loopDelayHistogram.enable();
  // The first sample has no CPU deltas to diff against, so its CPU fields are
  // null ("warming up"); memory and queue data are real immediately.
  recordResourceSample();
  setInterval(recordResourceSample, SAMPLE_INTERVAL_MS).unref();
}

// ── Storage stats ────────────────────────────────────────────────────────────
// Sizing ~/.lamda can touch a lot of files (managed worktrees include full
// checkouts), so it runs at most once per TTL and only while the resources
// page is actually polling.

const STORAGE_TTL_MS = 5 * 60_000;

interface StorageStats {
  dataDir: string;
  computedAt: number;
  databaseBytes: number;
  attachmentsBytes: number;
  worktreesBytes: number;
  otherBytes: number;
  totalBytes: number;
  fileCount: number;
}

let storageStats: StorageStats | null = null;
let storagePromise: Promise<void> | null = null;

async function directorySize(
  root: string,
): Promise<{ bytes: number; files: number }> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return { bytes: 0, files: 0 };
  }
  let bytes = 0;
  let files = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      bytes += (await stat(join(entry.parentPath, entry.name))).size;
      files += 1;
    } catch {
      // File vanished mid-walk (worktree cleanup, WAL checkpoint) — skip it.
    }
  }
  return { bytes, files };
}

async function computeStorageStats(): Promise<void> {
  const dataDir = dirname(dbPath);
  const dbName = basename(dbPath);

  let databaseBytes = 0;
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      databaseBytes += (await stat(join(dataDir, `${dbName}${suffix}`))).size;
    } catch {
      // Sidecar not present.
    }
  }

  const [attachments, worktrees, total] = await Promise.all([
    directorySize(join(dataDir, "attachments")),
    directorySize(join(dataDir, "worktrees")),
    directorySize(dataDir),
  ]);

  storageStats = {
    dataDir,
    computedAt: Date.now(),
    databaseBytes,
    attachmentsBytes: attachments.bytes,
    worktreesBytes: worktrees.bytes,
    otherBytes: Math.max(
      0,
      total.bytes - databaseBytes - attachments.bytes - worktrees.bytes,
    ),
    totalBytes: total.bytes,
    fileCount: total.files,
  };
}

function refreshStorageStats(): void {
  if (storagePromise) return;
  if (storageStats && Date.now() - storageStats.computedAt < STORAGE_TTL_MS) {
    return;
  }
  storagePromise = computeStorageStats()
    .catch((err) => {
      console.error("[resources] storage stats failed", err);
    })
    .finally(() => {
      storagePromise = null;
    });
}

function getResourceSnapshot() {
  ensureResourceSampler();
  refreshStorageStats();
  return {
    ...(latestSample ?? takeResourceSample()),
    history: resourceHistory,
    storage: storageStats,
  };
}

health.get("/models", async (c) =>
  c.json({ models: await getAvailableModels() }),
);

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
