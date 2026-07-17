import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, parseList, unquote } from "./frontmatter.js";
import {
  lamdaAgentFilePath,
  lamdaAgentsDir,
  lamdaLocalAgentsDir,
} from "./lamda-paths.js";
import { MODE_COLORS } from "./modes.js";

/** Name of the tool the main agent uses to launch subagents. */
export const DELEGATE_TOOL_NAME = "delegate";

/**
 * Built-in tool names a subagent may be granted. Deliberately narrower than
 * `BUILTIN_TOOL_NAMES`: `todo` and `plan` are thread-bound UI features, and
 * `question` would block a headless run on user input that can never arrive.
 * The `delegate` tool itself is never granted, so subagents cannot spawn
 * subagents.
 */
export const SUBAGENT_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

/**
 * Tool names a subagent may never hold, regardless of its file's `tools`
 * list: host chat controls that only make sense on the interactive thread
 * (`question` would block a headless run forever; `todo`/`plan` are
 * thread-bound UI), plus `delegate` so subagents cannot spawn subagents.
 */
export const SUBAGENT_DENIED_TOOL_NAMES = [
  DELEGATE_TOOL_NAME,
  "question",
  "todo",
  "plan",
] as const;

/**
 * Where a resolved agent came from: a built-in default (no file on disk), a
 * workspace-local file, or the global `~/.lamda/agents` directory.
 */
export type AgentSource = "builtin" | "local" | "global";

export interface AgentModelRef {
  provider: string;
  model: string;
}

export interface AgentConfig {
  /** Agent id — the file's basename (or one of the built-ins). */
  id: string;
  /** Display name shown in the UI (frontmatter `name`). */
  label: string;
  /**
   * One-line summary of what the agent is for (frontmatter `description`).
   * Surfaced to the model in the delegate tool's description, so it should say
   * when to pick this agent.
   */
  description: string;
  /**
   * The subagent's system prompt — the body of the agent's markdown file
   * (everything after the frontmatter). Appended to the SDK base prompt in
   * place of lamda's chat-app context.
   */
  systemPrompt: string;
  /**
   * Model override (frontmatter `model`, as `provider::model`). Absent means
   * the subagent inherits the parent thread's model.
   */
  model?: AgentModelRef;
  /**
   * The subagent's complete tool allowlist (frontmatter `tools`) — one flat
   * array of names, mixing builtins (`read`, `bash`, …) and workspace custom
   * tools (`memory`, MCP, LSP, git-host) alike. Names in
   * {@link SUBAGENT_DENIED_TOOL_NAMES} are stripped on read.
   */
  tools: readonly string[];
  /** Named accent color for the agent's chip/icon (frontmatter `color`). */
  color: string;
  /** Named lucide icon for the agent (frontmatter `icon`); see web registry. */
  icon: string;
  /** Resolved origin of this config (not persisted; computed at read time). */
  source: AgentSource;
}

/** The subagents lamda ships with, in canonical display order. */
export const BUILTIN_AGENTS = ["general", "explore", "research"] as const;

export type BuiltinAgent = (typeof BUILTIN_AGENTS)[number];

/** Valid agent-id shape: kebab/alphanumeric, matching how files on disk are named. */
export function isValidAgentId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

/** Fallback color for custom agents that omit `color`. */
const DEFAULT_AGENT_COLOR = "violet";
/** Fallback icon for custom agents that omit `icon`. */
const DEFAULT_AGENT_ICON = "bot";

/** Constraints shared by every subagent, appended to each built-in prompt. */
const SUBAGENT_GROUND_RULES =
  "You run headlessly inside another agent's turn: you cannot ask the user questions, " +
  "and the only thing the caller receives is your final message. When the task is done " +
  "(or you are blocked), write that final message as a complete, self-contained report — " +
  "include the outcome, evidence, changed files or commands, validation, and blockers the caller needs, because your intermediate work is not shown to them. " +
  "Use only the tools you were granted, respect the task boundary, and never claim work you did not verify.";

/**
 * Built-in defaults for each agent. These seed `~/.lamda/agents/<id>.md` on
 * first run and act as the fallback when the file is missing/unreadable. Once
 * a file exists, its frontmatter + body take precedence — see `getAgentConfig`.
 */
const DEFAULT_AGENT_CONFIG: Record<BuiltinAgent, AgentConfig> = {
  general: {
    id: "general",
    label: "General",
    description:
      "The only built-in agent that can edit files or run commands. Use for multi-step implementation work: code changes, builds and tests, fixing failures. Needs a self-contained brief naming files and constraints.",
    systemPrompt:
      "You are a general-purpose software engineering agent with the full toolset — search, read, edit, and shell — completing a delegated task end to end.\n\n" +
      "- You start with no context beyond your brief: first read the files, diff, and workspace instructions it references, then search for whatever it doesn't spell out.\n" +
      "- Understand before changing: trace the actual cause and fix root causes, not symptoms; use search, read, and available semantic tools to ground every change.\n" +
      "- Make the smallest change that fully solves the problem; match the conventions of the surrounding code and don't refactor or reformat unrelated code.\n" +
      "- Use the shell for builds, tests, and scripted checks; avoid interactive or long-running commands that would hang a headless run.\n" +
      "- Verify before finishing: review the resulting diff and run the narrowest relevant check (the failing test, changed-file lint, or type-check).\n" +
      "- If the task is ambiguous, pick the most reasonable interpretation, state the assumption in your report, and proceed.\n\n" +
      SUBAGENT_GROUND_RULES,
    tools: [...SUBAGENT_TOOL_NAMES, "memory"],
    color: "emerald",
    icon: "bot",
    source: "builtin",
  },
  explore: {
    id: "explore",
    label: "Explore",
    description:
      'Read-only codebase scout for searches and "where/how is X done" questions. Fast and safe: it can read and search but never modifies anything.',
    systemPrompt:
      "You are a read-only exploration agent. Investigate the codebase to answer the question you were given.\n\n" +
      "- Ground every claim in code you actually read; cite concrete locations as `path/to/file.ts:line`.\n" +
      "- Fire independent searches in parallel; use semantic search or LSP when they can narrow the evidence, and read excerpts rather than whole files when possible.\n" +
      '- Separate fact from inference: flag deductions with "likely"/"appears" — never present a guess as verified.\n' +
      "- You cannot modify anything; if the task asks for changes, report what you found and what you would change instead.\n\n" +
      SUBAGENT_GROUND_RULES,
    tools: ["read", "grep", "find", "ls", "memory", "semantic_search"],
    color: "teal",
    icon: "telescope",
    source: "builtin",
  },
  research: {
    id: "research",
    label: "Research",
    description:
      "Read-only web researcher: fetches documentation, API references, and articles with web_fetch and reports back with cited sources. Use for questions about external libraries, APIs, or version behavior that the codebase alone can't answer.",
    systemPrompt:
      "You are a read-only research agent. Investigate the topic you were given — using the web and the codebase — and report what you find.\n\n" +
      "- Use `web_fetch` to read documentation, API references, changelogs, and articles. Prefer primary sources (official docs, the project's repository) over blog posts. Page through long documents with `offset` rather than stopping at a truncated result.\n" +
      "- You cannot search the web — you can only fetch URLs. Start from URLs given in the task or well-known documentation roots, then follow links discovered in fetched pages.\n" +
      "- Check the project's actual dependencies and usage with the read-only code tools (package manifests, lockfiles, imports) so findings match the versions in use; note when a doc describes a different version.\n" +
      "- Ground every claim in something you actually fetched or read; cite the source URL (or `path/to/file.ts:line` for code) next to each finding.\n" +
      '- Separate fact from inference: flag deductions with "likely"/"appears" — never present a guess as verified.\n' +
      "- You cannot modify anything; if the task asks for changes, report findings and recommendations instead.\n\n" +
      SUBAGENT_GROUND_RULES,
    tools: ["web_fetch", "read", "grep", "find", "ls", "memory", "semantic_search"],
    color: "blue",
    icon: "globe",
    source: "builtin",
  },
};

/** Parse a frontmatter `model` value of the form `provider::model`. */
export function parseAgentModel(
  value: string | undefined,
): AgentModelRef | undefined {
  if (!value) return undefined;
  const idx = value.indexOf("::");
  if (idx <= 0 || idx >= value.length - 2) return undefined;
  return { provider: value.slice(0, idx), model: value.slice(idx + 2) };
}

/** Normalize a frontmatter color to a known palette entry, or undefined. */
function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return (MODE_COLORS as readonly string[]).includes(lower) ? lower : undefined;
}

/**
 * Drop tool names a subagent may never hold. Unknown names are kept — they
 * may be workspace custom tools (MCP/LSP/git-host) that only resolve at spawn
 * time, when the runner intersects this list with what's actually available.
 */
function sanitizeTools(tools: readonly string[]): string[] {
  const denied = new Set<string>(SUBAGENT_DENIED_TOOL_NAMES);
  return [...new Set(tools.filter((name) => !denied.has(name)))];
}

/** Render an agent config as the on-disk file: frontmatter block + prompt body. */
export function serializeAgentFile(
  config: Omit<AgentConfig, "id" | "source">,
): string {
  const lines = [
    "---",
    `name: ${config.label}`,
    `description: ${config.description}`,
  ];
  if (config.model) {
    lines.push(`model: ${config.model.provider}::${config.model.model}`);
  }
  lines.push(`tools: [${config.tools.join(", ")}]`);
  lines.push(`color: ${config.color}`, `icon: ${config.icon}`, "---", "");
  lines.push(config.systemPrompt, "");
  return lines.join("\n");
}

/**
 * Fallback config for an agent with no built-in default — i.e. a custom agent
 * whose file omits some fields. Defaults to the full subagent toolset so a
 * bare custom file is usable.
 */
function genericDefault(id: string, source: AgentSource): AgentConfig {
  return {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    description: "",
    systemPrompt: "",
    tools: [...SUBAGENT_TOOL_NAMES, "memory"],
    color: DEFAULT_AGENT_COLOR,
    icon: DEFAULT_AGENT_ICON,
    source,
  };
}

/**
 * Resolve an agent's file path, preferring a workspace-local
 * `<cwd>/.lamda/agents/<id>.md` over the global `~/.lamda/agents/<id>.md`.
 * Returns the path and its source, or null when neither file exists.
 */
function resolveAgentFile(
  id: string,
  cwd?: string,
): { path: string; source: AgentSource } | null {
  if (cwd) {
    const local = join(lamdaLocalAgentsDir(cwd), `${id}.md`);
    if (existsSync(local)) return { path: local, source: "local" };
  }
  const global = lamdaAgentFilePath(id);
  if (existsSync(global)) return { path: global, source: "global" };
  return null;
}

function agentFileMatchesDefaultSeed(
  raw: string,
  defaults: AgentConfig,
): boolean {
  const { fields, body } = parseFrontmatter(raw);
  const tools = sanitizeTools([
    ...(fields.has("tools") ? parseList(fields.get("tools")!) : defaults.tools),
    ...(fields.has("customTools") ? parseList(fields.get("customTools")!) : []),
  ]);
  return (
    (fields.has("name") ? unquote(fields.get("name")!) : defaults.label) ===
      defaults.label &&
    (fields.has("description")
      ? unquote(fields.get("description")!)
      : defaults.description) === defaults.description &&
    (parseAgentModel(unquote(fields.get("model") ?? "")) ??
      defaults.model) === defaults.model &&
    (normalizeColor(fields.get("color")) ?? defaults.color) ===
      defaults.color &&
    (fields.has("icon") ? unquote(fields.get("icon")!) : defaults.icon) ===
      defaults.icon &&
    body === defaults.systemPrompt &&
    !sameStringList(tools, defaults.tools) &&
    isKnownStaleAgentSeed(defaults.id, tools)
  );
}

function sameStringList(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function isKnownStaleAgentSeed(
  id: string,
  tools: readonly string[],
): boolean {
  if (id === "explore") {
    return sameStringList(tools, ["read", "grep", "find", "ls", "memory"]);
  }
  return false;
}

// Cache of file-loaded configs keyed by `${cwd}::${id}`, invalidated by file
// path + mtime so a manual edit to an agent file takes effect on the next
// spawn without a server restart (mirroring `getModeConfig`).
const configCache = new Map<
  string,
  { path: string; mtimeMs: number; config: AgentConfig }
>();

/**
 * The active config for an agent: the parsed agent file (frontmatter over the
 * built-in default, body as the system prompt), preferring a workspace-local
 * file over the global one, falling back to the built-in default when no file
 * exists. Each frontmatter field independently falls back to its default.
 * Returns undefined for ids that are neither built-in nor backed by a file.
 * Reads are cached and invalidated by file path + mtime.
 */
export function getAgentConfig(
  id: string,
  cwd?: string,
): AgentConfig | undefined {
  if (!isValidAgentId(id)) return undefined;
  const builtinDefault = DEFAULT_AGENT_CONFIG[id as BuiltinAgent];
  const resolved = resolveAgentFile(id, cwd);
  if (!resolved) return builtinDefault;

  const defaults = builtinDefault ?? genericDefault(id, resolved.source);
  const cacheKey = `${cwd ?? ""}::${id}`;
  try {
    const stat = statSync(resolved.path);
    const cached = configCache.get(cacheKey);
    if (
      cached &&
      cached.path === resolved.path &&
      cached.mtimeMs === stat.mtimeMs
    ) {
      return cached.config;
    }

    const { fields, body } = parseFrontmatter(
      readFileSync(resolved.path, "utf8"),
    );
    const toolsField = fields.get("tools");
    // Pre-unification files split the allowlist across `tools` (builtins) and
    // `customTools` (workspace tools); merge the latter into the single array
    // so those files keep working. The old `allowCustomTools: true` ("all
    // custom tools") has no explicit spelling anymore and is ignored.
    const customToolsField = fields.get("customTools");
    const tools = sanitizeTools([
      ...(toolsField ? parseList(toolsField) : defaults.tools),
      ...(customToolsField ? parseList(customToolsField) : []),
    ]);
    const config: AgentConfig = {
      id,
      label: fields.has("name") ? unquote(fields.get("name")!) : defaults.label,
      description: fields.has("description")
        ? unquote(fields.get("description")!)
        : defaults.description,
      systemPrompt: body.length > 0 ? body : defaults.systemPrompt,
      model:
        parseAgentModel(unquote(fields.get("model") ?? "")) ?? defaults.model,
      tools,
      color: normalizeColor(fields.get("color")) ?? defaults.color,
      icon: fields.has("icon") ? unquote(fields.get("icon")!) : defaults.icon,
      source: resolved.source,
    };
    configCache.set(cacheKey, {
      path: resolved.path,
      mtimeMs: stat.mtimeMs,
      config,
    });
    return config;
  } catch {
    return defaults;
  }
}

/**
 * Every agent visible to a workspace: the built-ins followed by any custom
 * agents found in `<cwd>/.lamda/agents` (workspace-local) and `~/.lamda/agents`
 * (global), de-duplicated by id (local wins) and sorted. Omit `cwd` to list
 * only global + built-in agents.
 */
export function listAgents(cwd?: string): AgentConfig[] {
  const ids = new Set<string>(BUILTIN_AGENTS);
  const dirs = [cwd ? lamdaLocalAgentsDir(cwd) : null, lamdaAgentsDir()];
  for (const dir of dirs) {
    if (!dir) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const id = name.slice(0, -3);
      if (isValidAgentId(id)) ids.add(id);
    }
  }

  const builtins = BUILTIN_AGENTS.filter((id) => ids.has(id));
  const custom = [...ids]
    .filter((id) => !(BUILTIN_AGENTS as readonly string[]).includes(id))
    .sort();
  return [...builtins, ...custom]
    .map((id) => getAgentConfig(id, cwd))
    .filter((config): config is AgentConfig => config !== undefined);
}

/**
 * Seed each built-in agent's default definition into `~/.lamda/agents/<id>.md`
 * when that file doesn't yet exist, so agents are discoverable and editable on
 * disk. Existing built-in files are refreshed only when they still look like an
 * auto-generated seed (same metadata + body), so stale tool allowlists are
 * upgraded while user-edited definitions still win.
 * Best-effort: any filesystem failure is swallowed so a read-only home dir
 * can't break startup. Call once at server startup.
 */
export function ensureAgentFiles(): void {
  try {
    mkdirSync(lamdaAgentsDir(), { recursive: true });
  } catch {
    return;
  }
  for (const id of BUILTIN_AGENTS) {
    const path = lamdaAgentFilePath(id);
    const defaults = DEFAULT_AGENT_CONFIG[id];
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf8");
        if (!agentFileMatchesDefaultSeed(raw, defaults)) continue;
      }
      writeFileSync(path, serializeAgentFile(defaults), "utf8");
    } catch {
      // Seeding is best-effort; the in-memory default still applies.
    }
  }
}
