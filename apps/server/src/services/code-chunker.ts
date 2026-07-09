import { createHash } from "node:crypto";

// Files never worth chunking: lockfiles (huge, no semantic value), build
// output/maps, and binary/media formats that occasionally sneak past the
// binary sniff below (e.g. a well-formed SVG is valid UTF-8 text).
const DENYLIST_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
]);

const DENYLIST_EXTENSIONS = new Set([
  ".map",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".pdf",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wav",
  ".flac",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".class",
  ".jar",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".lock",
]);

/** Max file size (bytes) considered for chunking. */
export const MAX_FILE_SIZE = 512 * 1024;

function baseName(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

function extension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

/**
 * Whether a file is worth chunking based on its path and size alone (cheap,
 * no I/O). Callers still need `looksBinary`/`looksGenerated` on the actual
 * content before committing to chunk it.
 */
export function isIndexableFile(relPath: string, size: number): boolean {
  if (size <= 0 || size > MAX_FILE_SIZE) return false;
  const name = baseName(relPath);
  if (DENYLIST_NAMES.has(name)) return false;
  if (name.includes(".min.")) return false;
  const ext = extension(name);
  if (DENYLIST_EXTENSIONS.has(ext)) return false;
  return true;
}

/** NUL byte in the first 8KB is a reliable binary signal for source-tree files. */
export function looksBinary(buf: Buffer): boolean {
  const scanLen = Math.min(buf.length, 8192);
  for (let i = 0; i < scanLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Heuristic for minified/generated text that chunking wouldn't usefully
 * split: any single very long line, or a high average line length.
 */
export function looksGenerated(text: string): boolean {
  const lines = text.split("\n");
  let totalLen = 0;
  for (const line of lines) {
    if (line.length > 2000) return true;
    totalLen += line.length;
  }
  const avg = totalLen / Math.max(1, lines.length);
  return avg > 300;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

/** Target window size in lines before looking for a snap point. */
const TARGET_LINES = 60;
/** Hard cap on window size in lines, regardless of snap point. */
const MAX_LINES = 90;
/** Hard cap on window size in characters, regardless of line count. */
const MAX_CHARS = 2500;
/** Lines of overlap carried into the next window for context continuity. */
const OVERLAP_LINES = 10;
/** How far back (in lines) to look for a snap point before giving up. */
const SNAP_LOOKBACK = 15;

const STRUCTURAL_LINE = /^\s*(export |function |class |def |func |const |pub |fn )/;

export interface CodeChunk {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Find the best cut point for a window that starts at `start` (0-based,
 * inclusive) and would otherwise end at `idealEnd` (0-based, exclusive).
 * Scans backward up to SNAP_LOOKBACK lines from idealEnd for a blank line or
 * a line beginning a top-level declaration, so chunks tend to end on a
 * natural boundary instead of mid-block. Falls back to idealEnd untouched.
 */
function findSnapPoint(lines: string[], start: number, idealEnd: number): number {
  const floor = Math.max(start + 1, idealEnd - SNAP_LOOKBACK);
  for (let i = idealEnd - 1; i >= floor; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() === "" || STRUCTURAL_LINE.test(line)) {
      return i;
    }
  }
  return idealEnd;
}

/**
 * Split file content into overlapping line-window chunks. Dependency-free
 * (no tree-sitter/LSP) — windows snap to blank lines or common top-level
 * declaration keywords when possible, otherwise cut at the hard line/char cap.
 * Empty/whitespace-only input yields no chunks.
 */
export function chunkFileContent(text: string): CodeChunk[] {
  const lines = text.split("\n");
  if (lines.length === 1 && lines[0]!.trim() === "") return [];

  const chunks: CodeChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < lines.length) {
    const idealEnd = Math.min(lines.length, start + TARGET_LINES);
    let end =
      idealEnd < lines.length ? findSnapPoint(lines, start, idealEnd) : lines.length;
    // Snap point degenerated to <=start (e.g. no boundary found) — take the ideal end.
    if (end <= start) end = idealEnd;
    // Enforce the hard cap regardless of where the snap landed.
    end = Math.min(end, start + MAX_LINES, lines.length);

    let content = lines.slice(start, end).join("\n");
    if (content.length > MAX_CHARS) {
      // Trim to the char cap at a line boundary where possible.
      let clipped = start;
      let acc = 0;
      for (let i = start; i < end; i++) {
        acc += (lines[i]?.length ?? 0) + 1;
        if (acc > MAX_CHARS) break;
        clipped = i + 1;
      }
      end = Math.max(clipped, start + 1);
      content = lines.slice(start, end).join("\n");
    }

    const trimmed = content.trim();
    if (trimmed.length > 0) {
      chunks.push({
        chunkIndex,
        startLine: start + 1,
        endLine: end,
        content,
        contentHash: sha256(content),
      });
      chunkIndex++;
    }

    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP_LINES, start + 1);
  }

  return chunks;
}

/** Content-addressed chunk id: stable across re-index runs when content is unchanged. */
export function chunkId(
  workspaceId: string,
  filePath: string,
  chunkIndex: number,
  contentHash: string,
): string {
  return sha256(`${workspaceId}\n${filePath}\n${chunkIndex}\n${contentHash}`).slice(
    0,
    32,
  );
}
