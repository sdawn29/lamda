import { describe, expect, it } from "vitest";
import { parseFrontmatter, parseList, unquote } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("splits frontmatter fields from the body", () => {
    const { fields, body } = parseFrontmatter(
      "---\nname: Explore\ndescription: A scout\n---\n\nYou are a scout.\n",
    );
    expect(fields.get("name")).toBe("Explore");
    expect(fields.get("description")).toBe("A scout");
    expect(body).toBe("You are a scout.");
  });

  it("returns the whole text as body when there is no frontmatter", () => {
    const { fields, body } = parseFrontmatter("Just a prompt.\n");
    expect(fields.size).toBe(0);
    expect(body).toBe("Just a prompt.");
  });

  it("skips comments and lines without a colon", () => {
    const { fields } = parseFrontmatter(
      "---\n# a comment\nnot a field\nname: Ok\n---\nbody",
    );
    expect(fields.size).toBe(1);
    expect(fields.get("name")).toBe("Ok");
  });

  it("keeps values raw (quotes preserved) for the caller to unquote", () => {
    const { fields } = parseFrontmatter('---\nname: "Quoted"\n---\nbody');
    expect(fields.get("name")).toBe('"Quoted"');
    expect(unquote(fields.get("name")!)).toBe("Quoted");
  });

  it("handles CRLF line endings and a BOM", () => {
    const { fields, body } = parseFrontmatter(
      "\uFEFF---\r\nname: Win\r\n---\r\nbody line",
    );
    expect(fields.get("name")).toBe("Win");
    expect(body).toBe("body line");
  });

  it("keeps a value containing colons intact", () => {
    const { fields } = parseFrontmatter(
      "---\nmodel: anthropic::claude-sonnet-5\n---\nbody",
    );
    expect(fields.get("model")).toBe("anthropic::claude-sonnet-5");
  });
});

describe("parseList", () => {
  it("parses inline bracket lists", () => {
    expect(parseList("[read, grep, find]")).toEqual(["read", "grep", "find"]);
  });

  it("parses bare comma lists and drops empties", () => {
    expect(parseList("read, , 'grep'")).toEqual(["read", "grep"]);
  });
});
