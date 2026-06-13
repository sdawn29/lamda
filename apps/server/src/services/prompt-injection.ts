import {
  applyModePreamble,
  applyMemoryPreamble,
  renderMemoryBlock,
  normalizeMode,
} from "@lamda/pi-sdk";
import { getThread, selectMemoriesForPrompt, touchMemoryUse } from "@lamda/db";
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
    return applyModePreamble(mode, userText);
  }
  return userText;
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
function withMemoryPreamble(entry: StoredSession, userText: string): string {
  const candidates = selectMemoriesForPrompt(userText, entry.workspaceId);
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

/**
 * All host-side context injections applied to outgoing user text, composed so
 * the mode preamble stays outermost (stored text = mode preamble + memory block
 * + user text), matching the strip order used when seeding forked threads.
 */
export function withInjections(entry: StoredSession, userText: string): string {
  return withModePreamble(entry, withMemoryPreamble(entry, userText));
}
