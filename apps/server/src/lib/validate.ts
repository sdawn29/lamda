import type { Context } from "hono";
import type { ZodType } from "zod";

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Parses the request's JSON body and validates it against `schema`.
 *
 * A missing or malformed body is tolerated as `{}` before validation — this
 * matches the `c.req.json<T>().catch(() => ({}))` pattern every route used
 * before this helper existed, so routes whose schema makes every field
 * optional keep accepting a bodyless request exactly as they did before.
 * What's new is that a body with the wrong *shape* (wrong types, unknown
 * required fields) is now rejected with a 400 instead of silently flowing
 * into the handler as a mistyped object.
 *
 * Callers check `.ok` and return `.response` on failure:
 *
 *   const parsed = await parseJsonBody(c, mySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data;
 */
export async function parseJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<ParsedBody<T>> {
  const raw = await c.req.json().catch(() => ({}));
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request body";
    return { ok: false, response: c.json({ error: message }, 400) };
  }
  return { ok: true, data: result.data };
}
