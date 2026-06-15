import { listMemoriesNeedingEmbedding, upsertMemoryVector, isVecAvailable } from "@lamda/db";
import { embeddingsEnabled, embedDocuments } from "@lamda/pi-sdk";

const BATCH = 64;

let running = false;

/**
 * Compute and store embeddings for any memories that don't have one yet, in
 * batches. No-op when sqlite-vec or the embedding provider is unavailable. Safe
 * to call repeatedly — guarded against concurrent runs and entirely best-effort,
 * so a provider outage just leaves rows unembedded (FTS still retrieves them).
 */
export async function backfillMemoryEmbeddings(): Promise<void> {
  if (running || !isVecAvailable() || !embeddingsEnabled()) return;
  running = true;
  try {
    for (;;) {
      const batch = listMemoriesNeedingEmbedding(BATCH);
      if (batch.length === 0) break;
      const texts = batch.map((m) => `${m.title}\n${m.content}`);
      const vectors = await embedDocuments(texts);
      if (!vectors) break; // provider failed — retry on a later trigger
      batch.forEach((m, i) => {
        const v = vectors[i];
        if (v) upsertMemoryVector(m.id, v);
      });
      if (batch.length < BATCH) break;
    }
  } catch {
    // Best-effort.
  } finally {
    running = false;
  }
}

/** Fire-and-forget embedding backfill. */
export function scheduleEmbeddingBackfill(): void {
  void backfillMemoryEmbeddings();
}
