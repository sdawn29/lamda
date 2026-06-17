/**
 * Robust memory creation, shared by every write path (the `memory` tool and the
 * background reflection pass). Wraps the raw `insertMemory` with three guards so
 * the store stays clean and safe regardless of which path created the memory:
 *
 *  1. Secret scanning — never persist credential-shaped text.
 *  2. Deduplication — an exact-title match or a near-identical embedding
 *     reinforces the existing memory (bumps confidence) instead of stacking a copy.
 *  3. Supersession — a same-title memory with changed content is treated as the
 *     fact being updated: the old row is kept for audit but marked superseded.
 *
 * On insert it also computes and stores the embedding inline so semantic
 * retrieval and future dedup work immediately, without waiting for the backfill.
 */

import {
  insertMemory,
  getMemory,
  findMemoryByTitle,
  bumpConfidence,
  supersedeMemory,
  updateMemory,
  nearestVisibleMemories,
  upsertMemoryVector,
  type MemoryRow,
  type MemoryScope,
  type MemoryKind,
  type MemorySource,
} from "@lamda/db"
import { embedDocuments } from "./embeddings.js"

/**
 * vec0 L2 distance below which two memories are treated as the same fact phrased
 * differently. Voyage embeddings are unit-normalised, so this corresponds to a
 * cosine similarity of ~0.9 (d² = 2·(1 − cos)). Deliberately strict to avoid
 * merging distinct-but-related facts.
 */
const DEDUP_DISTANCE = 0.45

export type PersistOutcome = "created" | "reinforced" | "superseded" | "rejected"

export interface PersistResult {
  outcome: PersistOutcome
  /** The resulting memory (the survivor for reinforce, the new row otherwise). */
  row?: MemoryRow
  /** Human-readable note, e.g. the reason a write was rejected. */
  message?: string
}

export interface PersistMemoryInput {
  scope: MemoryScope
  /** Workspace the write happens in: storage target for `workspace` scope, and
   *  the visibility context for dedup lookups. */
  workspaceId?: string
  title: string
  content: string
  category?: string | null
  kind?: MemoryKind
  source: MemorySource
  threadId?: string | null
  filePaths?: string[] | null
  confidence?: number
  pinned?: boolean
}

// ── Secret scanning ─────────────────────────────────────────────────────────────

/**
 * High-precision detector for credential-shaped text. Tuned to catch obvious
 * secrets (provider key prefixes, private-key blocks, JWTs) while almost never
 * flagging legitimate prose, so a stray API key never ends up persisted even if
 * the model ignores the "never save secrets" instruction.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key blocks
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bsk-[A-Za-z0-9_-]{16,}\b/, // OpenAI-style secret keys
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/, // GitHub fine-grained PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT
  // key/secret/password/token assigned a long opaque value
  /\b(?:api[_-]?key|secret|password|passwd|token|bearer)\b['"\s:=]+[^\s'"]{12,}/i,
]

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text))
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Whitespace/case-insensitive content equality — "the same fact restated". */
function sameContent(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")
  return norm(a) === norm(b)
}

// ── Persist ───────────────────────────────────────────────────────────────────

/**
 * Create a memory with secret-scanning, dedup and supersession applied. Pure
 * best-effort on the embedding side: when no provider is configured it still
 * inserts (FTS keyword retrieval covers it) and dedups on exact title only.
 */
export async function persistMemory(input: PersistMemoryInput): Promise<PersistResult> {
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title || !content) {
    return { outcome: "rejected", message: "title and content are required" }
  }

  // 1. Secret guard — applies to every write path.
  if (looksLikeSecret(title) || looksLikeSecret(content)) {
    return {
      outcome: "rejected",
      message: "Refused: the title or content looks like a secret (key/token/password).",
    }
  }

  const ctxWorkspaceId = input.workspaceId
  const insertParams = {
    scope: input.scope,
    workspaceId: input.scope === "workspace" ? input.workspaceId : null,
    title,
    content,
    category: input.category ?? null,
    kind: input.kind ?? "fact",
    source: input.source,
    threadId: input.threadId ?? null,
    filePaths: input.filePaths ?? null,
    confidence: input.confidence,
    pinned: input.pinned ?? false,
  }

  // Embed up front (best-effort) — drives both semantic dedup and the stored vector.
  const embedding = (await embedDocuments([`${title}\n${content}`]).catch(() => null))?.[0] ?? null

  // 2. Exact-title match — same subject. Reinforce if unchanged, supersede if the
  //    fact's content has changed (auditable update).
  const titleMatch = findMemoryByTitle(title, ctxWorkspaceId)
  if (titleMatch) {
    if (sameContent(titleMatch.content, content)) {
      bumpConfidence(titleMatch.id)
      return { outcome: "reinforced", row: getMemory(titleMatch.id) }
    }
    const id = insertMemory(insertParams)
    supersedeMemory(titleMatch.id, id)
    if (embedding) upsertMemoryVector(id, embedding)
    return { outcome: "superseded", row: getMemory(id) }
  }

  // 3. Semantic near-duplicate (different wording, same meaning) — reinforce the
  //    existing one rather than storing a paraphrase.
  if (embedding) {
    const [nearest] = nearestVisibleMemories(embedding, ctxWorkspaceId, 3)
    if (nearest && nearest.distance <= DEDUP_DISTANCE) {
      bumpConfidence(nearest.row.id)
      // Carry over file associations the duplicate brought, if any are new.
      if (input.filePaths?.length) {
        let existing: string[] = []
        try {
          const parsed = nearest.row.filePaths ? JSON.parse(nearest.row.filePaths) : []
          if (Array.isArray(parsed))
            existing = parsed.filter((p): p is string => typeof p === "string")
        } catch {
          // Malformed JSON — treat as no existing paths.
        }
        const merged = [...new Set([...existing, ...input.filePaths])]
        if (merged.length !== existing.length) updateMemory(nearest.row.id, { filePaths: merged })
      }
      return { outcome: "reinforced", row: getMemory(nearest.row.id) }
    }
  }

  // 4. Genuinely new — insert and store its vector inline.
  const id = insertMemory(insertParams)
  if (embedding) upsertMemoryVector(id, embedding)
  return { outcome: "created", row: getMemory(id) }
}
