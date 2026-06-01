import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

/**
 * Read/write helpers for `~/.pi/agent/models.json` — the pi-coding-agent
 * custom-provider file used to register local models (Ollama, LM Studio,
 * vLLM, …). See the SDK docs (`docs/models.md`) for the full schema.
 */

export const MODELS_FILE = join(homedir(), ".pi", "agent", "models.json");

/** OpenAI-compatibility flags. Only the subset relevant to local servers. */
export interface ProviderCompat {
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  [k: string]: unknown;
}

/** A single model entry under a provider. Only `id` is required. */
export interface LocalModelConfig {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: ProviderCompat;
  [k: string]: unknown;
}

export type ProviderApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

/** A custom provider definition. */
export interface LocalProviderConfig {
  baseUrl: string;
  api: ProviderApi;
  apiKey?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: ProviderCompat;
  models: LocalModelConfig[];
  [k: string]: unknown;
}

export interface ModelsJson {
  providers?: Record<string, LocalProviderConfig>;
  [k: string]: unknown;
}

export async function readModelsJson(): Promise<ModelsJson> {
  if (!existsSync(MODELS_FILE)) return {};
  try {
    const raw = await readFile(MODELS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ModelsJson;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeModelsJson(data: ModelsJson): Promise<void> {
  await mkdir(dirname(MODELS_FILE), { recursive: true });
  await writeFile(MODELS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/** Return just the `providers` map, defaulting to an empty object. */
export async function readProviders(): Promise<
  Record<string, LocalProviderConfig>
> {
  const data = await readModelsJson();
  return data.providers ?? {};
}

/**
 * Upsert a single provider entry, preserving any other top-level keys and
 * sibling providers already present in the file.
 */
export async function upsertProvider(
  id: string,
  config: LocalProviderConfig,
): Promise<void> {
  const data = await readModelsJson();
  data.providers = { ...(data.providers ?? {}), [id]: config };
  await writeModelsJson(data);
}

/** Remove a single provider entry. No-op if it does not exist. */
export async function removeProvider(id: string): Promise<void> {
  const data = await readModelsJson();
  if (data.providers && id in data.providers) {
    delete data.providers[id];
    await writeModelsJson(data);
  }
}
