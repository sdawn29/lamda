import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  getCodeFileManifest,
  replaceFileChunks,
  touchCodeFileManifest,
  deleteFileChunks,
  clearWorkspaceChunks,
  listChunksNeedingEmbedding,
  upsertChunkVector,
  isVecAvailable,
  getSetting,
  type CodeChunkInput,
} from "@lamda/db";
import { embeddingsEnabled, embedDocuments } from "@lamda/pi-sdk";
import {
  isIndexableFile,
  looksBinary,
  looksGenerated,
  chunkFileContent,
  chunkId,
  sha256,
} from "./code-chunker.js";
import { workspaceIndexer } from "./workspace-indexer.js";
import { workspaceActivityBroadcaster } from "../workspace-activity-broadcaster.js";
import { workspaceIndexBroadcaster } from "../workspace-index-broadcaster.js";
import { semanticIndexBroadcaster } from "../semantic-index-broadcaster.js";

const SWEEP_DEBOUNCE_MS = 2000;
const EMBED_BATCH = 64;
const MAX_AUTO_FILES = 5000;
const MAX_AUTO_BYTES = 40 * 1024 * 1024;

type WorkspaceOverride = "auto" | "on" | "off";

function workspaceOverride(workspaceId: string): WorkspaceOverride {
  const raw = getSetting(`semantic_index.workspace.${workspaceId}`);
  return raw === "on" || raw === "off" ? raw : "auto";
}

/** Whether indexing should run at all for this workspace right now. */
function isEnabled(workspaceId: string): boolean {
  if (getSetting("semantic_index.enabled") === "false") return false;
  return workspaceOverride(workspaceId) !== "off";
}

interface WorkspaceState {
  path: string;
  timer: ReturnType<typeof setTimeout> | null;
  sweeping: boolean;
  sweepQueued: boolean;
  // True until the first sweep since start()/reindex() finishes. Marks that
  // sweep's completion as "initial" in the progress broadcast, so clients can
  // tell a workspace's (re)index just finished apart from the many small
  // incremental sweeps a busy editing session triggers.
  awaitingInitialSweep: boolean;
}

/**
 * Builds and maintains the per-workspace semantic code index: chunks files,
 * tracks a content-addressed manifest so unchanged files/chunks are skipped,
 * and backfills embeddings in the background. Chunking + FTS run whenever the
 * feature is enabled (no cost); embedding additionally requires sqlite-vec and
 * a configured Voyage key — both paths degrade silently when unavailable, same
 * convention as the memory system. Modeled on `workspace-indexer.ts`.
 */
class SemanticIndexer {
  private workspaces = new Map<string, WorkspaceState>();
  // Serializes embedding backfills across workspaces so we never hammer the
  // Voyage API with concurrent batches from multiple workspaces at once.
  private embedQueue: Promise<void> = Promise.resolve();

  constructor() {
    workspaceActivityBroadcaster.subscribe((workspaceId, _relPath) => {
      const state = this.workspaces.get(workspaceId);
      if (!state) return;
      this.scheduleSweep(workspaceId, state);
    });
    workspaceIndexBroadcaster.subscribe((workspaceId) => {
      const state = this.workspaces.get(workspaceId);
      if (!state) return;
      this.scheduleSweep(workspaceId, state);
    });
  }

  start(workspaceId: string, path: string): void {
    const existing = this.workspaces.get(workspaceId);
    if (existing) {
      existing.path = path;
      return;
    }
    this.workspaces.set(workspaceId, {
      path,
      timer: null,
      sweeping: false,
      sweepQueued: false,
      awaitingInitialSweep: true,
    });
    this.scheduleSweep(workspaceId, this.workspaces.get(workspaceId)!, 0);
  }

  stop(workspaceId: string): void {
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    this.workspaces.delete(workspaceId);
  }

  /** Wipe the index and rebuild it from scratch (manual "Reindex" action). */
  reindex(workspaceId: string): void {
    clearWorkspaceChunks(workspaceId);
    const state = this.workspaces.get(workspaceId);
    if (!state) return;
    // Treat the rebuild like a fresh index — its completion should be
    // reported as "initial" too, not lost among incremental sweeps.
    state.awaitingInitialSweep = true;
    this.scheduleSweep(workspaceId, state, 0);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private scheduleSweep(
    workspaceId: string,
    state: WorkspaceState,
    delay = SWEEP_DEBOUNCE_MS,
  ): void {
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      this.sweep(workspaceId, state).catch((err) =>
        console.error(`[semantic-indexer] sweep failed for ${workspaceId}:`, err),
      );
    }, delay);
  }

  private async sweep(workspaceId: string, state: WorkspaceState): Promise<void> {
    if (state.sweeping) {
      state.sweepQueued = true;
      return;
    }
    if (!isEnabled(workspaceId)) return;
    state.sweeping = true;
    try {
      await this.runSweep(workspaceId, state);
      // Chunking is cheap and always runs; queue the (rate-limited) embedding
      // backfill separately so a slow provider never blocks the next sweep.
      this.embedQueue = this.embedQueue
        .then(() => this.backfillEmbeddings(workspaceId))
        .catch((err) =>
          console.error(`[semantic-indexer] embedding failed for ${workspaceId}:`, err),
        );
    } finally {
      state.sweeping = false;
      if (state.sweepQueued) {
        state.sweepQueued = false;
        this.scheduleSweep(workspaceId, state);
      }
    }
  }

  private async runSweep(workspaceId: string, state: WorkspaceState): Promise<void> {
    const isInitial = state.awaitingInitialSweep;
    const entries = workspaceIndexer
      .listFiles(workspaceId)
      .filter((e) => !e.isDirectory);
    const manifest = getCodeFileManifest(workspaceId);
    const bypassCaps = workspaceOverride(workspaceId) === "on";

    let fileCount = 0;
    let totalBytes = 0;
    let processed = 0;
    semanticIndexBroadcaster.broadcast({
      workspaceId,
      phase: "chunking",
      current: 0,
      total: entries.length,
    });

    for (const entry of entries) {
      const relPath = entry.relativePath;

      let st: { mtimeMs: number; size: number };
      try {
        const s = await stat(join(state.path, relPath));
        st = { mtimeMs: Math.trunc(s.mtimeMs), size: s.size };
      } catch {
        continue; // vanished between listing and stat — next sweep will prune it
      }

      const prior = manifest.get(relPath);
      manifest.delete(relPath);

      if (!isIndexableFile(relPath, st.size)) {
        if (prior) deleteFileChunks(workspaceId, relPath);
        continue;
      }
      if (prior && prior.mtimeMs === st.mtimeMs && prior.size === st.size) {
        continue; // unchanged — skip without reading
      }

      if (!bypassCaps) {
        fileCount++;
        totalBytes += st.size;
        if (fileCount > MAX_AUTO_FILES || totalBytes > MAX_AUTO_BYTES) {
          continue; // over the auto-index caps — leave unindexed until "on"
        }
      }

      let buf: Buffer;
      try {
        buf = await readFile(join(state.path, relPath));
      } catch {
        continue;
      }
      if (looksBinary(buf)) {
        if (prior) deleteFileChunks(workspaceId, relPath);
        continue;
      }
      const text = buf.toString("utf8");
      if (looksGenerated(text)) {
        if (prior) deleteFileChunks(workspaceId, relPath);
        continue;
      }

      const fileHash = sha256(text);
      if (prior && prior.fileHash === fileHash) {
        // Content identical despite mtime/size drift (e.g. a checkout) — just
        // touch the manifest, no need to re-chunk (and no risk of wiping the
        // existing chunks the way replaceFileChunks([], ...) would).
        touchCodeFileManifest(workspaceId, relPath, {
          fileHash,
          mtimeMs: st.mtimeMs,
          size: st.size,
        });
        continue;
      }

      const rawChunks = chunkFileContent(text);
      const chunks: CodeChunkInput[] = rawChunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
        contentHash: c.contentHash,
        id: chunkId(workspaceId, relPath, c.chunkIndex, c.contentHash),
      }));
      replaceFileChunks(workspaceId, relPath, chunks, {
        fileHash,
        mtimeMs: st.mtimeMs,
        size: st.size,
      });

      processed++;
      if (processed % 25 === 0) {
        semanticIndexBroadcaster.broadcast({
          workspaceId,
          phase: "chunking",
          current: processed,
          total: entries.length,
        });
      }
    }

    // Anything left in the manifest wasn't in this sweep's file list — deleted
    // or renamed. Prune its chunks.
    for (const staleFilePath of manifest.keys()) {
      deleteFileChunks(workspaceId, staleFilePath);
    }

    state.awaitingInitialSweep = false;
    semanticIndexBroadcaster.broadcast({
      workspaceId,
      phase: "idle",
      current: entries.length,
      total: entries.length,
      initial: isInitial,
      processed,
    });
  }

  private async backfillEmbeddings(workspaceId: string): Promise<void> {
    if (!isVecAvailable() || !embeddingsEnabled() || !isEnabled(workspaceId)) {
      return;
    }
    for (;;) {
      const batch = listChunksNeedingEmbedding(workspaceId, EMBED_BATCH);
      if (batch.length === 0) break;
      const vectors = await embedDocuments(batch.map((c) => c.content));
      if (!vectors) break; // provider failed — retry on a later trigger
      batch.forEach((c, i) => {
        const v = vectors[i];
        if (v) upsertChunkVector(c.id, v);
      });
      semanticIndexBroadcaster.broadcast({
        workspaceId,
        phase: "embedding",
        current: batch.length,
        total: batch.length < EMBED_BATCH ? batch.length : -1,
      });
      if (batch.length < EMBED_BATCH) break;
    }
    semanticIndexBroadcaster.broadcast({
      workspaceId,
      phase: "idle",
      current: 0,
      total: 0,
    });
  }
}

export const semanticIndexer = new SemanticIndexer();
