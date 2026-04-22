import { Hono } from "hono";
import { readdir } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { join, basename } from "node:path";

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

const directory = new Hono();

directory.get("/directory", async (c) => {
  const path = c.req.query("path");
  if (!path) {
    return c.json({ error: "path query param is required" }, 400);
  }

  try {
    const entries = await readdir(path, { withFileTypes: true });
    const result: DirectoryEntry[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(path, entry.name);
        const isDirectory = entry.isDirectory();
        return {
          name: entry.name,
          path: fullPath,
          type: isDirectory ? "directory" : "file",
        };
      })
    );

    // Sort: directories first, then files, both alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export default directory;
