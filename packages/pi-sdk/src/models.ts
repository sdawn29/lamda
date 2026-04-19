import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { supportsXhigh } from "@mariozechner/pi-ai";
import type { ModelInfo } from "./types.js";

const BASE_THINKING_LEVELS = ["low", "medium", "high"];
const XHIGH_THINKING_LEVELS = ["low", "medium", "high", "xhigh"];

/**
 * Returns all models available to the pi-coding-agent SDK.
 * This is the only place in the codebase that touches ModelRegistry directly.
 * To swap SDKs, replace this file's internals while keeping the same signature.
 */
export function getAvailableModels(): ModelInfo[] {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  return modelRegistry.getAvailable().map((m) => {
    const reasoning = m.reasoning ?? false;
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      reasoning,
      thinkingLevels: reasoning
        ? (supportsXhigh(m) ? XHIGH_THINKING_LEVELS : BASE_THINKING_LEVELS)
        : [],
    };
  });
}
