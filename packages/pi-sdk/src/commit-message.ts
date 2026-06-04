import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildAuthStorage } from "./auth.js";
import type { SdkConfig } from "./types.js";

/**
 * Default prompt template for commit message generation.
 * `{diff}` is replaced with the staged diff output.
 */
export const DEFAULT_COMMIT_PROMPT =
  `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`;

/**
 * Maximum number of characters of diff to send to the model. Large staged
 * diffs (lockfiles, generated files, big refactors) can exceed the model's
 * input-token limit and cause the provider to reject the request with a 400.
 * We truncate well below that limit; a roughly accurate summary is fine for a
 * commit message.
 */
const MAX_DIFF_CHARS = 48_000;

/** Truncates an oversized diff, appending a notice so the model knows. */
function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return (
    diff.slice(0, MAX_DIFF_CHARS) +
    "\n\n[diff truncated — too large to include in full]"
  );
}

/**
 * Uses the Pi SDK to generate a conventional commit message from a git diff.
 * Runs a single-turn, tool-free session.
 * Falls back to a generic message on any error.
 *
 * @param promptTemplate - Optional custom prompt. Must contain `{diff}` which
 *   will be substituted with the staged diff. Defaults to DEFAULT_COMMIT_PROMPT.
 */
export async function generateCommitMessage(
  diff: string,
  config: SdkConfig = {},
  promptTemplate?: string
): Promise<string> {
  const template = promptTemplate ?? DEFAULT_COMMIT_PROMPT;
  const prompt = template.replace("{diff}", truncateDiff(diff));

  const authStorage = buildAuthStorage(config);
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessionManager = SessionManager.inMemory(config.cwd ?? process.cwd());

  const model =
    config.provider && config.model
      ? modelRegistry.find(config.provider, config.model)
      : undefined;

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager,
    tools: [],
    model,
  });

  let message = "";

  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      message += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(prompt);
  } catch (err) {
    console.error("Failed to generate commit message:", err);
  } finally {
    unsubscribe();
    session.dispose();
  }

  return message.trim() || "chore: update files";
}
