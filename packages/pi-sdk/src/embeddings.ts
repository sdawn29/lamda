/**
 * Local embeddings for memory and code retrieval.
 *
 * The app needs semantic-ish retrieval without a network provider or API key, so
 * this module builds deterministic code-aware vectors with feature hashing. It
 * is not a neural embedding model; instead it blends identifier subtokens,
 * fuzzy character n-grams, adjacent-token phrases, and a small concept synonym
 * map. That gives sqlite-vec a stable similarity signal that works offline and
 * degrades naturally alongside the existing FTS ranking.
 */

/** Must match MEMORY_EMBEDDING_DIM in @lamda/db. */
const OUTPUT_DIMENSION = 1024;
const MAX_INPUT_CHARS = 24_000;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "cannot",
  "could",
  "did",
  "does",
  "doing",
  "done",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "into",
  "its",
  "just",
  "like",
  "more",
  "not",
  "our",
  "out",
  "over",
  "should",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "was",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "you",
  "your",
]);

const SYNONYMS: Record<string, string[]> = {
  auth: [
    "authentication",
    "authorize",
    "authorization",
    "login",
    "session",
    "token",
  ],
  authentication: ["auth", "login", "session", "token"],
  authorization: ["auth", "permission", "policy", "scope"],
  cache: ["memo", "memoize", "store", "ttl"],
  cancel: ["abort", "stop", "interrupt"],
  checkout: ["branch", "worktree", "switch"],
  cleanup: ["delete", "remove", "prune", "sweep"],
  config: ["configuration", "setting", "preference"],
  database: ["db", "sqlite", "drizzle", "schema"],
  error: ["exception", "failure", "failed", "catch"],
  file: ["path", "directory", "folder", "workspace"],
  git: ["branch", "commit", "diff", "worktree"],
  index: ["search", "chunk", "embedding", "retrieve", "lookup"],
  memory: ["remember", "preference", "fact", "context"],
  notification: ["toast", "alert", "message", "bell"],
  prompt: ["message", "input", "query", "instruction"],
  rate: ["limit", "throttle", "quota"],
  reindex: ["index", "rebuild", "refresh"],
  search: ["find", "lookup", "query", "retrieve", "index"],
  semantic: ["meaning", "concept", "relevant", "similar"],
  session: ["thread", "conversation", "chat"],
  setting: ["config", "configuration", "preference"],
  sqlite: ["database", "db", "vec", "fts"],
  stream: ["sse", "event", "socket"],
  test: ["spec", "assert", "expect", "vitest"],
  thread: ["session", "conversation", "chat"],
  token: ["auth", "credential", "secret", "jwt"],
  tool: ["function", "command", "operation"],
  ui: ["component", "view", "screen", "panel"],
  workspace: ["project", "repo", "repository", "folder"],
  worktree: ["branch", "checkout", "git"],
};

/** True when embedding generation is available. Local embeddings are always on. */
export function embeddingsEnabled(): boolean {
  return true;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitIdentifier(raw: string): string[] {
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase();
  return spaced.split(/\s+/).filter((t) => t.length >= 2);
}

function tokenize(text: string): string[] {
  const raw = text
    .slice(0, MAX_INPUT_CHARS)
    .match(/[a-zA-Z][a-zA-Z0-9_.$:-]*|[0-9]+/g);
  if (!raw) return [];
  const tokens: string[] = [];
  for (const piece of raw) {
    for (const token of splitIdentifier(piece)) {
      if (token.length < 2 || STOP_WORDS.has(token)) continue;
      tokens.push(token);
    }
  }
  return tokens;
}

function addFeature(vector: number[], feature: string, weight: number): void {
  const h = hash32(feature);
  const idx = h % OUTPUT_DIMENSION;
  const sign = h & 0x80000000 ? -1 : 1;
  vector[idx] += sign * weight;
}

function addTokenFeatures(
  vector: number[],
  token: string,
  weight: number,
): void {
  addFeature(vector, `tok:${token}`, weight);

  const expanded = Object.hasOwn(SYNONYMS, token) ? SYNONYMS[token] : undefined;
  if (expanded) {
    for (const synonym of expanded)
      addFeature(vector, `tok:${synonym}`, weight * 0.55);
  }

  if (token.length >= 4) {
    for (let i = 0; i <= token.length - 3; i++) {
      addFeature(vector, `tri:${token.slice(i, i + 3)}`, weight * 0.18);
    }
  }

  if (token.length >= 6) {
    addFeature(vector, `prefix:${token.slice(0, 4)}`, weight * 0.25);
    addFeature(vector, `suffix:${token.slice(-4)}`, weight * 0.2);
  }
}

function embedText(text: string): number[] {
  const vector = Array<number>(OUTPUT_DIMENSION).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  for (const [token, count] of counts) {
    addTokenFeatures(vector, token, 1 + Math.log(count));
  }

  const phraseLimit = Math.min(tokens.length - 1, 512);
  for (let i = 0; i < phraseLimit; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a && b && a !== b) addFeature(vector, `pair:${a}_${b}`, 0.7);
  }

  const norm = Math.hypot(...vector);
  if (norm === 0) return vector;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

/** Embed stored-memory/code texts. */
export async function embedDocuments(
  texts: string[],
  signal?: AbortSignal,
): Promise<number[][] | null> {
  if (signal?.aborted) return null;
  return texts.map(embedText);
}

/** Embed a single retrieval query. */
export async function embedQuery(
  text: string,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (signal?.aborted || !text.trim()) return null;
  return embedText(text);
}
