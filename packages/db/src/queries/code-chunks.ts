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
  db.transaction(
    () => {
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
    },
    // These transactions read the current manifest before mutating it. In WAL
    // mode a deferred transaction can lose the read→write upgrade race to a
    // second app/server process, producing SQLITE_BUSY immediately despite the
    // connection's busy_timeout. Acquire the writer slot up front so SQLite
    // waits at BEGIN instead of invalidating the transaction snapshot.
    { behavior: "immediate" },
  );
}

/** Remove a file's chunks (and manifest row) entirely — used when a file is deleted. */
export function deleteFileChunks(workspaceId: string, filePath: string): void {
  db.transaction(
    () => {
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
    },
    { behavior: "immediate" },
  );
}

/** Wipe the entire code index for a workspace (used by manual reindex). */
export function clearWorkspaceChunks(workspaceId: string): void {
  db.transaction(
    () => {
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
    },
    { behavior: "immediate" },
  );
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
export function upsertChunkVector(
  workspaceId: string,
  id: string,
  embedding: number[],
): void {
  if (!isVecAvailable() || embedding.length === 0) return;
  const json = JSON.stringify(embedding);
  try {
    db.run(sql`DELETE FROM code_chunks_vec WHERE id = ${id}`);
    db.run(
      sql`INSERT INTO code_chunks_vec(id, workspace_id, embedding)
          VALUES (${id}, ${workspaceId}, ${json})`,
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

/** Workspace-scoped KNN ids+distances for a query vector, nearest first. */
function vecSearchIds(
  workspaceId: string,
  embedding: number[],
  limit: number,
): { id: string; distance: number }[] {
  if (!isVecAvailable() || embedding.length === 0) return [];
  try {
    return db.all<{ id: string; distance: number }>(sql`
      SELECT id, distance FROM code_chunks_vec
      WHERE workspace_id = ${workspaceId}
        AND embedding MATCH ${JSON.stringify(embedding)}
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

/** Workspace/path-scoped FTS5 candidates, or null when FTS5 is unavailable. */
function ftsRankedIds(
  workspaceId: string,
  queryText: string,
  limit: number,
  pathPrefix?: string,
): string[] | null {
  const match = toFtsQuery(queryText);
  if (!match) return [];
  try {
    const normalizedPath = normalizePathPrefix(pathPrefix);
    const pathCondition = normalizedPath
      ? sql`AND c.file_path LIKE ${`${normalizedPath}%`}`
      : sql``;
    const ranked = db.all<{ id: string }>(sql`
      SELECT f.id
      FROM code_chunks_fts AS f
      INNER JOIN code_chunks AS c ON c.id = f.id
      WHERE code_chunks_fts MATCH ${match}
        AND c.workspace_id = ${workspaceId}
        ${pathCondition}
      ORDER BY bm25(code_chunks_fts)
      LIMIT ${limit}
    `);
    return ranked.map((r) => r.id);
  } catch {
    return null;
  }
}

function normalizePathPrefix(pathPrefix?: string): string | undefined {
  const normalized = pathPrefix?.trim().replace(/^\/+/, "");
  return normalized || undefined;
}

function queryTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(
    0,
    24,
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  for (;;) {
    const found = haystack.indexOf(needle, offset);
    if (found === -1) return count;
    count++;
    offset = found + needle.length;
  }
}

function lexicalBoost(row: CodeChunkRow, terms: string[]): number {
  if (terms.length === 0) return 0;
  const content = row.content.toLowerCase();
  const path = row.filePath.toLowerCase();
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  let boost = 0;
  for (const term of terms) {
    if (path.includes(term)) boost += 0.018;
    if (fileName.includes(term)) boost += 0.025;
    boost += Math.min(0.035, countOccurrences(content, term) * 0.006);
  }
  return boost;
}

function diversifyHits(hits: CodeSearchHit[], limit: number): CodeSearchHit[] {
  const selected: CodeSearchHit[] = [];
  const perFile = new Map<string, number>();
  for (const hit of hits) {
    const count = perFile.get(hit.filePath) ?? 0;
    if (count >= 2 && selected.length < Math.ceil(limit * 0.75)) continue;
    selected.push(hit);
    perFile.set(hit.filePath, count + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length >= limit) return selected;
  for (const hit of hits) {
    if (selected.some((s) => s.id === hit.id)) continue;
    selected.push(hit);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** Substring fallback used when FTS5 is unavailable or returns nothing. */
function searchChunksLike(
  workspaceId: string,
  query: string,
  limit: number,
  pathPrefix?: string,
): CodeSearchHit[] {
  const normalizedPath = normalizePathPrefix(pathPrefix);
  const pattern = `%${query}%`;
  const conditions = [
    eq(codeChunks.workspaceId, workspaceId),
    like(codeChunks.content, pattern),
  ];
  if (normalizedPath)
    conditions.push(like(codeChunks.filePath, `${normalizedPath}%`));
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
 * `retrieveRelevantMemories`. Candidates are workspace-scoped before ranking
 * so other indexed workspaces cannot crowd out the active workspace. Results
 * are then hydrated through the ORM, preserving fused order. Falls back to a substring
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
  const normalizedPath = normalizePathPrefix(pathPrefix);
  const fts = ftsRankedIds(workspaceId, queryText, limit * 12, normalizedPath);
  const vec = queryVector
    ? vecSearchIds(workspaceId, queryVector, limit * 12)
    : [];

  if (fts === null && vec.length === 0) {
    if (!queryText) return { hits: [], mode: "none" };
    return {
      hits: searchChunksLike(workspaceId, queryText, limit, normalizedPath),
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
  if (score.size === 0) {
    return queryText
      ? {
          hits: searchChunksLike(workspaceId, queryText, limit, normalizedPath),
          mode: "like",
        }
      : { hits: [], mode };
  }

  const ids = [...score.keys()];
  const conditions = [
    inArray(codeChunks.id, ids),
    eq(codeChunks.workspaceId, workspaceId),
  ];
  if (normalizedPath)
    conditions.push(like(codeChunks.filePath, `${normalizedPath}%`));
  const rows = db
    .select()
    .from(codeChunks)
    .where(and(...conditions))
    .all() as CodeChunkRow[];

  const terms = queryTerms(queryText);
  const hits = rows
    .map((r) => ({
      id: r.id,
      filePath: r.filePath,
      startLine: r.startLine,
      endLine: r.endLine,
      content: r.content,
      score: (score.get(r.id) ?? 0) + lexicalBoost(r, terms),
    }))
    .sort((a, b) => b.score - a.score);
  const diversified = diversifyHits(hits, limit);

  return { hits: diversified, mode };
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
      embeddedCount =
        db.all<{ count: number }>(sql`
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
