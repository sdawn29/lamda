import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm"
import { db } from "../client.js"
import { agentMemories } from "../schema.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryScope = "user" | "workspace"
export type MemorySource = "agent" | "healing" | "user"

export interface MemoryRow {
  id: string
  scope: MemoryScope
  workspaceId: string | null
  title: string
  content: string
  category: string | null
  source: MemorySource
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
  return workspaceId
    ? or(
        eq(agentMemories.scope, "user"),
        and(eq(agentMemories.scope, "workspace"), eq(agentMemories.workspaceId, workspaceId)),
      )
    : eq(agentMemories.scope, "user")
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
  source?: MemorySource
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
      source: params.source ?? "agent",
      pinned: params.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return id
}

export function updateMemory(
  id: string,
  updates: { title?: string; content?: string; category?: string | null; pinned?: boolean },
): void {
  if (Object.keys(updates).length === 0) return
  db.update(agentMemories)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(agentMemories.id, id))
    .run()
}

export function deleteMemory(id: string): void {
  db.delete(agentMemories).where(eq(agentMemories.id, id)).run()
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

/**
 * Retrieve the memories most relevant to `queryText`, ranked by FTS5 BM25.
 *
 * The FTS table is unscoped, so we over-fetch ranked candidate ids, then
 * scope-filter and hydrate full rows through the ORM, preserving FTS rank order.
 * Falls back to substring search if FTS5 is missing or errors. Returns [] when
 * the text yields no searchable tokens.
 */
export function retrieveRelevantMemories(
  queryText: string,
  workspaceId?: string,
  limit = RELEVANT_LIMIT,
): MemoryRow[] {
  const match = toFtsQuery(queryText)
  if (!match) return []

  let ranked: { id: string }[]
  try {
    ranked = db.all<{ id: string }>(sql`
      SELECT id FROM agent_memories_fts
      WHERE agent_memories_fts MATCH ${match}
      ORDER BY bm25(agent_memories_fts)
      LIMIT ${limit * 4}
    `)
  } catch {
    return searchMemoriesLike(queryText, workspaceId, limit)
  }
  if (ranked.length === 0) return []

  const rank = new Map(ranked.map((r, i) => [r.id, i]))
  const ids = ranked.map((r) => r.id)
  const rows = db
    .select()
    .from(agentMemories)
    .where(and(inArray(agentMemories.id, ids), visibleTo(workspaceId)))
    .all() as MemoryRow[]

  return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).slice(0, limit)
}

/**
 * The set of memories to surface for a single prompt: the always-on pinned core
 * followed by the top relevant matches, deduplicated with core taking priority.
 * Callers apply their own per-session dedup so nothing is injected twice.
 */
export function selectMemoriesForPrompt(queryText: string, workspaceId?: string): MemoryRow[] {
  const core = listCoreMemories(workspaceId)
  const relevant = retrieveRelevantMemories(queryText, workspaceId)
  const seen = new Set<string>()
  const out: MemoryRow[] = []
  for (const m of [...core, ...relevant]) {
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
