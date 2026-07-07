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
export const TASK_TOOL_NAME = "task";

/**
 * Built-in tool names a subagent may be granted. Deliberately narrower than
 * `BUILTIN_TOOL_NAMES`: `todo` and `plan` are thread-bound UI features, and
 * `question` would block a headless run on user input that can never arrive.
 * The `task` tool itself is never granted, so subagents cannot spawn subagents.
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
   * Surfaced to the model in the task tool's description, so it should say
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
  /** Built-in tool names the subagent may use (frontmatter `tools`). */
  tools: readonly string[];
  /** Named accent color for the agent's chip/icon (frontmatter `color`). */
  color: string;
  /** Named lucide icon for the agent (frontmatter `icon`); see web registry. */
  icon: string;
  /** Resolved origin of this config (not persisted; computed at read time). */
  source: AgentSource;
}

/** The subagents lamda ships with, in canonical display order. */
export const BUILTIN_AGENTS = ["general", "explore"] as const;

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
  "include everything the caller needs, because your intermediate work is not shown to them.";

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
      "General-purpose agent for multi-step tasks: researching complex questions, making scoped code changes, and running commands. Use when the work needs several tools or edits.",
    systemPrompt:
      "You are a capable software engineering agent completing a delegated task end to end.\n\n" +
      "- Understand before changing: read the relevant code and trace the actual cause; fix root causes, not symptoms.\n" +
      "- Make the smallest change that fully solves the problem; don't refactor or reformat unrelated code.\n" +
      "- Verify your work with the narrowest relevant check (the failing test, the changed file's type-check) before finishing.\n" +
      "- If the task is ambiguous, pick the most reasonable interpretation, state the assumption in your report, and proceed.\n\n" +
      SUBAGENT_GROUND_RULES,
    tools: SUBAGENT_TOOL_NAMES,
    color: "emerald",
    icon: "bot",
    source: "builtin",
  },
  explore: {
    id: "explore",
    label: "Explore",
    description:
      "Read-only codebase scout for searches and \"where/how is X done\" questions. Fast and safe: it can read and search but never modifies anything.",
    systemPrompt:
      "You are a read-only exploration agent. Investigate the codebase to answer the question you were given.\n\n" +
      "- Ground every claim in code you actually read; cite concrete locations as `path/to/file.ts:line`.\n" +
      "- Fire independent searches in parallel; read excerpts rather than whole files when possible.\n" +
      "- Separate fact from inference: flag deductions with \"likely\"/\"appears\" — never present a guess as verified.\n" +
      "- You cannot modify anything; if the task asks for changes, report what you found and what you would change instead.\n\n" +
      SUBAGENT_GROUND_RULES,
    tools: ["read", "grep", "find", "ls"],
    color: "teal",
    icon: "telescope",
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

/** Keep only tool names a subagent is allowed to hold. */
function sanitizeTools(tools: readonly string[]): string[] {
  const allowed = new Set<string>(SUBAGENT_TOOL_NAMES);
  return tools.filter((name) => allowed.has(name));
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
  lines.push(
    `tools: [${config.tools.join(", ")}]`,
    `color: ${config.color}`,
    `icon: ${config.icon}`,
    "---",
    "",
    config.systemPrompt,
    "",
  );
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
    tools: SUBAGENT_TOOL_NAMES,
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
    const config: AgentConfig = {
      id,
      label: fields.has("name") ? unquote(fields.get("name")!) : defaults.label,
      description: fields.has("description")
        ? unquote(fields.get("description")!)
        : defaults.description,
      systemPrompt: body.length > 0 ? body : defaults.systemPrompt,
      model:
        parseAgentModel(unquote(fields.get("model") ?? "")) ?? defaults.model,
      tools: toolsField ? sanitizeTools(parseList(toolsField)) : defaults.tools,
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
 * disk. Existing files are never overwritten — user edits always win.
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
    if (existsSync(path)) continue;
    try {
      writeFileSync(path, serializeAgentFile(DEFAULT_AGENT_CONFIG[id]), "utf8");
    } catch {
      // Seeding is best-effort; the in-memory default still applies.
    }
  }
}
