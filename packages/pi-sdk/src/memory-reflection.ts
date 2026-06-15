import { createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent"
import { buildAuthStorage } from "./auth.js"
import type { SdkConfig } from "./types.js"

/** A memory the reflection pass proposes extracting from a thread transcript. */
export interface MemoryProposal {
  kind: "fact" | "preference" | "convention" | "decision" | "episode"
  scope: "user" | "workspace"
  title: string
  content: string
  filePaths?: string[]
  confidence?: number
}

const MAX_PROPOSALS = 5

const REFLECTION_SYSTEM = `You analyse a coding-assistant conversation and extract durable memories worth keeping for future sessions. You are precise and conservative: most turns of a conversation produce NOTHING worth remembering.

Extract a memory only when it is durable and will matter next time:
- preference  — how the user likes to work (style, tone, workflow, tools). Often a correction the user gave ("use pnpm, not npm"). Usually scope "user".
- convention  — a project rule/norm not written down (build quirk, naming, required env var). Scope "workspace".
- decision    — a notable choice AND why it was made; put the decision, the rationale, and rejected alternatives in content. Scope "workspace".
- fact        — a plain durable fact that doesn't fit the above.
- episode      — at most ONE per thread: a 1-2 sentence summary of what the work accomplished. Scope "workspace". Include touched file paths in filePaths.

Rules:
- Never extract secrets, credentials, API keys, tokens, or anything trivially re-derivable by reading the repo.
- Do not duplicate any memory already listed under EXISTING MEMORIES — skip it.
- One concrete fact per memory. Keep titles short.
- Set filePaths to the repo-relative paths a memory concerns, when clear.
- Return AT MOST ${MAX_PROPOSALS} memories. If nothing qualifies, return an empty array.

Respond with ONLY a JSON array (no prose, no code fences) of objects:
[{"kind": "...", "scope": "user|workspace", "title": "...", "content": "...", "filePaths": ["..."], "confidence": 0.0-1.0}]`

/** Strip a leading/trailing ```json fence if the model added one. */
function stripFences(text: string): string {
  const t = text.trim()
  if (!t.startsWith("```")) return t
  return t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

function coerceProposals(raw: unknown): MemoryProposal[] {
  if (!Array.isArray(raw)) return []
  const kinds = ["fact", "preference", "convention", "decision", "episode"]
  const out: MemoryProposal[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const kind = typeof o.kind === "string" && kinds.includes(o.kind) ? o.kind : "fact"
    const scope = o.scope === "user" ? "user" : "workspace"
    const title = typeof o.title === "string" ? o.title.trim() : ""
    const content = typeof o.content === "string" ? o.content.trim() : ""
    if (!title || !content) continue
    const filePaths = Array.isArray(o.filePaths)
      ? o.filePaths.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : undefined
    const confidence =
      typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
        ? o.confidence
        : undefined
    out.push({
      kind: kind as MemoryProposal["kind"],
      scope,
      title,
      content,
      ...(filePaths && filePaths.length ? { filePaths } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    })
    if (out.length >= MAX_PROPOSALS) break
  }
  return out
}

/**
 * Run a single tool-free model pass over a thread transcript and return the
 * memories worth persisting. Mirrors generateThreadTitle's session setup so auth
 * and model resolution behave identically. Returns [] on any failure — reflection
 * is best-effort and must never throw into the caller's teardown path.
 *
 * @param transcript  Rendered conversation text (user/assistant/tool turns).
 * @param existingTitles  Titles of memories already stored for this workspace,
 *   so the model can skip duplicates.
 */
export async function generateMemoryProposals(
  transcript: string,
  existingTitles: string[],
  config: SdkConfig = {},
): Promise<MemoryProposal[]> {
  if (!transcript.trim()) return []

  const authStorage = buildAuthStorage(config)
  const modelRegistry = ModelRegistry.create(authStorage)
  const sessionManager = SessionManager.inMemory(config.cwd ?? process.cwd())
  const model =
    config.provider && config.model ? modelRegistry.find(config.provider, config.model) : undefined

  const existing =
    existingTitles.length > 0
      ? `EXISTING MEMORIES (do not duplicate):\n${existingTitles.map((t) => `- ${t}`).join("\n")}\n\n`
      : ""
  const prompt = `${REFLECTION_SYSTEM}\n\n${existing}CONVERSATION:\n${transcript}`

  let answer = ""
  try {
    const { session } = await createAgentSession({
      authStorage,
      modelRegistry,
      sessionManager,
      tools: [],
      model,
    })
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        answer += event.assistantMessageEvent.delta
      }
    })
    try {
      await session.prompt(prompt)
    } finally {
      unsubscribe()
      session.dispose()
    }
  } catch {
    return []
  }

  try {
    return coerceProposals(JSON.parse(stripFences(answer)))
  } catch {
    return []
  }
}
