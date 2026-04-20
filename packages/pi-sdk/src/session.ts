import {
  createAgentSession,
  createCodingTools,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { buildAuthStorage } from "./auth.js";
import { sessionEventGenerator } from "./stream.js";
import type {
  ManagedSessionHandle,
  PromptOptions,
  SdkConfig,
} from "./types.js";

function buildHandle(
  session: AgentSession,
  cwd: string,
): ManagedSessionHandle {
  return {
    prompt: (text, options) => session.prompt(text, options as any),
    steer: (text) => session.steer(text),
    followUp: (text) => session.followUp(text),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
    events: () => sessionEventGenerator(session),
    setModel: (provider, modelId) => {
      // Access the model registry from the session
      const registry = (session as any).modelRegistry;
      if (registry) {
        const model = registry.find(provider, modelId);
        if (model) return session.setModel(model);
      }
      return Promise.resolve();
    },
    setThinkingLevel: (level) => session.setThinkingLevel(level as any),
    get sessionFile() {
      return session.sessionFile;
    },
    getContextUsage() {
      const usage = session.getContextUsage();
      if (!usage) return undefined;
      return {
        tokens: usage.tokens,
        contextWindow: usage.contextWindow,
        percent: usage.percent,
      };
    },
    async compact() {
      await session.compact();
    },
    getAvailableThinkingLevels() {
      return session.getAvailableThinkingLevels() as string[];
    },
    getCommands() {
      // Use the SDK's resource loader for consistent discovery
      const resourceLoader = session.resourceLoader;
      const { skills } = resourceLoader.getSkills();
      const { prompts } = resourceLoader.getPrompts();

      const skillCommands = skills.map((skill) => ({
        name: `skill:${skill.name}`,
        description: skill.description,
        source: "skill" as const,
      }));

      const promptCommands = prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        source: "prompt" as const,
      }));

      return [...skillCommands, ...promptCommands];
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

  // Use provided or create new auth storage
  const authStorage = config.authStorage ?? buildAuthStorage(config);

  // Use provided or create new model registry
  const modelRegistry =
    config.modelRegistry ?? ModelRegistry.create(authStorage);

  const sessionManager = SessionManager.create(cwd);

  const model =
    config.provider && config.model
      ? modelRegistry.find(config.provider, config.model)
      : undefined;

  // Use tool factories to ensure paths resolve relative to cwd
  const tools = createCodingTools(cwd);

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager,
    cwd,
    model,
    thinkingLevel: config.thinkingLevel as any,
    tools,
  });

  return buildHandle(session, cwd);
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

  // Use provided or create new auth storage
  const authStorage = config.authStorage ?? buildAuthStorage(config);

  // Use provided or create new model registry
  const modelRegistry =
    config.modelRegistry ?? ModelRegistry.create(authStorage);

  const sessionManager = SessionManager.open(sessionFilePath);

  // Use tool factories to ensure paths resolve relative to cwd
  const tools = createCodingTools(cwd);

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager,
    cwd,
    tools,
  });

  return buildHandle(session, cwd);
}
