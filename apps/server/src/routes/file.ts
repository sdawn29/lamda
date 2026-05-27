import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const BINARY_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".avif": "image/avif",
};

const TEXT_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
};

const file = new Hono();

file.get("/file", async (c) => {
  const path = c.req.query("path");
  if (!path) {
    return c.json({ error: "path query param is required" }, 400);
  }

  try {
    const ext = extname(path).toLowerCase();
    const binaryMime = BINARY_MIME_TYPES[ext];
    if (binaryMime) {
      const buffer = await readFile(path);
      return c.body(buffer, 200, { "Content-Type": binaryMime });
    }
    const content = await readFile(path, "utf-8");
    const textMime = TEXT_MIME_TYPES[ext];
    if (textMime) {
      return c.body(content, 200, { "Content-Type": textMime });
    }
    return c.text(content);
  } catch (err: any) {
    if (err.code === "EISDIR") {
      return c.json({ error: "path is a directory, not a file" }, 400);
    }
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

export default file;
