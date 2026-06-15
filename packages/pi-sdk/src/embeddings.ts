/**
 * Embeddings for semantic memory retrieval, backed by Voyage AI (Anthropic's
 * recommended embedding provider — Anthropic itself serves no embeddings model).
 *
 * Entirely optional: every entry point returns null when `VOYAGE_API_KEY` is
 * unset or the request fails, so memory retrieval degrades to FTS keyword search
 * with no hard dependency on this provider.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
const MODEL = "voyage-3.5-lite"
/** Must match MEMORY_EMBEDDING_DIM in @lamda/db. */
const OUTPUT_DIMENSION = 1024
const REQUEST_TIMEOUT_MS = 8000

function apiKey(): string | undefined {
  const key = process.env.VOYAGE_API_KEY
  return key && key.trim() ? key.trim() : undefined
}

/** True when an embedding provider is configured. */
export function embeddingsEnabled(): boolean {
  return apiKey() !== undefined
}

interface VoyageResponse {
  data?: { embedding: number[]; index: number }[]
}

async function callVoyage(
  inputs: string[],
  inputType: "query" | "document",
  signal?: AbortSignal,
): Promise<number[][] | null> {
  const key = apiKey()
  if (!key || inputs.length === 0) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true })

  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        input: inputs,
        model: MODEL,
        input_type: inputType,
        output_dimension: OUTPUT_DIMENSION,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as VoyageResponse
    if (!json.data || json.data.length !== inputs.length) return null
    // Order by the returned index so vectors line up with the inputs.
    const sorted = [...json.data].sort((a, b) => a.index - b.index)
    return sorted.map((d) => d.embedding)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Embed stored-memory texts (document side). Returns null when unavailable. */
export function embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][] | null> {
  return callVoyage(texts, "document", signal)
}

/** Embed a single retrieval query (query side). Returns null when unavailable. */
export async function embedQuery(
  text: string,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (!text.trim()) return null
  const vectors = await callVoyage([text], "query", signal)
  return vectors?.[0] ?? null
}
