import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ModelInfo } from "./types.js";

// Cached instances for getAvailableModels()
let cachedAuthStorage: AuthStorage | undefined;
let cachedModelRegistry: ModelRegistry | undefined;

export function invalidateModelCache(): void {
  cachedAuthStorage = undefined;
  cachedModelRegistry = undefined;
}

/**
 * Returns all models available to the pi-coding-agent SDK.
 * Uses ModelRegistry.getAvailable() to filter to models with auth configured,
 * and getSupportedThinkingLevels() to compute per-model thinking levels.
 */
export function getAvailableModels(): ModelInfo[] {
  if (!cachedAuthStorage) {
    cachedAuthStorage = AuthStorage.create();
  }
  if (!cachedModelRegistry) {
    cachedModelRegistry = ModelRegistry.create(cachedAuthStorage);
  }

  return cachedModelRegistry.getAvailable().map((m) => {
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
