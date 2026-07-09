import { describe, expect, it } from "vitest";
import {
  expandToolAllowlist,
  isToolAllowed,
  toolAllowlistEntryMatches,
} from "./tool-allowlist.js";

describe("toolAllowlistEntryMatches", () => {
  it("matches exact names", () => {
    expect(toolAllowlistEntryMatches("read", "read")).toBe(true);
    expect(toolAllowlistEntryMatches("read", "reader")).toBe(false);
  });

  it("matches prefix globs", () => {
    expect(
      toolAllowlistEntryMatches("mcp__github__*", "mcp__github__search"),
    ).toBe(true);
    expect(
      toolAllowlistEntryMatches("mcp__github__*", "mcp__linear__search"),
    ).toBe(false);
    // A server prefix never bleeds into a longer server name.
    expect(toolAllowlistEntryMatches("mcp__git__*", "mcp__github__pr")).toBe(
      false,
    );
  });
});

describe("isToolAllowed", () => {
  it("checks every entry", () => {
    const allowlist = ["read", "github_*", "mcp__linear__*"];
    expect(isToolAllowed("read", allowlist)).toBe(true);
    expect(isToolAllowed("github_list_prs", allowlist)).toBe(true);
    expect(isToolAllowed("mcp__linear__create_issue", allowlist)).toBe(true);
    expect(isToolAllowed("bash", allowlist)).toBe(false);
  });
});

describe("expandToolAllowlist", () => {
  it("expands globs against available names and passes exact names through", () => {
    const available = [
      "read",
      "mcp__github__search",
      "mcp__github__get_pr",
      "mcp__linear__create_issue",
    ];
    expect(
      expandToolAllowlist(["read", "bash", "mcp__github__*"], available).sort(),
    ).toEqual(["bash", "mcp__github__get_pr", "mcp__github__search", "read"]);
  });

  it("dedupes overlapping entries", () => {
    expect(
      expandToolAllowlist(
        ["mcp__a__x", "mcp__a__*"],
        ["mcp__a__x", "mcp__a__y"],
      ).sort(),
    ).toEqual(["mcp__a__x", "mcp__a__y"]);
  });
});
