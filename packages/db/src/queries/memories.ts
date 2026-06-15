import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm"
import { db, isVecAvailable } from "../client.js"
import { agentMemories } from "../schema.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryScope = "user" | "workspace"
export type MemorySource = "agent" | "healing" | "user"
export type MemoryKind = "fact" | "preference" | "convention" | "decision" | "episode"

export interface MemoryRow {
  id: string
  scope: MemoryScope
  workspaceId: string | null
  title: string
  content: string
  category: string | null
  kind: MemoryKind
  source: MemorySource
  threadId: string | null
  /** JSON-encoded string array of file paths this memory concerns. */
  filePaths: string | null
  confidence: number
  supersededBy: string | null
  pinned: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  useCount: number
}

// ── Retrieval tuning ────────────────────────────────────────────────────────────

/** Pinned memories always injected as standing context, regardless of relevance. */
const CORE_LIMIT = 12
/** Memories retrieved per prompt by relevance to the user's text. */
const RELEVANT_LIMIT = 6
/** Rows returned by an explicit `search` tool call. */
const SEARCH_LIMIT = 25

/**
 * Predicate selecting every memory visible to a workspace: all user-scope rows
 * plus the workspace-scope rows for that workspace (none when no workspace).
 */
function visibleTo(workspaceId?: string) {
  const scopeMatch = workspaceId
    ? or(
        eq(agentMemories.scope, "user"),
        and(eq(agentMemories.scope, "workspace"), eq(agentMemories.workspaceId, workspaceId)),
      )
    : eq(agentMemories.scope, "user")
  // Superseded memories stay in the table for audit but are never retrieved for
  // injection or agent search.
  return and(scopeMatch, isNull(agentMemories.supersededBy))
}

/**
 * Turn free-form prompt text into a safe FTS5 MATCH expression: the distinct
 * alphanumeric tokens of length ≥ 3, OR-ed together as quoted literals so no
 * stray punctuation can break FTS5's query grammar. Returns null when the text
 * has no usable tokens (e.g. "ok", emoji), in which case there is nothing to
 * retrieve on.
 */
function toFtsQuery(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g)
  if (!tokens) return null
  const unique = [...new Set(tokens)].slice(0, 32)
  if (unique.length === 0) return null
  return unique.map((t) => `"${t}"`).join(" OR ")
}

// ── Writes ──────────────────────────────────────────────────────────────────────

export function insertMemory(params: {
  scope: MemoryScope
  workspaceId?: string | null
  title: string
  content: string
  category?: string | null
  kind?: MemoryKind
  source?: MemorySource
  threadId?: string | null
  filePaths?: string[] | null
  confidence?: number
  pinned?: boolean
}): string {
  if (params.scope === "workspace" && !params.workspaceId) {
    throw new Error("workspace-scoped memories require a workspaceId")
  }
  const id = randomUUID()
  const now = Date.now()
  db.insert(agentMemories)
    .values({
      id,
      scope: params.scope,
      workspaceId: params.scope === "workspace" ? params.workspaceId : null,
      title: params.title,
      content: params.content,
      category: params.category ?? null,
      kind: params.kind ?? "fact",
      source: params.source ?? "agent",
      threadId: params.threadId ?? null,
      filePaths:
        params.filePaths && params.filePaths.length ? JSON.stringify(params.filePaths) : null,
      confidence: params.confidence ?? 1,
      pinned: params.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return id
}

export function updateMemory(
  id: string,
  updates: {
    title?: string
    content?: string
    category?: string | null
    kind?: MemoryKind
    filePaths?: string[] | null
    confidence?: number
    supersededBy?: string | null
    pinned?: boolean
  },
): void {
  const { filePaths, ...rest } = updates
  const set: Record<string, unknown> = { ...rest }
  if (filePaths !== undefined) {
    set.filePaths = filePaths && filePaths.length ? JSON.stringify(filePaths) : null
  }
  if (Object.keys(set).length === 0) return
  db.update(agentMemories)
    .set({ ...set, updatedAt: Date.now() })
    .where(eq(agentMemories.id, id))
    .run()
}

export function deleteMemory(id: string): void {
  db.delete(agentMemories).where(eq(agentMemories.id, id)).run()
  deleteMemoryVector(id)
}

// ── Vectors (semantic retrieval) ─────────────────────────────────────────────────

/**
 * Store/replace the embedding for a memory in the vec0 table. No-op when
 * sqlite-vec is unavailable. The vector is passed as a plain number[]; sqlite-vec
 * parses the JSON-encoded array for a float[] column.
 */
export function upsertMemoryVector(id: string, embedding: number[]): void {
  if (!isVecAvailable() || embedding.length === 0) return
  const json = JSON.stringify(embedding)
  try {
    db.run(sql`DELETE FROM agent_memories_vec WHERE id = ${id}`)
    db.run(sql`INSERT INTO agent_memories_vec(id, embedding) VALUES (${id}, ${json})`)
  } catch {
    // Dimension mismatch or vec unavailable — skip silently.
  }
}

/** Remove a memory's embedding. No-op when sqlite-vec is unavailable. */
export function deleteMemoryVector(id: string): void {
  if (!isVecAvailable()) return
  try {
    db.run(sql`DELETE FROM agent_memories_vec WHERE id = ${id}`)
  } catch {
    // Ignore.
  }
}

/**
 * Memories that have no embedding yet (id + the text to embed), oldest first.
 * Drives the background embedding backfill.
 */
export function listMemoriesNeedingEmbedding(
  limit = 100,
): { id: string; title: string; content: string }[] {
  if (!isVecAvailable()) return []
  try {
    return db.all<{ id: string; title: string; content: string }>(sql`
      SELECT m.id, m.title, m.content
      FROM agent_memories m
      WHERE m.id NOT IN (SELECT id FROM agent_memories_vec)
      ORDER BY m.created_at ASC
      LIMIT ${limit}
    `)
  } catch {
    return []
  }
}

/** KNN ids for a query vector, nearest first. [] when sqlite-vec is unavailable. */
function vecSearchIds(embedding: number[], limit: number): string[] {
  if (!isVecAvailable() || embedding.length === 0) return []
  try {
    const rows = db.all<{ id: string }>(sql`
      SELECT id FROM agent_memories_vec
      WHERE embedding MATCH ${JSON.stringify(embedding)}
      ORDER BY distance
      LIMIT ${limit}
    `)
    return rows.map((r) => r.id)
  } catch {
    return []
  }
}

/**
 * Reinforce a memory: raise its confidence (capped at 1) and refresh updatedAt.
 * Used when a memory is re-observed, so repeatedly-confirmed facts outrank
 * one-offs. Returns the new confidence.
 */
export function bumpConfidence(id: string, delta = 0.1): number {
  const row = getMemory(id)
  if (!row) return 0
  const next = Math.min(1, row.confidence + delta)
  db.update(agentMemories)
    .set({ confidence: next, updatedAt: Date.now() })
    .where(eq(agentMemories.id, id))
    .run()
  return next
}

/**
 * Mark `oldId` as superseded by `newId` (a contradicting/replacing memory) and
 * drop its confidence, so it's retained for audit but no longer retrieved.
 */
export function supersedeMemory(oldId: string, newId: string): void {
  db.update(agentMemories)
    .set({ supersededBy: newId, confidence: 0, updatedAt: Date.now() })
    .where(eq(agentMemories.id, oldId))
    .run()
}

/**
 * Find a non-superseded memory with the same title (case-insensitive) visible to
 * the workspace — used to reinforce rather than duplicate on re-observation.
 */
export function findMemoryByTitle(title: string, workspaceId?: string): MemoryRow | undefined {
  return db
    .select()
    .from(agentMemories)
    .where(and(visibleTo(workspaceId), sql`lower(${agentMemories.title}) = ${title.toLowerCase()}`))
    .get() as MemoryRow | undefined
}

/** Record that these memories were surfaced to the agent (does not bump updatedAt). */
export function touchMemoryUse(ids: string[]): void {
  if (ids.length === 0) return
  db.update(agentMemories)
    .set({ lastUsedAt: Date.now(), useCount: sql`${agentMemories.useCount} + 1` })
    .where(inArray(agentMemories.id, ids))
    .run()
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getMemory(id: string): MemoryRow | undefined {
  return db.select().from(agentMemories).where(eq(agentMemories.id, id)).get() as
    | MemoryRow
    | undefined
}

export function listMemories(filter?: {
  scope?: MemoryScope
  workspaceId?: string
}): MemoryRow[] {
  const conditions = []
  if (filter?.scope) conditions.push(eq(agentMemories.scope, filter.scope))
  if (filter?.workspaceId) conditions.push(eq(agentMemories.workspaceId, filter.workspaceId))
  return db
    .select()
    .from(agentMemories)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(agentMemories.updatedAt))
    .all() as MemoryRow[]
}

// ── Retrieval ───────────────────────────────────────────────────────────────────

/**
 * Pinned memories visible to the workspace — the always-on core context injected
 * into every session regardless of what the user asks.
 */
export function listCoreMemories(workspaceId?: string, limit = CORE_LIMIT): MemoryRow[] {
  return db
    .select()
    .from(agentMemories)
    .where(and(visibleTo(workspaceId), eq(agentMemories.pinned, true)))
    .orderBy(desc(agentMemories.updatedAt))
    .limit(limit)
    .all() as MemoryRow[]
}

/**
 * Substring fallback used when FTS5 is unavailable or returns nothing. Matches
 * the literal query against title/content, newest first.
 */
function searchMemoriesLike(query: string, workspaceId?: string, limit = SEARCH_LIMIT): MemoryRow[] {
  const pattern = `%${query}%`
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        visibleTo(workspaceId),
        or(like(agentMemories.title, pattern), like(agentMemories.content, pattern)),
      ),
    )
    .orderBy(desc(agentMemories.updatedAt))
    .limit(limit)
    .all() as MemoryRow[]
}

/** FTS5 BM25-ranked candidate ids, or null when FTS5 is unavailable/errors. */
function ftsRankedIds(queryText: string, limit: number): string[] | null {
  const match = toFtsQuery(queryText)
  if (!match) return []
  try {
    const ranked = db.all<{ id: string }>(sql`
      SELECT id FROM agent_memories_fts
      WHERE agent_memories_fts MATCH ${match}
      ORDER BY bm25(agent_memories_fts)
      LIMIT ${limit}
    `)
    return ranked.map((r) => r.id)
  } catch {
    return null
  }
}

/**
 * Reciprocal-rank-fusion constant. Larger values flatten the contribution of
 * top ranks; 60 is the conventional default.
 */
const RRF_K = 60

/**
 * Retrieve the memories most relevant to a prompt, fusing FTS5 BM25 keyword
 * ranking with semantic vector KNN (when `queryVector` is supplied and
 * sqlite-vec is available) via reciprocal rank fusion.
 *
 * Both indexes are unscoped, so we over-fetch ranked candidate ids, fuse, then
 * scope-filter and hydrate full rows through the ORM preserving fused order.
 * Falls back to substring search when FTS5 is missing and there's no vector.
 * Returns [] when nothing matches.
 */
export function retrieveRelevantMemories(
  queryText: string,
  workspaceId?: string,
  limit = RELEVANT_LIMIT,
  queryVector?: number[],
): MemoryRow[] {
  const fts = ftsRankedIds(queryText, limit * 4)
  const vec = queryVector ? vecSearchIds(queryVector, limit * 4) : []

  // FTS unavailable and no semantic signal — fall back to literal substring.
  if (fts === null && vec.length === 0) {
    return queryText ? searchMemoriesLike(queryText, workspaceId, limit) : []
  }

  // Reciprocal rank fusion across whichever lists produced candidates.
  const score = new Map<string, number>()
  const fuse = (ids: string[]) => {
    ids.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)))
  }
  if (fts) fuse(fts)
  fuse(vec)
  if (score.size === 0) return []

  const ids = [...score.keys()]
  const rows = db
    .select()
    .from(agentMemories)
    .where(and(inArray(agentMemories.id, ids), visibleTo(workspaceId)))
    .all() as MemoryRow[]

  // Blend retrieval relevance (RRF) with salience: a confident, recently-used
  // memory outranks an equally-relevant stale one, so unreinforced memories
  // gradually sink. Confidence in [0,1] scales 0.5→1; recency decays over ~30d.
  const now = Date.now()
  const salience = (m: MemoryRow): number => {
    const rrf = score.get(m.id) ?? 0
    const conf = 0.5 + 0.5 * Math.max(0, Math.min(1, m.confidence))
    const last = m.lastUsedAt ?? m.updatedAt
    const ageDays = Math.max(0, (now - last) / 86_400_000)
    const recency = 0.6 + 0.4 * Math.exp(-ageDays / 30)
    return rrf * conf * recency
  }

  return rows.sort((a, b) => salience(b) - salience(a)).slice(0, limit)
}

/**
 * Memories tagged with any of `paths` in their `file_paths`, newest first. Lets
 * prior episodes/decisions about a file surface when the agent re-enters that
 * area, even when the prompt text shares no keywords. Filtering is done in JS
 * over the (small) visible set, so path matching is exact rather than substring.
 */
export function retrieveByFilePaths(
  paths: string[],
  workspaceId?: string,
  limit = RELEVANT_LIMIT,
): MemoryRow[] {
  const wanted = new Set(paths.filter(Boolean))
  if (wanted.size === 0) return []
  const rows = db
    .select()
    .from(agentMemories)
    .where(and(visibleTo(workspaceId), sql`${agentMemories.filePaths} IS NOT NULL`))
    .orderBy(desc(agentMemories.updatedAt))
    .all() as MemoryRow[]
  const out: MemoryRow[] = []
  for (const row of rows) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.filePaths ?? "[]")
    } catch {
      continue
    }
    if (Array.isArray(parsed) && parsed.some((p) => typeof p === "string" && wanted.has(p))) {
      out.push(row)
      if (out.length >= limit) break
    }
  }
  return out
}

/**
 * The set of memories to surface for a single prompt: the always-on pinned core,
 * the top relevant matches, and memories tied to the files currently in play —
 * deduplicated with core taking priority. Callers apply their own per-session
 * dedup so nothing is injected twice.
 */
export function selectMemoriesForPrompt(
  queryText: string,
  workspaceId?: string,
  activeFiles?: string[],
  queryVector?: number[],
): MemoryRow[] {
  const core = listCoreMemories(workspaceId)
  const relevant = retrieveRelevantMemories(queryText, workspaceId, RELEVANT_LIMIT, queryVector)
  const byFile = activeFiles?.length ? retrieveByFilePaths(activeFiles, workspaceId) : []
  const seen = new Set<string>()
  const out: MemoryRow[] = []
  for (const m of [...core, ...relevant, ...byFile]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}

/**
 * Explicit search for the `memory` tool and settings UI: FTS5 relevance first,
 * substring match as a fallback so exact phrases the tokenizer splits still hit.
 */
export function searchMemories(query: string, workspaceId?: string): MemoryRow[] {
  const ranked = retrieveRelevantMemories(query, workspaceId, SEARCH_LIMIT)
  if (ranked.length > 0) return ranked
  return searchMemoriesLike(query, workspaceId)
}
