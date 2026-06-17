import {
  getThread,
  listMessageBlocks,
  listMemories,
  updateThreadLastReflectedAt,
  getAllSettings,
  type MessageBlock,
} from "@lamda/db";
import { generateMemoryProposals, persistMemory } from "@lamda/pi-sdk";
import { scheduleEmbeddingBackfill } from "./memory-embeddings.js";

/** Max transcript characters fed to the reflection model (keeps token cost bounded). */
const MAX_TRANSCRIPT_CHARS = 24_000;
/** Skip reflection on threads with little substance. */
const MIN_TRANSCRIPT_CHARS = 200;

/** Threads currently being reflected on, so overlapping triggers don't double-run. */
const inFlight = new Set<string>();

/** Splits a stored `provider::model` settings key into its parts. */
function parseModelKey(key: string | undefined): {
  provider?: string;
  model?: string;
} {
  if (!key) return {};
  const idx = key.indexOf("::");
  if (idx === -1) return {};
  return { provider: key.slice(0, idx), model: key.slice(idx + 2) };
}

/** Render message blocks into a compact transcript, keeping the most recent tail. */
function renderTranscript(blocks: MessageBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.role === "user" && b.content) {
      lines.push(`USER: ${b.content}`);
    } else if (b.role === "assistant" && b.content) {
      lines.push(`ASSISTANT: ${b.content}`);
    } else if (b.role === "tool" && b.toolName) {
      const args = b.toolArgs ? ` ${b.toolArgs}` : "";
      lines.push(`TOOL(${b.toolName})${args}`);
    }
  }
  let text = lines.join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    // Keep the tail — the end of a thread carries decisions and outcomes.
    text = text.slice(text.length - MAX_TRANSCRIPT_CHARS);
  }
  return text;
}

/**
 * Best-effort consolidation pass: read a thread's transcript, ask a cheap model
 * to propose durable memories (preferences, conventions, decisions, an episode),
 * and auto-commit them with source "healing". Runs in the background and never
 * throws — callers fire-and-forget from thread teardown / compaction boundaries.
 *
 * Reuses the configured title-generation model (settings → Chat) as the utility
 * model, falling back to the SDK default; auth resolves the same way sessions do.
 */
export async function reflectOnThread(threadId: string): Promise<void> {
  if (inFlight.has(threadId)) return;
  inFlight.add(threadId);
  try {
    const thread = getThread(threadId);
    if (!thread) return;
    const workspaceId = thread.workspaceId;

    // Only mine blocks added since the last reflection pass, so the frequent
    // triggers (per-N-turns, idle, shutdown) re-analyse just the new transcript
    // rather than re-scanning the whole thread each time.
    const since = thread.lastReflectedAt ?? 0;
    const blocks = listMessageBlocks(threadId);
    const newBlocks =
      since > 0 ? blocks.filter((b) => b.createdAt > since) : blocks;
    const transcript = renderTranscript(newBlocks);
    if (transcript.length < MIN_TRANSCRIPT_CHARS) return;

    // Titles already known for this workspace (+ user scope), so the model can dedup.
    const existing = listMemories({ workspaceId }).filter(
      (m) => m.scope === "user" || m.workspaceId === workspaceId,
    );
    const existingTitles = existing.map((m) => m.title);

    const all = getAllSettings();
    const { provider, model } = parseModelKey(all["title_generation_model"]);

    const proposals = await generateMemoryProposals(
      transcript,
      existingTitles,
      {
        provider,
        model,
      },
    );

    // The model call failed — leave the watermark untouched so this same window
    // gets retried on the next trigger rather than being silently dropped.
    if (proposals === null) return;

    let inserted = 0;
    for (const p of proposals) {
      // A workspace-scoped memory needs a workspace; downgrade to user scope if
      // this thread somehow has none, rather than dropping the learning.
      const scope = p.scope === "workspace" && !workspaceId ? "user" : p.scope;

      // persistMemory applies secret-scanning, dedup (exact title + semantic) and
      // supersession, so re-observed facts reinforce rather than stack duplicates.
      const result = await persistMemory({
        scope,
        workspaceId,
        title: p.title,
        content: p.content,
        kind: p.kind,
        source: "healing",
        threadId,
        filePaths: p.filePaths ?? null,
        confidence: p.confidence ?? 0.6,
      });
      if (result.outcome === "created" || result.outcome === "superseded")
        inserted++;
    }

    // This window has now been analysed — advance the watermark so it isn't
    // re-mined, regardless of whether anything new was extracted.
    updateThreadLastReflectedAt(threadId);

    // Catch any memories left unembedded (e.g. provider briefly unavailable at
    // persist time) so semantic retrieval can find them later.
    if (inserted > 0) scheduleEmbeddingBackfill();
  } catch {
    // Reflection is best-effort — swallow everything so teardown is never blocked.
  } finally {
    inFlight.delete(threadId);
  }
}

/** Fire-and-forget wrapper: schedule reflection without awaiting it. */
export function scheduleReflection(threadId: string): void {
  void reflectOnThread(threadId);
}
