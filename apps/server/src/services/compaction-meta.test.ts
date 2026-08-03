import { describe, expect, it } from "vitest";
import { buildCompactionMeta } from "./compaction-meta.js";

describe("buildCompactionMeta", () => {
  it("carries readFiles/modifiedFiles through for the default details shape", () => {
    const meta = buildCompactionMeta({
      summary: "Did some work",
      tokensBefore: 12000,
      estimatedTokensAfter: 3000,
      details: {
        readFiles: ["src/a.ts", "src/b.ts"],
        modifiedFiles: ["src/a.ts"],
      },
    });
    expect(meta).toEqual({
      summary: "Did some work",
      tokensBefore: 12000,
      estimatedTokensAfter: 3000,
      readFiles: ["src/a.ts", "src/b.ts"],
      modifiedFiles: ["src/a.ts"],
    });
  });

  it("degrades a foreign details shape to empty file lists instead of throwing", () => {
    const meta = buildCompactionMeta({
      summary: "Structured compaction summary",
      tokensBefore: 8000,
      details: { artifactIndex: { v: 2 }, someOtherField: 42 },
    });
    expect(meta.readFiles).toEqual([]);
    expect(meta.modifiedFiles).toEqual([]);
    expect(meta.summary).toBe("Structured compaction summary");
  });

  it("degrades a partially-shaped details object (only one array present)", () => {
    const meta = buildCompactionMeta({
      summary: "Partial",
      tokensBefore: 100,
      details: { readFiles: ["src/a.ts"] },
    });
    expect(meta.readFiles).toEqual([]);
    expect(meta.modifiedFiles).toEqual([]);
  });

  it("handles absent details as empty file lists, and omits estimatedTokensAfter when absent", () => {
    const meta = buildCompactionMeta({
      summary: "No details on this entry",
      tokensBefore: 500,
    });
    expect(meta.readFiles).toEqual([]);
    expect(meta.modifiedFiles).toEqual([]);
    expect(meta.estimatedTokensAfter).toBeUndefined();
    expect("estimatedTokensAfter" in meta).toBe(false);
  });
});
