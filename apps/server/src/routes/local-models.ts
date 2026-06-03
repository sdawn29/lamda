import { Hono } from "hono";
import { invalidateModelCache, getModelsConfigError } from "@lamda/pi-sdk";
import {
  readProviders,
  upsertProvider,
  removeProvider,
  type LocalProviderConfig,
} from "../services/models-config-service.js";

/**
 * Local / custom model providers, persisted to `~/.pi/agent/models.json`.
 * These register OpenAI/Anthropic/Google-compatible endpoints (Ollama,
 * LM Studio, vLLM, proxies, …) so their models appear in the model picker.
 */
const localModels = new Hono();

const VALID_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
]);

/** Trim and drop trailing slashes so `${baseUrl}/chat/completions` is well-formed. */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * GET `${baseUrl}/models` to confirm an OpenAI-compatible endpoint is live.
 * Returns the HTTP status, or null when the request never completed.
 */
async function probeModelsEndpoint(
  baseUrl: string,
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(headers ?? {}),
      },
      signal: AbortSignal.timeout(3000),
    });
    return res.status;
  } catch {
    return null;
  }
}

/**
 * After a successful save, check that the configured endpoint actually
 * responds. Catches the most common local-model mistake: a base URL missing
 * the `/v1` suffix (e.g. LM Studio answers `…/chat/completions` with a hollow
 * 200, so the model "saves" but never produces output).
 */
async function reachabilityWarning(
  config: LocalProviderConfig,
): Promise<string | undefined> {
  if (config.api !== "openai-completions" && config.api !== "openai-responses") {
    return undefined;
  }
  const { baseUrl, apiKey, headers } = config;
  const status = await probeModelsEndpoint(baseUrl, apiKey, headers);
  if (status !== null && status < 400) return undefined;

  if (!baseUrl.endsWith("/v1")) {
    const v1Status = await probeModelsEndpoint(`${baseUrl}/v1`, apiKey, headers);
    if (v1Status !== null && v1Status < 400) {
      return `Saved, but ${baseUrl} did not respond while ${baseUrl}/v1 did. Set the base URL to ${baseUrl}/v1 — without it, requests hit a dead path and the model returns nothing.`;
    }
  }
  return `Saved, but couldn't reach ${baseUrl}/models (${
    status === null ? "no response" : `HTTP ${status}`
  }). Check the server is running and the base URL and API type are correct.`;
}

function validateProvider(body: unknown): {
  ok: boolean;
  error?: string;
  config?: LocalProviderConfig;
} {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "provider config is required" };
  }
  const c = body as Record<string, unknown>;
  if (typeof c.baseUrl !== "string" || c.baseUrl.trim() === "") {
    return { ok: false, error: "baseUrl is required" };
  }
  if (typeof c.api !== "string" || !VALID_APIS.has(c.api)) {
    return {
      ok: false,
      error: `api must be one of: ${[...VALID_APIS].join(", ")}`,
    };
  }
  if (!Array.isArray(c.models) || c.models.length === 0) {
    return { ok: false, error: "at least one model is required" };
  }
  for (const m of c.models) {
    if (!m || typeof m !== "object" || typeof (m as { id?: unknown }).id !== "string") {
      return { ok: false, error: "each model requires a string id" };
    }
  }
  return { ok: true, config: body as LocalProviderConfig };
}

localModels.get("/local-providers", async (c) => {
  const providers = await readProviders();
  return c.json({ providers, error: getModelsConfigError() });
});

localModels.put("/local-providers/:id", async (c) => {
  const id = c.req.param("id");
  if (!id.trim()) return c.json({ error: "provider id is required" }, 400);

  const body = await c.req.json().catch(() => null);
  const result = validateProvider(body);
  if (!result.ok || !result.config) {
    return c.json({ error: result.error ?? "invalid provider config" }, 400);
  }

  const config = { ...result.config, baseUrl: normalizeBaseUrl(result.config.baseUrl) };
  await upsertProvider(id, config);
  invalidateModelCache();
  // Surface any schema error the SDK detects after the write, plus a
  // non-blocking warning when the endpoint doesn't actually respond.
  return c.json({
    ok: true,
    error: getModelsConfigError(),
    warning: await reachabilityWarning(config),
  });
});

localModels.delete("/local-providers/:id", async (c) => {
  const id = c.req.param("id");
  if (!id.trim()) return c.json({ error: "provider id is required" }, 400);
  await removeProvider(id);
  invalidateModelCache();
  return c.json({ ok: true });
});

export default localModels;
