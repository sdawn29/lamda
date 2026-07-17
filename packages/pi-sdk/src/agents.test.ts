import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureAgentFiles,
  getAgentConfig,
  isValidAgentId,
  listAgents,
  parseAgentModel,
  serializeAgentFile,
  SUBAGENT_TOOL_NAMES,
} from "./agents.js";

// The loader resolves the global dir through os.homedir(), which honors $HOME
// on POSIX — point it at a fresh temp dir per test so nothing touches the real
// ~/.lamda. (getAgentConfig's mtime cache revalidates by path, so a changed
// HOME never serves a stale entry.)
let home: string;
let cwd: string;
const originalHome = process.env.HOME;

function writeAgentFile(dir: string, id: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), content, "utf8");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "lamda-agents-home-"));
  cwd = mkdtempSync(join(tmpdir(), "lamda-agents-cwd-"));
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("parseAgentModel", () => {
  it("splits provider::model", () => {
    expect(parseAgentModel("anthropic::claude-sonnet-5")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  it("rejects malformed values", () => {
    expect(parseAgentModel(undefined)).toBeUndefined();
    expect(parseAgentModel("")).toBeUndefined();
    expect(parseAgentModel("no-separator")).toBeUndefined();
    expect(parseAgentModel("::model")).toBeUndefined();
    expect(parseAgentModel("provider::")).toBeUndefined();
  });
});

describe("isValidAgentId", () => {
  it("accepts kebab ids and rejects others", () => {
    expect(isValidAgentId("code-reviewer")).toBe(true);
    expect(isValidAgentId("a1")).toBe(true);
    expect(isValidAgentId("Bad_Id")).toBe(false);
    expect(isValidAgentId("-leading")).toBe(false);
    expect(isValidAgentId("")).toBe(false);
  });
});

describe("getAgentConfig", () => {
  it("returns built-in defaults when no file exists", () => {
    const general = getAgentConfig("general");
    expect(general?.source).toBe("builtin");
    expect(general?.tools).toEqual([
      ...SUBAGENT_TOOL_NAMES,
      "memory",
      "lsp",
      "semantic_search",
    ]);

    const explore = getAgentConfig("explore");
    expect(explore?.tools).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "memory",
      "lsp",
      "semantic_search",
    ]);

    const research = getAgentConfig("research");
    expect(research?.tools).toEqual([
      "web_fetch",
      "read",
      "grep",
      "find",
      "ls",
      "memory",
      "semantic_search",
    ]);

    const reviewer = getAgentConfig("reviewer");
    expect(reviewer?.tools).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "memory",
      "lsp",
      "semantic_search",
    ]);
  });

  it("returns undefined for unknown or invalid ids", () => {
    expect(getAgentConfig("nope")).toBeUndefined();
    expect(getAgentConfig("Not Valid")).toBeUndefined();
  });

  it("parses a custom agent file with all fields", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "reviewer",
      serializeAgentFile({
        label: "Reviewer",
        description: "Reviews diffs",
        systemPrompt: "You review code.",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        tools: ["read", "grep", "memory", "mcp__github__search"],
        color: "teal",
        icon: "search",
      }),
    );

    const config = getAgentConfig("reviewer");
    expect(config).toMatchObject({
      id: "reviewer",
      label: "Reviewer",
      description: "Reviews diffs",
      systemPrompt: "You review code.",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      tools: ["read", "grep", "memory", "mcp__github__search"],
      color: "teal",
      icon: "search",
      source: "global",
    });
  });

  it("defaults omitted fields and strips denied tools", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "bare",
      "---\nname: Bare\ntools: [read, todo, plan, delegate, question, bash]\n---\nDo things.",
    );
    const config = getAgentConfig("bare");
    // Host chat controls are never available to subagents; unknown names
    // (potential workspace custom tools) would be kept.
    expect(config?.tools).toEqual(["read", "bash"]);
    expect(config?.model).toBeUndefined();
    expect(config?.color).toBe("violet");
  });

  it("merges a legacy customTools list into the unified tools array", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "legacy",
      "---\nname: Legacy\ntools: [read, grep]\ncustomTools: [memory, mcp__github__search]\n---\nDo things.",
    );
    expect(getAgentConfig("legacy")?.tools).toEqual([
      "read",
      "grep",
      "memory",
      "mcp__github__search",
    ]);
  });

  it("prefers a workspace-local file over the global one", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "dup",
      "---\nname: Global\n---\nGlobal prompt",
    );
    writeAgentFile(
      join(cwd, ".lamda", "agents"),
      "dup",
      "---\nname: Local\n---\nLocal prompt",
    );

    const local = getAgentConfig("dup", cwd);
    expect(local?.label).toBe("Local");
    expect(local?.source).toBe("local");

    const globalOnly = getAgentConfig("dup");
    expect(globalOnly?.label).toBe("Global");
    expect(globalOnly?.source).toBe("global");
  });

  it("lets a file override a built-in", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "explore",
      "---\nname: Custom Explore\n---\nCustom prompt",
    );
    const config = getAgentConfig("explore");
    expect(config?.label).toBe("Custom Explore");
    expect(config?.systemPrompt).toBe("Custom prompt");
    // Omitted fields fall back to the built-in default.
    expect(config?.tools).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "memory",
      "lsp",
      "semantic_search",
    ]);
  });
});

describe("listAgents", () => {
  it("lists built-ins first, then customs sorted, local wins", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "zeta",
      "---\nname: Zeta\n---\np",
    );
    writeAgentFile(
      join(cwd, ".lamda", "agents"),
      "alpha",
      "---\nname: Alpha\n---\np",
    );

    const ids = listAgents(cwd).map((a) => a.id);
    expect(ids).toEqual([
      "general",
      "explore",
      "research",
      "reviewer",
      "alpha",
      "zeta",
    ]);
  });

  it("ignores invalid ids and non-md files", () => {
    const dir = join(home, ".lamda", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Bad_Name.md"), "x", "utf8");
    writeFileSync(join(dir, "notes.txt"), "x", "utf8");
    expect(listAgents().map((a) => a.id)).toEqual([
      "general",
      "explore",
      "research",
      "reviewer",
    ]);
  });
});

describe("ensureAgentFiles", () => {
  it("seeds built-in files once and never overwrites edits", () => {
    ensureAgentFiles();
    const seeded = getAgentConfig("general");
    expect(seeded?.source).toBe("global");
    expect(seeded?.systemPrompt.length).toBeGreaterThan(0);

    writeAgentFile(
      join(home, ".lamda", "agents"),
      "general",
      "---\nname: Mine\n---\nMy prompt",
    );
    ensureAgentFiles();
    expect(getAgentConfig("general")?.label).toBe("Mine");
  });

  it("refreshes stale generated built-in files with current tool allowlists", () => {
    const explore = getAgentConfig("explore");
    expect(explore).toBeDefined();
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "explore",
      serializeAgentFile({
        label: "Explore",
        description: explore!.description,
        systemPrompt: explore!.systemPrompt,
        tools: ["read", "grep", "find", "ls", "memory"],
        color: "teal",
        icon: "telescope",
      }),
    );

    ensureAgentFiles();

    expect(getAgentConfig("explore")?.tools).toEqual(
      expect.arrayContaining(["semantic_search"]),
    );
  });

  it("does not refresh a user-edited built-in file", () => {
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "explore",
      serializeAgentFile({
        label: "Explore",
        description:
          'Read-only codebase scout for searches and "where/how is X done" questions. Fast and safe: it can read and search but never modifies anything.',
        systemPrompt: "My custom explore prompt.",
        tools: ["read"],
        color: "teal",
        icon: "telescope",
      }),
    );

    ensureAgentFiles();

    expect(getAgentConfig("explore")?.systemPrompt).toBe(
      "My custom explore prompt.",
    );
    expect(getAgentConfig("explore")?.tools).toEqual(["read"]);
  });

  it("does not refresh a built-in file with a custom tool-only edit", () => {
    const explore = getAgentConfig("explore");
    expect(explore).toBeDefined();
    writeAgentFile(
      join(home, ".lamda", "agents"),
      "explore",
      serializeAgentFile({
        label: "Explore",
        description:
          'Read-only codebase scout for searches and "where/how is X done" questions. Fast and safe: it can read and search but never modifies anything.',
        systemPrompt: explore!.systemPrompt,
        tools: ["read"],
        color: "teal",
        icon: "telescope",
      }),
    );

    ensureAgentFiles();

    expect(getAgentConfig("explore")?.tools).toEqual(["read"]);
  });
});
