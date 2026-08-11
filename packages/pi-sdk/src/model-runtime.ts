import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { SdkConfig } from "./types.js";

/**
 * pi-ai loads each provider's OAuth flow through a *variable* dynamic import
 * (`import("./anthropic.js")`) specifically so bundlers cannot follow it into
 * Node-only code. That leaves the specifier in the esbuild output, where it
 * resolves relative to `server.cjs` instead of node_modules — so in the
 * packaged desktop app every subscription login failed with
 * ERR_MODULE_NOT_FOUND while dev (unbundled) worked fine.
 *
 * `registerBunOAuthFlows` is pi-ai's supported escape hatch: it statically
 * imports every flow and registers them, so the dynamic import is never
 * reached. Despite the name it is not Bun-specific — it applies to any bundled
 * host. The build aliases this specifier to the same pi-ai copy
 * pi-coding-agent resolves, because the registry lives in module state and a
 * second copy would register on the wrong instance.
 */
registerBunOAuthFlows();

/**
 * Process-local credential store. Used when an API key is supplied explicitly
 * (config or env) so the key is never written to ~/.pi/agent/auth.json.
 */
class InMemoryCredentialStore implements CredentialStore {
  private readonly data = new Map<string, Credential>();

  async read(providerId: string): Promise<Credential | undefined> {
    return this.data.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.data].map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const next = await fn(this.data.get(providerId));
    if (next) this.data.set(providerId, next);
    return this.data.get(providerId);
  }

  async delete(providerId: string): Promise<void> {
    this.data.delete(providerId);
  }
}

/**
 * The process-wide model/auth runtime (pi 0.80.8+ `ModelRuntime` — the facade
 * that replaced the old AuthStorage + ModelRegistry pair).
 *
 * There is deliberately ONE of these per process. Creating a runtime reads
 * auth.json, loads models.json, composes every built-in/config/extension
 * provider and hydrates the model catalog, so building one per session (or per
 * title/commit-message call) repeats that work for every thread the user opens.
 * Sessions receive this instance via `SdkConfig.modelRuntime`.
 *
 * Held as the in-flight promise so concurrent callers share one creation
 * instead of racing to build their own.
 */
let shared: Promise<ModelRuntime> | undefined;

export function sharedModelRuntime(): Promise<ModelRuntime> {
  if (!shared) {
    shared = ModelRuntime.create({
      // Let dynamic catalogs (pi.dev overlays, OpenRouter, llama.cpp, …) come
      // from the network. Since 0.82 these revalidate with If-None-Match, so an
      // unchanged provider costs an empty 304 rather than a full download.
      allowModelNetwork: true,
    }).catch((error: unknown) => {
      // Don't cache a rejected promise — the next call should retry.
      shared = undefined;
      throw error;
    });
  }
  return shared;
}

/**
 * Drop the shared runtime so the next use rebuilds it from disk.
 *
 * Required (rather than `refresh()`) whenever auth.json changed underneath us:
 * the file-backed credential store snapshots that file at construction, and
 * lamda writes provider API keys to it directly. Sessions already holding the
 * previous instance keep running on it — they are mid-conversation, and the
 * next session picks up the new credentials.
 */
export function resetModelRuntime(): void {
  shared = undefined;
}

/**
 * Re-read models.json and pull fresh provider catalogs, keeping the runtime
 * identity so live sessions observe the new models. This is the SDK equivalent
 * of `pi update --models`.
 *
 * No-op when nothing has built a runtime yet: the next creation reads current
 * state anyway.
 */
export async function refreshModelCatalogs(options?: {
  allowNetwork?: boolean;
}): Promise<void> {
  if (!shared) return;
  const runtime = await shared;
  await runtime.refresh(options);
}

/**
 * Resolve the runtime a session should use.
 *
 * A caller-supplied API key gets a dedicated runtime with process-local
 * credentials, so the key never reaches auth.json and never leaks into other
 * sessions. Everything else shares the process-wide instance — including the
 * `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` env vars, which pi-ai's provider
 * auth already resolves ambiently. (Branching on the env var here would give
 * every session its own runtime for the most common setup of all.)
 */
export async function resolveModelRuntime(
  config: SdkConfig,
): Promise<ModelRuntime> {
  if (config.modelRuntime) return config.modelRuntime;
  if (!config.anthropicApiKey) return sharedModelRuntime();

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    allowModelNetwork: true,
  });
  await runtime.setRuntimeApiKey("anthropic", config.anthropicApiKey);
  return runtime;
}
