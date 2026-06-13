import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildAuthStorage } from "./auth.js";
import type { SdkConfig } from "./types.js";

/**
 * Default prompt template for thread title generation.
 * `{message}` is replaced with the first user message.
 */
export const DEFAULT_TITLE_PROMPT =
  `Generate a short, descriptive thread title (3–6 words) for a conversation that starts with this message:\n\n"{message}"\n\nReply with ONLY the title. No quotes, no punctuation at the end.`;

/**
 * Uses the Pi SDK to generate a short, descriptive thread title
 * from the first user message. Runs a single-turn, tool-free session.
 * Falls back to a truncated version of the message on any error.
 *
 * @param promptTemplate - Optional custom prompt. Must contain `{message}`
 *   which is substituted with the user message. Defaults to DEFAULT_TITLE_PROMPT.
 */
export async function generateThreadTitle(
  message: string,
  config: SdkConfig = {},
  promptTemplate?: string
): Promise<string> {
  const template = promptTemplate?.trim() || DEFAULT_TITLE_PROMPT;
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

  let title = "";

  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      title += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(template.replace("{message}", message));
  } finally {
    unsubscribe();
    session.dispose();
  }

  return title.trim() || message.slice(0, 50).trim();
}
