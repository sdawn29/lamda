import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { sharedModelRuntime } from "./model-runtime.js";
import type { ModelInfo } from "./types.js";

/**
 * Returns all models available to the pi-coding-agent SDK.
 * Uses ModelRuntime.getAvailable() to filter to models with auth configured,
 * and getSupportedThinkingLevels() to compute per-model thinking levels.
 */
export async function getAvailableModels(): Promise<ModelInfo[]> {
  const runtime = await sharedModelRuntime();
  const available = await runtime.getAvailable();

  return available.map((m) => {
    const reasoning = m.reasoning ?? false;
    const thinkingLevels = reasoning
      ? getSupportedThinkingLevels(m).filter((level) => level !== "off")
      : [];
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      reasoning,
      thinkingLevels,
    };
  });
}

/**
 * Returns the error (if any) from loading the user's `~/.pi/agent/models.json`.
 * Useful for surfacing custom-provider schema/parse errors to the UI.
 * Returns undefined when the file is absent or valid.
 */
export async function getModelsConfigError(): Promise<string | undefined> {
  const runtime = await sharedModelRuntime();
  return runtime.getError();
}
