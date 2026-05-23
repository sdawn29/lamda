import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildAuthStorage } from "./auth.js";
import type { SdkConfig } from "./types.js";

/**
 * Uses the Pi SDK to generate a short, descriptive thread title
 * from the first user message. Runs a single-turn, tool-free session.
 * Falls back to a truncated version of the message on any error.
 */
export async function generateThreadTitle(
  message: string,
  config: SdkConfig = {}
): Promise<string> {
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
    await session.prompt(
      `Generate a short, descriptive thread title (3–6 words) for a conversation that starts with this message:\n\n"${message}"\n\nReply with ONLY the title. No quotes, no punctuation at the end.`
    );
  } finally {
    unsubscribe();
    session.dispose();
  }

  return title.trim() || message.slice(0, 50).trim();
}
