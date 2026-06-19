import { Hono } from "hono";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { Readable } from "node:stream";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { listWorkspacesWithThreads } from "@lamda/db";

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
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(ext: string): string {
  return (
    BINARY_MIME_TYPES[ext] ??
    TEXT_MIME_TYPES[ext] ??
    "text/plain; charset=utf-8"
  );
}

/** Resolves the realpath when the file exists, else falls back to a lexical resolve. */
async function canonicalize(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Confines `/file` reads to registered workspace directories and worktrees
 * attached to their threads. Without this, the `path` query param is an
 * arbitrary-file-read primitive (e.g. `/file?path=/Users/you/.ssh/id_rsa`).
 * Symlinks are resolved before the containment check so they can't be used to
 * escape an allowed root.
 */
async function isWithinWorkspace(target: string): Promise<boolean> {
  const real = await canonicalize(target);
  const roots = listWorkspacesWithThreads().flatMap((workspace) =>
    [workspace.path, ...workspace.threads.map((t) => t.worktreePath)].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    ),
  );

  for (const root of roots) {
    const realRoot = await canonicalize(root);
    const rel = relative(realRoot, real);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return true;
  }
  return false;
}

/**
 * Parses an HTTP `Range` header against a known file size. Supports a single
 * `bytes=start-end`, open-ended `bytes=start-`, and suffix `bytes=-N` forms.
 * Returns inclusive {start, end} byte offsets, or null when the range is
 * absent/malformed/unsatisfiable (the caller decides 200 vs 416).
 */
function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;

  let start: number;
  let end: number;

  if (startStr === "") {
    // Suffix range: the last N bytes.
    const suffix = Number.parseInt(endStr, 10);
    if (Number.isNaN(suffix) || suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === "" ? size - 1 : Number.parseInt(endStr, 10);
    if (Number.isNaN(start)) return null;
    if (Number.isNaN(end)) end = size - 1;
    end = Math.min(end, size - 1);
  }

  if (start < 0 || start > end || start >= size) return null;
  return { start, end };
}

const file = new Hono();

file.get("/file", async (c) => {
  const path = c.req.query("path");
  if (!path) {
    return c.json({ error: "path query param is required" }, 400);
  }

  if (!(await isWithinWorkspace(path))) {
    return c.json({ error: "path is outside any open workspace" }, 403);
  }

  let fileStat;
  try {
    fileStat = await stat(path);
  } catch (err: any) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }

  if (fileStat.isDirectory()) {
    return c.json({ error: "path is a directory, not a file" }, 400);
  }

  const ext = extname(path).toLowerCase();
  const contentType = contentTypeFor(ext);
  const size = fileStat.size;

  const rangeHeader = c.req.header("range");
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;

  // A Range header that can't be satisfied gets a 416 with the full size.
  if (rangeHeader && !range && size > 0) {
    return c.body(null, 416, {
      "Content-Range": `bytes */${size}`,
      "Accept-Ranges": "bytes",
    });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(0, size - 1);
  const length = size === 0 ? 0 : end - start + 1;

  // Empty files have no satisfiable byte range; stream the whole (empty) file.
  const nodeStream =
    size === 0
      ? createReadStream(path)
      : createReadStream(path, { start, end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(length),
  };

  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return c.body(webStream, 206, headers);
  }

  return c.body(webStream, 200, headers);
});

export default file;
