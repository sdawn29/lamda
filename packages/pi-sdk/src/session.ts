import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { buildAuthStorage } from "./auth.js";
import { sessionEventGenerator } from "./stream.js";
import type { ManagedSessionHandle, SdkConfig } from "./types.js";

function buildHandle(session: Awaited<ReturnType<typeof createAgentSession>>["session"], modelRegistry: ModelRegistry): ManagedSessionHandle {
  return {
    prompt: (text) => session.prompt(text),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
    events: () => sessionEventGenerator(session),
    setModel: async (provider, modelId) => {
      const model = modelRegistry.find(provider, modelId);
      if (model) await session.setModel(model);
    },
    get sessionFile() {
      return session.sessionFile;
    },
  };
}

/**
 * Create a new managed agent session, persisted to disk under ~/.pi/agent/sessions/.
 */
export async function createManagedSession(
  config: SdkConfig,
): Promise<ManagedSessionHandle> {
  const cwd = config.cwd ?? process.cwd();
  const authStorage = buildAuthStorage(config);
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessionManager = SessionManager.create(cwd);

  const model =
    config.provider && config.model
      ? modelRegistry.find(config.provider, config.model)
      : undefined;

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager,
    cwd,
    model,
  });

  return buildHandle(session, modelRegistry);
}

/**
 * Resume an existing persisted session from its JSONL file.
 * Previous conversation context is automatically restored by the Pi SDK.
 */
export async function openManagedSession(
  sessionFilePath: string,
  config: SdkConfig = {},
): Promise<ManagedSessionHandle> {
  const cwd = config.cwd ?? process.cwd();
  const authStorage = buildAuthStorage(config);
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessionManager = SessionManager.open(sessionFilePath);

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager,
    cwd,
  });

  return buildHandle(session, modelRegistry);
}
