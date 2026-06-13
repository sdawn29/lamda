import { Hono } from "hono";
import {
  listMemories,
  insertMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  type MemoryScope,
} from "@lamda/db";

const memories = new Hono();

function parseScope(value: string | undefined): MemoryScope | undefined {
  return value === "user" || value === "workspace" ? value : undefined;
}

memories.get("/memories", (c) => {
  const scope = parseScope(c.req.query("scope"));
  const workspaceId = c.req.query("workspaceId") || undefined;
  return c.json({ memories: listMemories({ scope, workspaceId }) });
});

memories.post("/memories", async (c) => {
  const body = await c.req
    .json<{
      scope?: string;
      workspaceId?: string;
      title?: string;
      content?: string;
      category?: string;
    }>()
    .catch(() => ({}) as Record<string, never>);

  const scope = parseScope(body.scope);
  if (!scope) return c.json({ error: "scope must be 'user' or 'workspace'" }, 400);
  if (!body.title?.trim() || !body.content?.trim()) {
    return c.json({ error: "title and content are required" }, 400);
  }
  if (scope === "workspace" && !body.workspaceId) {
    return c.json({ error: "workspaceId is required for workspace scope" }, 400);
  }

  const id = insertMemory({
    scope,
    workspaceId: scope === "workspace" ? body.workspaceId : null,
    title: body.title.trim(),
    content: body.content.trim(),
    category: body.category?.trim() || null,
    source: "user",
  });
  return c.json({ memory: getMemory(id) }, 201);
});

memories.patch("/memories/:id", async (c) => {
  const id = c.req.param("id");
  if (!getMemory(id)) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ title?: string; content?: string; category?: string | null; pinned?: boolean }>()
    .catch(() => ({}) as Record<string, never>);

  const updates: {
    title?: string;
    content?: string;
    category?: string | null;
    pinned?: boolean;
  } = {};
  if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.content === "string" && body.content.trim())
    updates.content = body.content.trim();
  if (body.category !== undefined) {
    updates.category = typeof body.category === "string" ? body.category.trim() || null : null;
  }
  if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
  if (Object.keys(updates).length === 0) {
    return c.json({ error: "no valid fields to update" }, 400);
  }

  updateMemory(id, updates);
  return c.json({ memory: getMemory(id) });
});

memories.delete("/memories/:id", (c) => {
  const id = c.req.param("id");
  if (!getMemory(id)) return c.json({ error: "Not found" }, 404);
  deleteMemory(id);
  return new Response(null, { status: 204 });
});

export default memories;
