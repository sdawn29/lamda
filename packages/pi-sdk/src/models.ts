import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ModelInfo } from "./types.js";

// Cached instances for getAvailableModels()
let cachedAuthStorage: AuthStorage | undefined;
let cachedModelRegistry: ModelRegistry | undefined;

export function invalidateModelCache(): void {
  cachedAuthStorage = undefined;
  cachedModelRegistry = undefined;
}

/**
 * All possible thinking levels supported by pi
 */
const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

/**
 * Returns all models available to the pi-coding-agent SDK.
 * Uses cached instances to avoid repeated initialization.
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
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      reasoning,
      // For reasoning-capable models, provide all available thinking levels
      thinkingLevels: reasoning ? [...THINKING_LEVELS] : [],
    };
  });
}
