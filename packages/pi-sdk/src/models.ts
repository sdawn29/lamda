import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ModelInfo } from "./types.js";

/**
 * Returns all models available to the pi-coding-agent SDK.
 * This is the only place in the codebase that touches ModelRegistry directly.
 * To swap SDKs, replace this file's internals while keeping the same signature.
 */
export function getAvailableModels(): ModelInfo[] {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  return modelRegistry.getAvailable().map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
  }));
}
