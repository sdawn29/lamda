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

  await upsertProvider(id, result.config);
  invalidateModelCache();
  // Surface any schema error the SDK detects after the write.
  return c.json({ ok: true, error: getModelsConfigError() });
});

localModels.delete("/local-providers/:id", async (c) => {
  const id = c.req.param("id");
  if (!id.trim()) return c.json({ error: "provider id is required" }, 400);
  await removeProvider(id);
  invalidateModelCache();
  return c.json({ ok: true });
});

export default localModels;
