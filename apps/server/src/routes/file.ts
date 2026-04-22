import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";

const file = new Hono();

file.get("/file", async (c) => {
  const path = c.req.query("path");
  if (!path) {
    return c.json({ error: "path query param is required" }, 400);
  }

  try {
    const fileStats = await stat(path);
    if (fileStats.isDirectory()) {
      return c.json({ error: "path is a directory, not a file" }, 400);
    }
    const content = await readFile(path, "utf-8");
    return c.text(content);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export default file;
