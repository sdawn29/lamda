import type { CompactionMeta } from "@lamda/db";

/**
 * Fields needed to build a `CompactionMeta` — a subset of pi's `CompactionResult`
 * (server call site) or of a JSONL `CompactionEntry` (fork seeding call site).
 * `estimatedTokensAfter` isn't available from the fork path, hence optional.
 */
export interface CompactionMetaInput {
  summary: string;
  tokensBefore: number;
  estimatedTokensAfter?: number;
  /** Extension-defined; validated against the default shape before use. */
  details?: unknown;
}

/**
 * Build a `CompactionMeta` for persistence, validating `details` rather than
 * trusting it — pi types it `unknown` because extensions can put arbitrary data
 * there. A `details` that doesn't match the default `{ readFiles, modifiedFiles }`
 * shape degrades to empty file lists instead of throwing or persisting garbage.
 */
export function buildCompactionMeta(input: CompactionMetaInput): CompactionMeta {
  const { readFiles, modifiedFiles } = validateCompactionDetails(input.details);
  return {
    summary: input.summary,
    tokensBefore: input.tokensBefore,
    ...(input.estimatedTokensAfter !== undefined
      ? { estimatedTokensAfter: input.estimatedTokensAfter }
      : {}),
    readFiles,
    modifiedFiles,
  };
}

function validateCompactionDetails(details: unknown): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  if (
    details !== null &&
    typeof details === "object" &&
    isStringArray((details as Record<string, unknown>).readFiles) &&
    isStringArray((details as Record<string, unknown>).modifiedFiles)
  ) {
    const d = details as { readFiles: string[]; modifiedFiles: string[] };
    return { readFiles: d.readFiles, modifiedFiles: d.modifiedFiles };
  }
  return { readFiles: [], modifiedFiles: [] };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
