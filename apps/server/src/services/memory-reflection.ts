import {
  getThread,
  listMessageBlocks,
  listMemories,
  insertMemory,
  bumpConfidence,
  findMemoryByTitle,
  getAllSettings,
  type MessageBlock,
} from "@lamda/db";
import { generateMemoryProposals } from "@lamda/pi-sdk";
import { scheduleEmbeddingBackfill } from "./memory-embeddings.js";

/** Max transcript characters fed to the reflection model (keeps token cost bounded). */
const MAX_TRANSCRIPT_CHARS = 24_000;
/** Skip reflection on threads with little substance. */
const MIN_TRANSCRIPT_CHARS = 200;

/** Threads currently being reflected on, so overlapping triggers don't double-run. */
const inFlight = new Set<string>();

/** Splits a stored `provider::model` settings key into its parts. */
function parseModelKey(key: string | undefined): { provider?: string; model?: string } {
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

    const blocks = listMessageBlocks(threadId);
    const transcript = renderTranscript(blocks);
    if (transcript.length < MIN_TRANSCRIPT_CHARS) return;

    // Titles already known for this workspace (+ user scope), so the model can dedup.
    const existing = listMemories({ workspaceId }).filter(
      (m) => m.scope === "user" || m.workspaceId === workspaceId,
    );
    const existingTitles = existing.map((m) => m.title);

    const all = getAllSettings();
    const { provider, model } = parseModelKey(all["title_generation_model"]);

    const proposals = await generateMemoryProposals(transcript, existingTitles, {
      provider,
      model,
    });

    let inserted = 0;
    for (const p of proposals) {
      // A workspace-scoped memory needs a workspace; downgrade to user scope if
      // this thread somehow has none, rather than dropping the learning.
      const scope = p.scope === "workspace" && !workspaceId ? "user" : p.scope;

      // Re-observing an existing memory reinforces it (higher confidence) rather
      // than stacking a duplicate.
      const existingMatch = findMemoryByTitle(
        p.title,
        scope === "workspace" ? workspaceId : undefined,
      );
      if (existingMatch) {
        bumpConfidence(existingMatch.id);
        continue;
      }

      insertMemory({
        scope,
        workspaceId: scope === "workspace" ? workspaceId : null,
        title: p.title,
        content: p.content,
        kind: p.kind,
        source: "healing",
        threadId,
        filePaths: p.filePaths ?? null,
        confidence: p.confidence ?? 0.6,
      });
      inserted++;
    }
    // Embed the newly-saved memories so semantic retrieval can find them.
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
