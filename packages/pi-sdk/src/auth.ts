import { AuthStorage } from "@earendil-works/pi-coding-agent";
import type { SdkConfig } from "./types.js";

/**
 * Build an AuthStorage for the given config.
 * Priority: config.anthropicApiKey → ANTHROPIC_API_KEY env var → ~/.pi/agent/auth.json
 */
export function buildAuthStorage(config: SdkConfig): AuthStorage {
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const storage = AuthStorage.inMemory();
    storage.setRuntimeApiKey("anthropic", apiKey);
    return storage;
  }
  // Fall back to file-based storage (reads ~/.pi/agent/auth.json)
  return AuthStorage.create();
}
