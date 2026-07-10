import {
  applyModePreamble,
  applyMemoryPreamble,
  renderMemoryBlock,
  applyCodeContextPreamble,
  renderCodeContextBlock,
  normalizeMode,
  getModeConfig,
  listAgents,
  embedQuery,
  embeddingsEnabled,
} from "@lamda/pi-sdk";
import {
  getThread,
  selectMemoriesForPrompt,
  touchMemoryUse,
  searchCodeChunks,
  isVecAvailable,
  getSetting,
} from "@lamda/db";
import type { StoredSession } from "../store.js";

/**
 * Prepend the active mode's preamble to the user's text, but only when that mode
 * isn't already the standing instruction in this live session's history — i.e. on
 * the first turn or after a mode switch. The SDK persists each prompt (preamble
 * included) into the conversation it replays to the model, so injecting on every
 * turn would stack duplicate copies in context and, after a switch, leave the
 * previous mode's stale instructions interleaved. Tracking the last-injected mode
 * per session keeps exactly one copy in context, always reflecting the current
 * mode. (Hard enforcement of mode is tool gating; the preamble is behavioural
 * steering — so a single standing copy is sufficient.)
 *
 * The returned text is what the SDK sees; the DB always stores the clean user
 * text without the preamble.
 */
function withModePreamble(entry: StoredSession, userText: string): string {
  const mode = normalizeMode(getThread(entry.threadId)?.mode);
  if (mode && mode !== entry.lastInjectedMode) {
    entry.lastInjectedMode = mode;
    return applyModePreamble(mode, userText, entry.cwd);
  }
  return userText;
}

/**
 * Turn known `#agent-id` tokens into an explicit delegation request while
 * keeping the clean mention in the persisted user message. Unknown or
 * mode-disallowed ids remain ordinary text.
 */
function withSubagentMentions(
  entry: StoredSession,
  userText: string,
): string {
  const mode = normalizeMode(getThread(entry.threadId)?.mode);
  const modeConfig = mode ? getModeConfig(mode, entry.cwd) : null;
  if (!modeConfig?.tools.includes("delegate")) return userText;

  const allowed = modeConfig.agents;
  const knownIds = new Set(
    listAgents(entry.cwd)
      .filter((agent) => allowed === null || allowed.includes(agent.id))
      .map((agent) => agent.id),
  );
  if (knownIds.size === 0) return userText;

  const mentioned = Array.from(
    new Set(
      Array.from(
        userText.matchAll(/(?:^|\s)#([a-z0-9][a-z0-9-]*)\b/g),
        (match) => match[1],
      ).filter((id): id is string => !!id && knownIds.has(id)),
    ),
  );
  if (mentioned.length === 0) return userText;

  return `<lamda-subagent-request>
The user explicitly invoked these subagents: ${mentioned.join(", ")}.
Delegate the relevant part of the request to each named subagent before responding. Treat the rest of the user's message as the task context.
</lamda-subagent-request>

${userText}`;
}

/**
 * Prepend a stored-memories block built by *retrieval*: the pinned core plus the
 * memories most relevant to this prompt (FTS-ranked), rather than the whole
 * store. To keep context lean and never stack duplicates, each memory is
 * injected at most once per live session — tracked by id and the `updatedAt` it
 * had when injected, so a memory edited mid-session is re-stated once. The SDK
 * persists earlier injections into the replayed history, so previously surfaced
 * facts remain available even though we only inject the newly-relevant ones now.
 * The DB always stores the clean user text without the block.
 */
async function withMemoryPreamble(
  entry: StoredSession,
  userText: string,
): Promise<string> {
  // Embed the prompt for semantic retrieval. Best-effort: returns null
  // (→ FTS-only) if local embedding is aborted/unavailable, so the hot path
  // never depends on it.
  const queryVector =
    (await embedQuery(userText).catch(() => null)) ?? undefined;

  const candidates = selectMemoriesForPrompt(
    userText,
    entry.workspaceId,
    entry.activeFiles,
    queryVector,
  );
  if (candidates.length === 0) return userText;

  const injected = (entry.injectedMemories ??= new Map<string, number>());
  const fresh = candidates.filter((m) => injected.get(m.id) !== m.updatedAt);
  if (fresh.length === 0) return userText;

  for (const m of fresh) injected.set(m.id, m.updatedAt);
  touchMemoryUse(fresh.map((m) => m.id));

  const block = renderMemoryBlock(
    fresh.map((m) => ({ scope: m.scope, title: m.title, content: m.content })),
  );
  return block ? applyMemoryPreamble(block, userText) : userText;
}

/** Prompts shorter than this, or with too few distinct meaningful tokens, aren't worth a retrieval round-trip. */
const MIN_PROMPT_CHARS = 40;
const MIN_PROMPT_TOKENS = 4;
/** Top code chunks surfaced per prompt — kept small so the block stays cheap even before the char cap kicks in. */
const CODE_CONTEXT_LIMIT = 3;

function usableTokenCount(text: string): number {
  const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g);
  return tokens ? new Set(tokens).size : 0;
}

/**
 * Prepend a block of code chunks retrieved by semantic (+ keyword) search
 * against this prompt — same retrieval/injection shape as `withMemoryPreamble`,
 * but scoped to the workspace's code index and gated more conservatively: it
 * skips short/low-signal prompts and results that only cleared the weak LIKE
 * fallback, since low-confidence code snippets are more likely to mislead than
 * help. Each chunk is injected at most once per live session — chunk ids are
 * content-addressed, so an edited chunk naturally becomes eligible again under
 * its new id, with no separate staleness tracking required.
 */
async function withCodeContextPreamble(
  entry: StoredSession,
  userText: string,
): Promise<string> {
  if (!entry.workspaceId) return userText;
  if (getSetting("semantic_index.injection_enabled") === "false")
    return userText;
  if (
    userText.length < MIN_PROMPT_CHARS ||
    usableTokenCount(userText) < MIN_PROMPT_TOKENS
  ) {
    return userText;
  }

  let queryVector: number[] | undefined;
  if (isVecAvailable() && embeddingsEnabled()) {
    queryVector = (await embedQuery(userText).catch(() => null)) ?? undefined;
  }

  const { hits, mode } = searchCodeChunks(
    entry.workspaceId,
    userText,
    queryVector,
    CODE_CONTEXT_LIMIT,
  );
  // "like" is the weak substring fallback (no FTS5/vec signal at all) — too
  // unreliable to inject unprompted.
  if (mode === "like" || hits.length === 0) return userText;

  const injected = (entry.injectedCodeChunks ??= new Set<string>());
  const fresh = hits.filter((h) => !injected.has(h.id));
  if (fresh.length === 0) return userText;
  for (const h of fresh) injected.add(h.id);

  const block = renderCodeContextBlock(
    fresh.map((h) => ({
      filePath: h.filePath,
      startLine: h.startLine,
      endLine: h.endLine,
      content: h.content,
    })),
  );
  return block ? applyCodeContextPreamble(block, userText) : userText;
}

/**
 * All host-side context injections applied to outgoing user text, composed so
 * the mode preamble stays outermost and code context stays innermost. Explicit
 * `#subagent` requests wrap the retrieval context after retrieval has already
 * run against the clean prompt, so the host directive cannot skew search.
 */
export async function withInjections(
  entry: StoredSession,
  userText: string,
): Promise<string> {
  return withModePreamble(
    entry,
    withSubagentMentions(
      entry,
      await withMemoryPreamble(
        entry,
        await withCodeContextPreamble(entry, userText),
      ),
    ),
  );
}
