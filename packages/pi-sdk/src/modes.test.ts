import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeActiveToolsForMode,
  ensureModeFiles,
  getModeConfig,
  isValidModeId,
  listModes,
  serializeModeFile,
} from "./modes.js";

let home: string;
let cwd: string;
const originalHome = process.env.HOME;

function writeModeFile(dir: string, id: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), content, "utf8");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "lamda-modes-home-"));
  cwd = mkdtempSync(join(tmpdir(), "lamda-modes-cwd-"));
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("isValidModeId", () => {
  it("accepts kebab ids and rejects others", () => {
    expect(isValidModeId("code-review")).toBe(true);
    expect(isValidModeId("a1")).toBe(true);
    expect(isValidModeId("Bad_Id")).toBe(false);
    expect(isValidModeId("-leading")).toBe(false);
    expect(isValidModeId("")).toBe(false);
  });
});

describe("getModeConfig", () => {
  it("configures ask as read-only with read-only agents", () => {
    const ask = getModeConfig("ask");
    expect(ask.agents).toEqual(["explore"]);
    expect(ask.tools).toEqual(
      expect.arrayContaining([
        "read",
        "grep",
        "find",
        "ls",
        "question",
        "memory",
        "delegate",
        "lsp",
        "web_fetch",
        "semantic_search",
      ]),
    );
    expect(ask.tools).not.toEqual(
      expect.arrayContaining(["bash", "edit", "write", "plan", "todo"]),
    );
  });

  it("configures plan for research and plan artifact writes only", () => {
    const plan = getModeConfig("plan");
    expect(plan.agents).toEqual(["explore", "research"]);
    expect(plan.tools).toEqual(
      expect.arrayContaining([
        "read",
        "grep",
        "find",
        "ls",
        "bash",
        "plan",
        "question",
        "memory",
        "delegate",
        "lsp",
        "web_fetch",
        "semantic_search",
      ]),
    );
    expect(plan.tools).not.toEqual(
      expect.arrayContaining(["edit", "write", "todo"]),
    );
  });

  it("configures agent with the full coding tool surface", () => {
    const agent = getModeConfig("agent");
    expect(agent.agents).toBeNull();
    expect(agent.tools).toEqual(
      expect.arrayContaining([
        "read",
        "bash",
        "edit",
        "write",
        "todo",
        "grep",
        "find",
        "ls",
        "question",
        "memory",
        "delegate",
        "lsp",
        "create_automation",
        "web_fetch",
        "semantic_search",
      ]),
    );
  });

  it("parses custom tools and agents from a mode file", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "review",
      serializeModeFile({
        label: "Review",
        description: "Reviews code",
        preamble: "Review carefully.",
        tools: ["read", "grep", "mcp__github__*"],
        agents: ["explore"],
        color: "teal",
        icon: "search",
      }),
    );

    expect(getModeConfig("review")).toMatchObject({
      id: "review",
      label: "Review",
      tools: ["read", "grep", "mcp__github__*"],
      agents: ["explore"],
      source: "global",
    });
  });

  it("lets a file override a built-in while defaulting omitted tools", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "ask",
      "---\nname: My Ask\n---\nCustom ask prompt",
    );

    const config = getModeConfig("ask");
    expect(config.label).toBe("My Ask");
    expect(config.preamble).toBe("Custom ask prompt");
    expect(config.tools).toEqual(
      expect.arrayContaining([
        "read",
        "grep",
        "find",
        "ls",
        "question",
        "memory",
        "delegate",
        "lsp",
        "web_fetch",
        "semantic_search",
      ]),
    );
    expect(config.tools).not.toEqual(
      expect.arrayContaining(["bash", "edit", "write"]),
    );
  });
});

describe("listModes", () => {
  it("lists built-ins first, then customs sorted, local wins", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "zeta",
      "---\nname: Zeta\n---\np",
    );
    writeModeFile(
      join(cwd, ".lamda", "modes"),
      "alpha",
      "---\nname: Alpha\n---\np",
    );

    expect(listModes(cwd).map((mode) => mode.id)).toEqual([
      "ask",
      "plan",
      "agent",
      "alpha",
      "zeta",
    ]);
  });
});

describe("ensureModeFiles", () => {
  it("seeds built-in files once and never overwrites edits", () => {
    ensureModeFiles();
    expect(getModeConfig("agent").source).toBe("global");

    writeModeFile(
      join(home, ".lamda", "modes"),
      "agent",
      "---\nname: Mine\n---\nMy prompt",
    );
    ensureModeFiles();
    expect(getModeConfig("agent").label).toBe("Mine");
  });

  it("refreshes stale generated built-in files with current tool allowlists", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "ask",
      serializeModeFile({
        label: "Ask",
        description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
        preamble: getModeConfig("ask").preamble,
        tools: ["read", "grep", "find", "ls", "question", "memory", "delegate"],
        agents: ["explore"],
        color: "sky",
        icon: "message-circle-question",
      }),
    );

    ensureModeFiles();

    expect(getModeConfig("ask").tools).toEqual(
      expect.arrayContaining(["lsp", "web_fetch", "semantic_search"]),
    );
  });

  it("does not refresh a user-edited built-in file", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "ask",
      serializeModeFile({
        label: "Ask",
        description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
        preamble: "My custom ask prompt.",
        tools: ["read"],
        agents: ["explore"],
        color: "sky",
        icon: "message-circle-question",
      }),
    );

    ensureModeFiles();

    expect(getModeConfig("ask").preamble).toBe("My custom ask prompt.");
    expect(getModeConfig("ask").tools).toEqual(["read"]);
  });

  it("does not refresh a built-in file with a custom tool-only edit", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "ask",
      serializeModeFile({
        label: "Ask",
        description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
        preamble: getModeConfig("ask").preamble,
        tools: ["read"],
        agents: ["explore"],
        color: "sky",
        icon: "message-circle-question",
      }),
    );

    ensureModeFiles();

    expect(getModeConfig("ask").tools).toEqual(["read"]);
  });
});

describe("computeActiveToolsForMode", () => {
  it("expands wildcard tool allowlist entries against available tools", () => {
    writeModeFile(
      join(home, ".lamda", "modes"),
      "mcp-mode",
      "---\nname: MCP Mode\ntools: [read, mcp__github__*]\n---\nUse MCP.",
    );

    expect(
      computeActiveToolsForMode("mcp-mode", undefined, [
        "read",
        "mcp__github__search",
        "mcp__github__create_issue",
        "mcp__linear__search",
      ]),
    ).toEqual(["read", "mcp__github__search", "mcp__github__create_issue"]);
  });
});
