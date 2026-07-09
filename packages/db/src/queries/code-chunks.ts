import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, isVecAvailable } from "../client.js";
import { codeChunks, codeFiles } from "../schema.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodeChunkInput {
  id: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

export interface CodeFileMeta {
  fileHash: string;
  mtimeMs: number;
  size: number;
}

export interface CodeChunkRow {
  id: string;
  workspaceId: string;
  filePath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  createdAt: number;
}

export type CodeSearchMode = "hybrid" | "fts" | "like" | "none";

export interface CodeSearchHit {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

export interface CodeSearchResult {
  hits: CodeSearchHit[];
  mode: CodeSearchMode;
}

// ── Writes ────────────────────────────────────────────────────────────────────

const CHUNK_INSERT_BATCH = 200;

/**
 * Replace all chunks for a single file with `chunks`, diffing by content-
 * addressed id so unchanged chunks (and their vec0 embeddings) are left alone
 * — only chunks whose content actually changed get deleted+reinserted (and so
 * need re-embedding). Also upserts the file's manifest row.
 */
export function replaceFileChunks(
  workspaceId: string,
  filePath: string,
  chunks: CodeChunkInput[],
  fileMeta: CodeFileMeta,
): void {
  db.transaction(() => {
    const existing = db
      .select({ id: codeChunks.id })
      .from(codeChunks)
      .where(
        and(
          eq(codeChunks.workspaceId, workspaceId),
          eq(codeChunks.filePath, filePath),
        ),
      )
      .all()
      .map((r) => r.id);

    const nextIds = new Set(chunks.map((c) => c.id));
    const toDelete = existing.filter((id) => !nextIds.has(id));
    if (toDelete.length > 0) {
      db.delete(codeChunks).where(inArray(codeChunks.id, toDelete)).run();
      deleteChunkVectors(toDelete);
    }

    const existingIds = new Set(existing);
    const toInsert = chunks.filter((c) => !existingIds.has(c.id));
    const now = Date.now();
    for (let i = 0; i < toInsert.length; i += CHUNK_INSERT_BATCH) {
      const batch = toInsert.slice(i, i + CHUNK_INSERT_BATCH);
      db.insert(codeChunks)
        .values(
          batch.map((c) => ({
            id: c.id,
            workspaceId,
            filePath,
            chunkIndex: c.chunkIndex,
            startLine: c.startLine,
            endLine: c.endLine,
            content: c.content,
            contentHash: c.contentHash,
            createdAt: now,
          })),
        )
        .onConflictDoNothing()
        .run();
    }

    db.insert(codeFiles)
      .values({
        workspaceId,
        filePath,
        fileHash: fileMeta.fileHash,
        mtimeMs: fileMeta.mtimeMs,
        size: fileMeta.size,
        chunkCount: chunks.length,
        indexedAt: now,
      })
      .onConflictDoUpdate({
        target: [codeFiles.workspaceId, codeFiles.filePath],
        set: {
          fileHash: fileMeta.fileHash,
          mtimeMs: fileMeta.mtimeMs,
          size: fileMeta.size,
          chunkCount: chunks.length,
          indexedAt: now,
        },
      })
      .run();
  });
}

/** Remove a file's chunks (and manifest row) entirely — used when a file is deleted. */
export function deleteFileChunks(workspaceId: string, filePath: string): void {
  db.transaction(() => {
    const ids = db
      .select({ id: codeChunks.id })
      .from(codeChunks)
      .where(
        and(
          eq(codeChunks.workspaceId, workspaceId),
          eq(codeChunks.filePath, filePath),
        ),
      )
      .all()
      .map((r) => r.id);
    if (ids.length > 0) {
      db.delete(codeChunks).where(inArray(codeChunks.id, ids)).run();
      deleteChunkVectors(ids);
    }
    db.delete(codeFiles)
      .where(
        and(
          eq(codeFiles.workspaceId, workspaceId),
          eq(codeFiles.filePath, filePath),
        ),
      )
      .run();
  });
}

/** Wipe the entire code index for a workspace (used by manual reindex). */
export function clearWorkspaceChunks(workspaceId: string): void {
  db.transaction(() => {
    const ids = db
      .select({ id: codeChunks.id })
      .from(codeChunks)
      .where(eq(codeChunks.workspaceId, workspaceId))
      .all()
      .map((r) => r.id);
    if (ids.length > 0) {
      db.delete(codeChunks).where(inArray(codeChunks.id, ids)).run();
      deleteChunkVectors(ids);
    }
    db.delete(codeFiles).where(eq(codeFiles.workspaceId, workspaceId)).run();
  });
}

/**
 * Update only a file's manifest row (mtime/size/indexedAt) without touching its
 * chunks — used when a file's content hash is unchanged despite its mtime/size
 * drifting (e.g. a checkout), so re-chunking and re-embedding are skipped.
 */
export function touchCodeFileManifest(
  workspaceId: string,
  filePath: string,
  fileMeta: CodeFileMeta,
): void {
  db.update(codeFiles)
    .set({
      fileHash: fileMeta.fileHash,
      mtimeMs: fileMeta.mtimeMs,
      size: fileMeta.size,
      indexedAt: Date.now(),
    })
    .where(
      and(
        eq(codeFiles.workspaceId, workspaceId),
        eq(codeFiles.filePath, filePath),
      ),
    )
    .run();
}

/** Manifest of currently-indexed files for a workspace, for incremental diffing. */
export function getCodeFileManifest(
  workspaceId: string,
): Map<string, CodeFileMeta> {
  const rows = db
    .select({
      filePath: codeFiles.filePath,
      fileHash: codeFiles.fileHash,
      mtimeMs: codeFiles.mtimeMs,
      size: codeFiles.size,
    })
    .from(codeFiles)
    .where(eq(codeFiles.workspaceId, workspaceId))
    .all();
  return new Map(
    rows.map((r) => [
      r.filePath,
      { fileHash: r.fileHash, mtimeMs: r.mtimeMs, size: r.size },
    ]),
  );
}

// ── Vectors (semantic retrieval) ─────────────────────────────────────────────

/**
 * Store/replace the embedding for a chunk in the vec0 table. No-op when
 * sqlite-vec is unavailable.
 */
export function upsertChunkVector(id: string, embedding: number[]): void {
  if (!isVecAvailable() || embedding.length === 0) return;
  const json = JSON.stringify(embedding);
  try {
    db.run(sql`DELETE FROM code_chunks_vec WHERE id = ${id}`);
    db.run(
      sql`INSERT INTO code_chunks_vec(id, embedding) VALUES (${id}, ${json})`,
    );
  } catch {
    // Dimension mismatch or vec unavailable — skip silently.
  }
}

function deleteChunkVectors(ids: string[]): void {
  if (!isVecAvailable() || ids.length === 0) return;
  try {
    for (const id of ids) {
      db.run(sql`DELETE FROM code_chunks_vec WHERE id = ${id}`);
    }
  } catch {
    // Ignore.
  }
}

/**
 * Chunks belonging to a workspace that have no embedding yet, oldest first.
 * Drives the background embedding backfill. Content-addressed ids mean a chunk
 * only reappears here if its content actually changed since it was last embedded.
 */
export function listChunksNeedingEmbedding(
  workspaceId: string,
  limit = 64,
): { id: string; content: string }[] {
  if (!isVecAvailable()) return [];
  try {
    return db.all<{ id: string; content: string }>(sql`
      SELECT c.id, c.content
      FROM code_chunks c
      WHERE c.workspace_id = ${workspaceId}
        AND c.id NOT IN (SELECT id FROM code_chunks_vec)
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `);
  } catch {
    return [];
  }
}

/** KNN ids+distances for a query vector, nearest first. Unscoped — over-fetch and filter. */
function vecSearchIds(
  embedding: number[],
  limit: number,
): { id: string; distance: number }[] {
  if (!isVecAvailable() || embedding.length === 0) return [];
  try {
    return db.all<{ id: string; distance: number }>(sql`
      SELECT id, distance FROM code_chunks_vec
      WHERE embedding MATCH ${JSON.stringify(embedding)}
      ORDER BY distance
      LIMIT ${limit}
    `);
  } catch {
    return [];
  }
}

/**
 * Turn free-form query text into a safe FTS5 MATCH expression — same sanitizer
 * as the memory index (distinct alphanumeric tokens ≥3 chars, OR-ed together).
 */
function toFtsQuery(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g);
  if (!tokens) return null;
  const unique = [...new Set(tokens)].slice(0, 32);
  if (unique.length === 0) return null;
  return unique.map((t) => `"${t}"`).join(" OR ");
}

/** FTS5 BM25-ranked candidate ids, or null when FTS5 is unavailable/errors. */
function ftsRankedIds(queryText: string, limit: number): string[] | null {
  const match = toFtsQuery(queryText);
  if (!match) return [];
  try {
    const ranked = db.all<{ id: string }>(sql`
      SELECT id FROM code_chunks_fts
      WHERE code_chunks_fts MATCH ${match}
      ORDER BY bm25(code_chunks_fts)
      LIMIT ${limit}
    `);
    return ranked.map((r) => r.id);
  } catch {
    return null;
  }
}

/** Substring fallback used when FTS5 is unavailable or returns nothing. */
function searchChunksLike(
  workspaceId: string,
  query: string,
  limit: number,
  pathPrefix?: string,
): CodeSearchHit[] {
  const pattern = `%${query}%`;
  const conditions = [
    eq(codeChunks.workspaceId, workspaceId),
    like(codeChunks.content, pattern),
  ];
  if (pathPrefix) conditions.push(like(codeChunks.filePath, `${pathPrefix}%`));
  const rows = db
    .select()
    .from(codeChunks)
    .where(and(...conditions))
    .limit(limit)
    .all() as CodeChunkRow[];
  return rows.map((r) => ({
    id: r.id,
    filePath: r.filePath,
    startLine: r.startLine,
    endLine: r.endLine,
    content: r.content,
    score: 0,
  }));
}

const RRF_K = 60;

/**
 * Search code chunks for a workspace, fusing FTS5 BM25 keyword ranking with
 * semantic vector KNN (when `queryVector` is supplied and sqlite-vec is
 * available) via reciprocal rank fusion — same shape as
 * `retrieveRelevantMemories`. Both indexes are unscoped, so candidates are
 * over-fetched, then scope-filtered (+ optional path-prefix filter) and
 * hydrated through the ORM, preserving fused order. Falls back to a substring
 * search when FTS5 is unavailable and there's no vector, and reports which
 * mode actually served the results so callers can surface index state.
 */
export function searchCodeChunks(
  workspaceId: string,
  queryText: string,
  queryVector?: number[],
  limit = 8,
  pathPrefix?: string,
): CodeSearchResult {
  const fts = ftsRankedIds(queryText, limit * 8);
  const vec = queryVector ? vecSearchIds(queryVector, limit * 8) : [];

  if (fts === null && vec.length === 0) {
    if (!queryText) return { hits: [], mode: "none" };
    return {
      hits: searchChunksLike(workspaceId, queryText, limit, pathPrefix),
      mode: "like",
    };
  }

  const score = new Map<string, number>();
  const fuse = (ids: string[]) => {
    ids.forEach((id, i) =>
      score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)),
    );
  };
  if (fts) fuse(fts);
  fuse(vec.map((v) => v.id));
  const mode: CodeSearchMode = vec.length > 0 ? "hybrid" : "fts";
  if (score.size === 0) return { hits: [], mode };

  const ids = [...score.keys()];
  const conditions = [
    inArray(codeChunks.id, ids),
    eq(codeChunks.workspaceId, workspaceId),
  ];
  if (pathPrefix) conditions.push(like(codeChunks.filePath, `${pathPrefix}%`));
  const rows = db
    .select()
    .from(codeChunks)
    .where(and(...conditions))
    .all() as CodeChunkRow[];

  const hits = rows
    .map((r) => ({
      id: r.id,
      filePath: r.filePath,
      startLine: r.startLine,
      endLine: r.endLine,
      content: r.content,
      score: score.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { hits, mode };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface CodeIndexStats {
  fileCount: number;
  chunkCount: number;
  embeddedCount: number;
  lastIndexedAt: number | null;
}

export function getCodeIndexStats(workspaceId: string): CodeIndexStats {
  const fileRow = db.all<{ count: number; lastIndexedAt: number | null }>(sql`
    SELECT COUNT(*) as count, MAX(indexed_at) as lastIndexedAt
    FROM code_files WHERE workspace_id = ${workspaceId}
  `)[0];
  const chunkRow = db.all<{ count: number }>(sql`
    SELECT COUNT(*) as count FROM code_chunks WHERE workspace_id = ${workspaceId}
  `)[0];
  let embeddedCount = 0;
  if (isVecAvailable()) {
    try {
      embeddedCount = db.all<{ count: number }>(sql`
        SELECT COUNT(*) as count FROM code_chunks_vec
        WHERE id IN (SELECT id FROM code_chunks WHERE workspace_id = ${workspaceId})
      `)[0]?.count ?? 0;
    } catch {
      embeddedCount = 0;
    }
  }
  return {
    fileCount: fileRow?.count ?? 0,
    chunkCount: chunkRow?.count ?? 0,
    embeddedCount,
    lastIndexedAt: fileRow?.lastIndexedAt ?? null,
  };
}
