import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { searchCodeChunks, getCodeIndexStats, isVecAvailable } from "@lamda/db";
import { embeddingsEnabled, embedQuery } from "@lamda/pi-sdk";

export const SEMANTIC_SEARCH_TOOL_NAME = "semantic_search";

const DEFAULT_MAX_RESULTS = 8;
const HARD_MAX_RESULTS = 20;

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: {},
  };
}

function fail(message: string) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    details: {},
  };
}

/**
 * Tool that searches this workspace's chunked file content by meaning
 * (semantic embedding KNN) fused with keyword (FTS5) ranking, falling back to
 * plain keyword/substring search when local vectors aren't available. Prefer
 * this over `grep` for conceptual queries — "where do we validate emails",
 * "how are worktrees cleaned up" — where the exact wording isn't known;
 * `grep` still wins for an exact string, symbol, or error message.
 */
export function createSemanticSearchTool(workspaceId: string): ToolDefinition {
  return {
    name: SEMANTIC_SEARCH_TOOL_NAME,
    label: "semantic search",
    description: `Search this workspace's code by meaning, not just exact text — good for conceptual questions like "where is rate limiting enforced" or "how does auth token refresh work" when you don't know the exact identifiers to grep for.

Returns the most relevant chunks of code (file, line range, snippet). The index is built and kept fresh in the background; if it isn't ready yet or nothing matches, fall back to \`grep\`/\`find\`.`,
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language or keyword description of what you're looking for.",
        },
        max_results: {
          type: "number",
          description: `Max results to return (default ${DEFAULT_MAX_RESULTS}, capped at ${HARD_MAX_RESULTS}).`,
        },
        path: {
          type: "string",
          description:
            'Optional path prefix to restrict results to (e.g. "apps/server/src").',
        },
      },
    },
    execute: async (_toolCallId, params, signal) => {
      const p = (params ?? {}) as Record<string, unknown>;
      const query = typeof p.query === "string" ? p.query.trim() : "";
      if (!query) return fail("`query` is required.");

      const maxResults =
        typeof p.max_results === "number" && Number.isFinite(p.max_results)
          ? Math.min(HARD_MAX_RESULTS, Math.max(1, Math.floor(p.max_results)))
          : DEFAULT_MAX_RESULTS;
      const path =
        typeof p.path === "string" && p.path.trim() ? p.path.trim() : undefined;

      let queryVector: number[] | undefined;
      if (isVecAvailable() && embeddingsEnabled()) {
        queryVector =
          (await embedQuery(query, signal).catch(() => null)) ?? undefined;
      }

      const { hits, mode } = searchCodeChunks(
        workspaceId,
        query,
        queryVector,
        maxResults,
        path,
      );

      if (hits.length === 0) {
        const stats = getCodeIndexStats(workspaceId);
        const note =
          stats.chunkCount === 0
            ? "The code index for this workspace is empty (it may still be indexing, or no files matched). Try grep instead."
            : "No matches found. Try different terms, or grep for an exact string.";
        return ok({ results: [], mode, note });
      }

      return ok({
        results: hits.map((h) => ({
          path: h.filePath,
          lines: `${h.startLine}-${h.endLine}`,
          score: Number(h.score.toFixed(4)),
          snippet: h.content,
        })),
        mode,
        ...(mode === "fts"
          ? {
              note: "Keyword-only: local vectors aren't available yet, so results are ranked by keyword match rather than semantic similarity.",
            }
          : {}),
      });
    },
  };
}
