import { describe, expect, it } from "vitest";
import {
  isIndexableFile,
  looksBinary,
  looksGenerated,
  chunkFileContent,
  chunkId,
  MAX_FILE_SIZE,
} from "./code-chunker.js";

describe("isIndexableFile", () => {
  it("rejects empty and oversized files", () => {
    expect(isIndexableFile("src/index.ts", 0)).toBe(false);
    expect(isIndexableFile("src/index.ts", MAX_FILE_SIZE + 1)).toBe(false);
  });

  it("accepts a normal source file within the size cap", () => {
    expect(isIndexableFile("src/index.ts", 1024)).toBe(true);
  });

  it("rejects known lockfiles", () => {
    expect(isIndexableFile("package-lock.json", 1024)).toBe(false);
    expect(isIndexableFile("pnpm-lock.yaml", 1024)).toBe(false);
    expect(isIndexableFile("apps/web/yarn.lock", 1024)).toBe(false);
  });

  it("rejects minified and denylisted-extension files", () => {
    expect(isIndexableFile("dist/app.min.js", 1024)).toBe(false);
    expect(isIndexableFile("src/logo.svg", 1024)).toBe(false);
    expect(isIndexableFile("dist/app.js.map", 1024)).toBe(false);
    expect(isIndexableFile("assets/photo.png", 1024)).toBe(false);
  });
});

describe("looksBinary", () => {
  it("detects a NUL byte in the first 8KB", () => {
    expect(looksBinary(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksBinary(Buffer.from("export const x = 1;\n"))).toBe(false);
  });
});

describe("looksGenerated", () => {
  it("flags a single very long line", () => {
    expect(looksGenerated("a".repeat(2001))).toBe(true);
  });

  it("flags a high average line length", () => {
    const text = Array.from({ length: 5 }, () => "x".repeat(400)).join("\n");
    expect(looksGenerated(text)).toBe(true);
  });

  it("does not flag normal code", () => {
    const text = Array.from(
      { length: 20 },
      (_, i) => `const a${i} = ${i};`,
    ).join("\n");
    expect(looksGenerated(text)).toBe(false);
  });
});

describe("chunkFileContent", () => {
  it("returns no chunks for empty content", () => {
    expect(chunkFileContent("")).toEqual([]);
    expect(chunkFileContent("   \n  \n")).toEqual([]);
  });

  it("returns a single chunk covering the whole file when short", () => {
    const text = "line1\nline2\nline3";
    const chunks = chunkFileContent(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.startLine).toBe(1);
    expect(chunks[0]!.endLine).toBe(3);
    expect(chunks[0]!.content).toBe(text);
  });

  it("splits long files into multiple overlapping chunks", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i};`);
    const chunks = chunkFileContent(lines.join("\n"));
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk exceeds the hard line cap.
    for (const c of chunks) {
      expect(c.endLine - c.startLine + 1).toBeLessThanOrEqual(90);
    }
    // Consecutive chunks overlap (next starts at or before the previous end),
    // and chunk indices are contiguous starting from 0.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startLine).toBeLessThanOrEqual(chunks[i - 1]!.endLine);
      expect(chunks[i]!.chunkIndex).toBe(chunks[i - 1]!.chunkIndex + 1);
    }
    // The last chunk reaches the end of the file.
    expect(chunks[chunks.length - 1]!.endLine).toBe(300);
  });

  it("snaps a chunk boundary to a nearby blank line instead of an arbitrary cut", () => {
    // A blank line sits a few lines before the default target window (60),
    // so the first chunk should end there rather than mid-block at line 60.
    const before = Array.from({ length: 55 }, (_, i) => `const a${i} = ${i};`);
    const after = Array.from({ length: 55 }, (_, i) => `const b${i} = ${i};`);
    const text = [...before, "", ...after].join("\n");
    const chunks = chunkFileContent(text);
    expect(chunks[0]!.endLine).toBeLessThan(60);
  });

  it("caps chunk size in characters even within the line limit", () => {
    const lines = Array.from({ length: 30 }, () => "x".repeat(200));
    const chunks = chunkFileContent(lines.join("\n"));
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(2500);
    }
  });

  it("produces the same chunks (content and hashes) on repeated calls", () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i}`);
    const a = chunkFileContent(lines.join("\n"));
    const b = chunkFileContent(lines.join("\n"));
    expect(a).toEqual(b);
  });

  it("gives different chunks a different contentHash", () => {
    const chunks = chunkFileContent(
      Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n"),
    );
    const hashes = new Set(chunks.map((c) => c.contentHash));
    expect(hashes.size).toBe(chunks.length);
  });
});

describe("chunkId", () => {
  it("is deterministic for identical inputs", () => {
    const a = chunkId("ws1", "src/index.ts", 0, "abc123");
    const b = chunkId("ws1", "src/index.ts", 0, "abc123");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes when the content hash changes (content edited)", () => {
    const a = chunkId("ws1", "src/index.ts", 0, "abc123");
    const b = chunkId("ws1", "src/index.ts", 0, "def456");
    expect(a).not.toBe(b);
  });

  it("changes when workspace, file path, or chunk index differ", () => {
    const base = chunkId("ws1", "src/index.ts", 0, "abc123");
    expect(chunkId("ws2", "src/index.ts", 0, "abc123")).not.toBe(base);
    expect(chunkId("ws1", "src/other.ts", 0, "abc123")).not.toBe(base);
    expect(chunkId("ws1", "src/index.ts", 1, "abc123")).not.toBe(base);
  });
});
