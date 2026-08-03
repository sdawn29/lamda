/**
 * Client-side mirror of the server's `CompactionMeta` (see
 * `packages/db/src/queries/message-blocks.ts` / `apps/server/src/services/compaction-meta.ts`).
 * What a compaction summarized away: the summary text, the token reclaim figure,
 * and the files it touched.
 */
export interface CompactionMeta {
  summary: string
  tokensBefore: number
  estimatedTokensAfter?: number
  readFiles: string[]
  modifiedFiles: string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string")
}

function validateDetails(details: unknown): {
  readFiles: string[]
  modifiedFiles: string[]
} {
  if (
    details !== null &&
    typeof details === "object" &&
    isStringArray((details as Record<string, unknown>).readFiles) &&
    isStringArray((details as Record<string, unknown>).modifiedFiles)
  ) {
    const d = details as { readFiles: string[]; modifiedFiles: string[] }
    return { readFiles: d.readFiles, modifiedFiles: d.modifiedFiles }
  }
  return { readFiles: [], modifiedFiles: [] }
}

/**
 * Build a `CompactionMeta` from a live `compaction_end` WS event's `result`.
 * `details` is extension-defined and typed `unknown` upstream, so it's
 * validated against the default `{ readFiles, modifiedFiles }` shape rather
 * than trusted — matching the server-side builder this mirrors.
 */
export function buildCompactionMeta(input: {
  summary: string
  tokensBefore: number
  estimatedTokensAfter?: number
  details?: unknown
}): CompactionMeta {
  const { readFiles, modifiedFiles } = validateDetails(input.details)
  return {
    summary: input.summary,
    tokensBefore: input.tokensBefore,
    ...(input.estimatedTokensAfter !== undefined
      ? { estimatedTokensAfter: input.estimatedTokensAfter }
      : {}),
    readFiles,
    modifiedFiles,
  }
}

/**
 * Parse a persisted `message_blocks.compaction_meta` JSON string. The server
 * already validated `details` before persisting, so this only guards against
 * a NULL/malformed column (rows written before this column existed, or a
 * corrupt value) rather than re-validating file-list shapes.
 */
export function parseStoredCompactionMeta(
  raw: string | null
): CompactionMeta | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CompactionMeta>
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.tokensBefore !== "number"
    ) {
      return null
    }
    return {
      summary: parsed.summary,
      tokensBefore: parsed.tokensBefore,
      ...(typeof parsed.estimatedTokensAfter === "number"
        ? { estimatedTokensAfter: parsed.estimatedTokensAfter }
        : {}),
      readFiles: isStringArray(parsed.readFiles) ? parsed.readFiles : [],
      modifiedFiles: isStringArray(parsed.modifiedFiles)
        ? parsed.modifiedFiles
        : [],
    }
  } catch {
    return null
  }
}
