import { Hono } from "hono";
import { getAllSettings, upsertSetting } from "@lamda/db";
import { generateThreadTitle } from "@lamda/pi-sdk";

const settings = new Hono();

settings.get("/settings", (c) => c.json({ settings: getAllSettings() }));

settings.put("/settings/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req
    .json<{ value?: string }>()
    .catch((): { value?: string } => ({}));
  if (body.value === undefined)
    return c.json({ error: "value is required" }, 400);
  upsertSetting(key, body.value);
  return c.json({ ok: true });
});

settings.post("/title", async (c) => {
  const body = await c.req
    .json<{ message?: string }>()
    .catch((): { message?: string } => ({}));
  if (!body.message) return c.json({ error: "message is required" }, 400);

  // Prompt template and model are configured in Settings → Chat, persisted in
  // the app settings table. An empty/absent model falls back to the default.
  const all = getAllSettings();
  const promptTemplate = all["title_generation_prompt"] || undefined;
  const { provider, model } = parseModelKey(all["title_generation_model"]);

  const title = await generateThreadTitle(
    body.message,
    { provider, model },
    promptTemplate,
  );
  return c.json({ title });
});

/** Splits a stored `provider::model` key into its parts. */
export function parseModelKey(key: string | undefined): {
  provider?: string;
  model?: string;
} {
  if (!key) return {};
  const idx = key.indexOf("::");
  if (idx === -1) return {};
  return { provider: key.slice(0, idx), model: key.slice(idx + 2) };
}

export default settings;
