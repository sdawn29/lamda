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
  const prompt = template.replace("{diff}", diff);

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
  } finally {
    unsubscribe();
    session.dispose();
  }

  return message.trim() || "chore: update files";
}
