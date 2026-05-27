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
    .json<{ message?: string; provider?: string; model?: string }>()
    .catch((): { message?: string; provider?: string; model?: string } => ({}));
  if (!body.message) return c.json({ error: "message is required" }, 400);
  const title = await generateThreadTitle(body.message, {
    provider: body.provider,
    model: body.model,
  });
  return c.json({ title });
});

export default settings;
