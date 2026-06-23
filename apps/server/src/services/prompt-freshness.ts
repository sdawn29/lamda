import { promptTemplatesSignature } from "@lamda/pi-sdk";
import type { StoredSession } from "../store.js";

// Last prompt-template fingerprint we reloaded each session at, keyed by the
// session handle. A WeakMap so disposed sessions drop out without bookkeeping.
const lastSignature = new WeakMap<StoredSession["handle"], string>();

/**
 * Reload a session's resource loader if any `.lamda/prompts` markdown file has
 * been added, edited, or removed since we last checked — so newly authored
 * prompt files become usable (slash-command list + `/`-expansion) without
 * restarting the server. Cheap on the hot path: a couple of `stat`s when
 * nothing changed; the heavier reload runs only when the fingerprint moves.
 * Best-effort — a failed reload is swallowed so it can never block a prompt.
 */
export async function ensurePromptsFresh(entry: StoredSession): Promise<void> {
  let signature: string;
  try {
    signature = promptTemplatesSignature(entry.cwd);
  } catch {
    return;
  }
  if (lastSignature.get(entry.handle) === signature) return;
  try {
    await entry.handle.reloadResources();
    lastSignature.set(entry.handle, signature);
  } catch (err) {
    console.error("[prompt-freshness] reload failed", err);
  }
}

/**
 * Refresh prompts only when `rawText` is a `/command`. A slash command expands
 * against the resource loader's prompt templates, so a just-authored prompt file
 * must resolve without a restart; injected preambles aren't slash commands, so
 * non-`/` text skips the check. The gate lives here so the HTTP and WebSocket
 * prompt paths share one policy.
 */
export async function ensurePromptsFreshForText(
  entry: StoredSession,
  rawText: string,
): Promise<void> {
  if (rawText.trimStart().startsWith("/")) {
    await ensurePromptsFresh(entry);
  }
}
