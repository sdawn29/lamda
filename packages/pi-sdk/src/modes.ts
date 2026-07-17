import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseFrontmatter, parseList, unquote } from "./frontmatter.js";
import {
  lamdaLocalModesDir,
  lamdaModeFilePath,
  lamdaModesDir,
} from "./lamda-paths.js";
import { expandToolAllowlist } from "./tool-allowlist.js";

/**
 * A mode id. The three built-ins (`ask`, `plan`, `agent`) always exist; any
 * other value is a custom mode defined by a file in `~/.lamda/modes` (global) or
 * `<cwd>/.lamda/modes` (workspace-local). Kept as `string` rather than a closed
 * union so user-defined modes flow through the same code paths.
 */
export type Mode = string;

/** The three modes lamda ships with, in canonical display order. */
export const BUILTIN_MODES = ["ask", "plan", "agent"] as const;

export type BuiltinMode = (typeof BUILTIN_MODES)[number];

/** Back-compat alias for the built-in mode list. */
export const MODES: readonly Mode[] = BUILTIN_MODES;

/** Workspace-relative directory where plan-mode artifacts are saved. */
export const PLAN_DIR = ".lamda/plans";

/** Whether `value` is one of the three built-in modes. */
export function isMode(value: unknown): value is BuiltinMode {
  return value === "ask" || value === "plan" || value === "agent";
}

/** Valid mode-id shape: kebab/alphanumeric, matching how files on disk are named. */
export function isValidModeId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

/**
 * Coerce an arbitrary stored value into a mode id. Maps the legacy `code` alias
 * to `agent` and accepts any well-formed mode id (built-in or custom); returns
 * `undefined` for empty/malformed values so callers can fall back to a default.
 * Existence of a custom mode's file is validated separately (see `listModes`),
 * since this is sync and has no workspace context.
 */
export function normalizeMode(value: unknown): Mode | undefined {
  if (value === "code") return "agent";
  if (typeof value === "string" && isValidModeId(value)) return value;
  return undefined;
}

// Built-in tool names the agent ships with. Anything outside this list is a
// custom (host/MCP/LSP/extension) tool; both kinds are allowlisted together in
// a mode's single `tools` array.
export const BUILTIN_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "plan",
  "todo",
  "grep",
  "find",
  "ls",
] as const;

/**
 * Where a resolved mode came from: a built-in default (no file on disk), a
 * workspace-local file, or the global `~/.lamda/modes` directory.
 */
export type ModeSource = "builtin" | "local" | "global";

export interface ModeConfig {
  /** Mode id — the file's basename (or one of the built-ins). */
  id: string;
  /** Display name shown in the mode picker (frontmatter `name`). */
  label: string;
  /** One-line summary of the mode (frontmatter `description`). */
  description: string;
  /**
   * Prompt prepended to user text before it reaches the SDK — the body of the
   * mode's markdown file (everything after the frontmatter).
   */
  preamble: string;
  /**
   * The complete tool allowlist for this mode (frontmatter `tools`) — one flat
   * array of tool names, mixing builtins (`read`, `bash`, …), host tools
   * (`question`, `memory`, `delegate`, …), and workspace custom tools (MCP,
   * LSP, GitHub) alike. Only listed names are active; everything else is
   * disabled while the mode is selected.
   */
  tools: readonly string[];
  /**
   * Subagent ids the `delegate` tool may launch in this mode (frontmatter
   * `agents`). `null` (field omitted) means every available agent. Modes
   * without `edit`/`write`/`bash` should restrict this to read-only agents —
   * delegating to an agent with shell access would bypass the mode's own
   * tool boundary.
   */
  agents: readonly string[] | null;
  /**
   * Named accent color for the mode's chip/icon in the picker (frontmatter
   * `color`). One of {@link MODE_COLORS}; the web maps it to concrete classes.
   */
  color: string;
  /** Named icon for the mode in the picker (frontmatter `icon`); see web registry. */
  icon: string;
  /** Resolved origin of this config (not persisted; computed at read time). */
  source: ModeSource;
}

/** Accent colors a mode may declare via frontmatter `color`. */
export const MODE_COLORS = [
  "sky",
  "amber",
  "emerald",
  "violet",
  "rose",
  "blue",
  "teal",
  "orange",
  "fuchsia",
  "slate",
] as const;

/** Fallback color for custom modes that omit `color`. */
const DEFAULT_MODE_COLOR = "violet";
/** Fallback icon for custom modes that omit `icon`. */
const DEFAULT_MODE_ICON = "sparkles";

/** Previous built-in prompt fingerprints, used only to migrate untouched seeds. */
const LEGACY_MODE_PROMPT_HASHES: Partial<
  Record<BuiltinMode, readonly string[]>
> = {
  ask: ["eca806b7bf8b19a9fc3b596f6fea8cee7ae2be412a8109348e486df6149c61c7"],
  plan: ["a214bfe622898c3e04e984eaf26ec9398c488967e2316005393147c3530bcf8e"],
  agent: ["4574f507522b38a49d6d43adee27dee25566e73011c2510d5bafca9392147413"],
};

// Fixed names of server-registered git-host tools, so the built-in modes can
// allowlist them explicitly (MCP tool names are workspace-specific and can't
// be listed here — add them to a mode file by name to enable them).
const GIT_HOST_READ_TOOLS = [
  "github_list_prs",
  "github_get_pr",
  "github_list_issues",
  "github_get_issue",
  "github_checks",
  "gitlab_list_mrs",
  "gitlab_get_mr",
  "gitlab_list_issues",
  "gitlab_get_issue",
  "gitlab_pipelines",
] as const;

const GIT_HOST_WRITE_TOOLS = [
  "github_create_pr",
  "github_comment_issue",
  "gitlab_create_mr",
  "gitlab_comment_issue",
  "gitlab_comment_mr",
] as const;

/**
 * Built-in defaults for each mode. These seed `~/.lamda/modes/<mode>.md` on
 * first run and act as the fallback for any field a file omits (or when the file
 * is missing/unreadable). Once a file exists, its frontmatter + body take
 * precedence — see `getModeConfig`.
 */
const DEFAULT_MODE_CONFIG: Record<BuiltinMode, ModeConfig> = {
  ask: {
    id: "ask",
    color: "sky",
    icon: "message-circle-question",
    source: "builtin",
    label: "Ask",
    description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
    preamble:
      '<active_mode name="ask">\n' +
      "Ask mode is read-only. Answer questions from inspected evidence; do not modify files, run shell commands, or change external state.\n\n" +
      "- Start with the direct answer the user needs, then gather only the evidence required to support it.\n" +
      "- Use workspace search/read/LSP for code facts, git-host tools for repository history, and primary documentation for external behavior. Match documentation to the versions actually present in the workspace.\n" +
      "- Trace definitions, call sites, state transitions, and edge cases when the question is about behavior; do not infer behavior from names alone.\n" +
      "- For broad, separable reconnaissance, delegate read-only exploration or research and synthesize the results. Honor an explicit permitted agent mention.\n" +
      "- Cite the smallest useful evidence with concrete file locations or source URLs. Clearly label uncertainty and inference.\n" +
      "- Ask a question only when materially different interpretations would produce different answers; otherwise state the assumption and continue.\n" +
      "- If the user requests a change, explain the recommended change and affected areas, then tell them implementation requires Agent mode. Never imply that a change was applied.\n" +
      "</active_mode>",
    tools: [
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
      ...GIT_HOST_READ_TOOLS,
    ],
    agents: ["explore", "research", "reviewer"],
  },
  plan: {
    id: "plan",
    color: "amber",
    icon: "list-todo",
    source: "builtin",
    label: "Plan",
    description:
      "Research and propose a plan. Saves the plan to .lamda/plans/.",
    preamble:
      '<active_mode name="plan">\n' +
      "Plan mode produces one implementation-ready plan under `.lamda/plans/`. Investigate and decide; do not implement. The plan artifact is the only state you may change.\n\n" +
      "1. Define the outcome, constraints, and definition of done from the request. Ask once, before planning, only if a missing user decision would materially alter the design.\n" +
      "2. Inspect the real system: applicable instructions, architecture, relevant symbols and call sites, data flow, existing tests, configuration, and dependency versions. Use read-only agents in parallel for independent codebase or external research; do not duplicate their work without a verification reason.\n" +
      "3. Resolve the design. Compare genuinely viable approaches against correctness, compatibility, complexity, migration cost, and operability, then recommend one. Do not leave core design choices to the implementer.\n" +
      "4. Write a plan scaled to the task. Every implementation step must name the file/module and symbol or surface, describe the exact behavioral change, note dependencies on earlier steps, and state how that step is verified. Avoid vague verbs and speculative cleanup.\n\n" +
      "The plan must include:\n" +
      "- problem statement, goals, non-goals, and evidence-backed current state;\n" +
      "- chosen design and any important rejected alternative;\n" +
      "- ordered implementation steps, including schema/API/type changes and migration or compatibility work where relevant;\n" +
      "- failure modes, security/privacy concerns, edge cases, rollout or rollback considerations when applicable;\n" +
      "- exact automated and manual validation, plus a measurable definition of done.\n\n" +
      "End with `## Todos` as the final section: an ordered GitHub checklist whose items are independently executable and collectively complete. Save via the `plan` tool, then reply with a brief recommendation and unresolved blocker, if any. Stop without implementing.\n" +
      "</active_mode>",
    tools: [
      "read",
      "grep",
      "find",
      "ls",
      "plan",
      "question",
      "memory",
      "delegate",
      "lsp",
      "web_fetch",
      "semantic_search",
      ...GIT_HOST_READ_TOOLS,
    ],
    agents: ["explore", "research", "reviewer"],
  },
  agent: {
    id: "agent",
    color: "emerald",
    icon: "bot",
    source: "builtin",
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      '<active_mode name="agent">\n' +
      "Agent mode is execution mode. Own the requested engineering outcome: diagnose, implement, validate, and leave the workspace coherent.\n\n" +
      "1. Orient: read applicable instructions, inspect relevant user changes and git state, trace the actual behavior, and review an existing task plan if one applies.\n" +
      "2. Frame the change: identify the root cause, invariants, affected interfaces, risks, and the smallest complete solution. Use `todo` for substantial work and keep it synchronized with reality.\n" +
      "3. Execute: make cohesive changes in dependency order. Preserve compatibility unless the request authorizes a break. Update tests, types, docs, migrations, and generated artifacts only when the behavior requires them.\n" +
      "4. Validate: inspect the diff and call sites, run the narrowest meaningful checks first, then broader checks proportional to blast radius. Exercise the changed UI or workflow when practical. A passing command is evidence only for what it covers.\n" +
      "5. Deliver: close every todo, state the outcome first, summarize material changes and verification, and identify only genuine residual risk or blocked validation.\n\n" +
      "Delegate when work is independent and self-contained; keep core decisions and tightly coupled edits local. Honor explicit permitted agent mentions. If delegated work changes files, inspect its diff and validate integration yourself.\n\n" +
      "Ask before coding only when a consequential choice belongs to the user. Otherwise make the safest reversible assumption and proceed. If blocked, preserve a buildable/coherent state and report the exact blocker—never silently narrow the request or declare partial work complete.\n" +
      "</active_mode>",
    tools: [
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
      ...GIT_HOST_READ_TOOLS,
      ...GIT_HOST_WRITE_TOOLS,
    ],
    agents: null,
  },
};

// --- Mode file format: YAML-ish frontmatter + markdown body ----------------
//
//   ---
//   name: Ask
//   description: Read-only Q&A. Cannot edit, write, or run shell commands.
//   tools: [read, grep, find, ls, question, memory, delegate]
//   agents: [explore]
//   ---
//
//   Ask mode — read-only Q&A about this codebase. ...
//
// `tools` is the mode's complete allowlist — builtins, host tools, and
// workspace custom tools (MCP/LSP/git-host) all by name in one array.
// `agents` limits which subagents `delegate` may launch; omit it to allow all.
// The frontmatter carries the mode's metadata; the body is the preamble. The
// shared parser in `frontmatter.ts` handles the block; this maps its raw
// fields onto the mode config shape.

interface ParsedModeFile {
  frontmatter: Partial<Omit<ModeConfig, "preamble">>;
  body: string;
}

function parseModeFile(raw: string): ParsedModeFile {
  const { fields, body } = parseFrontmatter(raw);
  const frontmatter: ParsedModeFile["frontmatter"] = {};
  for (const [key, value] of fields) {
    if (key === "name") frontmatter.label = unquote(value);
    else if (key === "description") frontmatter.description = unquote(value);
    else if (key === "tools") frontmatter.tools = parseList(value);
    else if (key === "agents") frontmatter.agents = parseList(value);
    else if (key === "color") frontmatter.color = unquote(value);
    else if (key === "icon") frontmatter.icon = unquote(value);
    // Pre-unification files carried `allowCustomTools`; there is no "all
    // custom tools" spelling anymore, so the field is intentionally ignored —
    // delete the mode file to re-seed it in the current format.
  }
  return { frontmatter, body };
}

/** Normalize a frontmatter color to a known palette entry, or undefined. */
function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return (MODE_COLORS as readonly string[]).includes(lower) ? lower : undefined;
}

/** Render a mode config as the on-disk file: frontmatter block + preamble body. */
export function serializeModeFile(
  config: Omit<ModeConfig, "id" | "source">,
): string {
  const lines = [
    "---",
    `name: ${config.label}`,
    `description: ${config.description}`,
    `tools: [${config.tools.join(", ")}]`,
  ];
  if (config.agents !== null) {
    lines.push(`agents: [${config.agents.join(", ")}]`);
  }
  lines.push(`color: ${config.color}`, `icon: ${config.icon}`, "---", "");
  lines.push(config.preamble, "");
  return lines.join("\n");
}

/**
 * Fallback config for a mode with no built-in default — i.e. a custom mode whose
 * file omits some fields. Defaults to the Agent toolset so a bare custom file is
 * usable, with a distinct color/icon so it reads as custom in the picker.
 */
function genericDefault(mode: Mode, source: ModeSource): ModeConfig {
  const agent = DEFAULT_MODE_CONFIG.agent;
  return {
    id: mode,
    label: mode.charAt(0).toUpperCase() + mode.slice(1),
    description: "",
    preamble: "",
    tools: agent.tools,
    agents: null,
    color: DEFAULT_MODE_COLOR,
    icon: DEFAULT_MODE_ICON,
    source,
  };
}

/**
 * Resolve a mode's file path, preferring a workspace-local
 * `<cwd>/.lamda/modes/<mode>.md` over the global `~/.lamda/modes/<mode>.md`.
 * Returns the path and its source, or null when neither file exists.
 */
function resolveModeFile(
  mode: Mode,
  cwd?: string,
): { path: string; source: ModeSource } | null {
  if (cwd) {
    const local = join(lamdaLocalModesDir(cwd), `${mode}.md`);
    if (existsSync(local)) return { path: local, source: "local" };
  }
  const global = lamdaModeFilePath(mode);
  if (existsSync(global)) return { path: global, source: "global" };
  return null;
}

function modeFileMatchesDefaultSeed(
  raw: string,
  defaults: ModeConfig,
): boolean {
  const { frontmatter, body } = parseModeFile(raw);
  const tools = frontmatter.tools ?? defaults.tools;
  const agents = frontmatter.agents ?? defaults.agents;
  const promptHash = createHash("sha256").update(body).digest("hex");
  const knownPrompt =
    body === defaults.preamble ||
    (LEGACY_MODE_PROMPT_HASHES[defaults.id as BuiltinMode]?.includes(
      promptHash,
    ) ??
      false);
  const knownConfig =
    (sameStringList(tools, defaults.tools) &&
      sameStringList(agents, defaults.agents)) ||
    isPreviousDefaultModeConfig(defaults.id, tools, agents) ||
    isKnownStaleModeSeed(defaults.id, tools, agents);
  return (
    (frontmatter.label ?? defaults.label) === defaults.label &&
    (frontmatter.description ?? defaults.description) ===
      defaults.description &&
    (frontmatter.color ?? defaults.color) === defaults.color &&
    (frontmatter.icon ?? defaults.icon) === defaults.icon &&
    knownPrompt &&
    knownConfig
  );
}

function isPreviousDefaultModeConfig(
  mode: string,
  tools: readonly string[],
  agents: readonly string[] | null,
): boolean {
  const current = DEFAULT_MODE_CONFIG[mode as BuiltinMode];
  if (!current) return false;
  if (mode === "ask") {
    return (
      sameStringList(tools, current.tools) &&
      sameStringList(agents, ["explore"])
    );
  }
  if (mode === "plan") {
    const previousTools = [...current.tools];
    previousTools.splice(4, 0, "bash");
    return (
      sameStringList(tools, previousTools) &&
      sameStringList(agents, ["explore", "research"])
    );
  }
  return (
    mode === "agent" && sameStringList(tools, current.tools) && agents === null
  );
}

function sameStringList(
  actual: readonly string[] | null,
  expected: readonly string[] | null,
): boolean {
  if (actual === null || expected === null) return actual === expected;
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function isKnownStaleModeSeed(
  mode: string,
  tools: readonly string[],
  agents: readonly string[] | null,
): boolean {
  if (mode === "ask") {
    return (
      sameStringList(tools, [
        "read",
        "grep",
        "find",
        "ls",
        "question",
        "memory",
        "delegate",
      ]) && sameStringList(agents, ["explore"])
    );
  }
  if (mode === "plan") {
    return (
      sameStringList(tools, [
        "read",
        "grep",
        "find",
        "ls",
        "bash",
        "plan",
        "question",
        "memory",
        "delegate",
      ]) && sameStringList(agents, ["explore"])
    );
  }
  if (mode === "agent") {
    return (
      sameStringList(tools, [
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
      ]) && agents === null
    );
  }
  return false;
}

// Cache of file-loaded configs keyed by `${cwd}::${mode}`, invalidated by file
// path + mtime so a manual edit to a mode file takes effect on the next turn
// without a server restart (mirroring how `.lamda/tool-approvals.json` is
// re-read).
const configCache = new Map<
  string,
  { path: string; mtimeMs: number; config: ModeConfig }
>();

/**
 * The active config for a mode: the parsed mode file (frontmatter over the
 * built-in default, body as the preamble), preferring a workspace-local file
 * (`<cwd>/.lamda/modes/<mode>.md`) over the global one, falling back to the
 * built-in default when no file exists. Each frontmatter field independently
 * falls back to its default when absent, so a file may override only the prompt
 * and keep the default tool allowlist (or vice versa). Reads are cached and
 * invalidated by file path + mtime.
 */
export function getModeConfig(mode: Mode, cwd?: string): ModeConfig {
  const builtinDefault = DEFAULT_MODE_CONFIG[mode as BuiltinMode];
  const resolved = resolveModeFile(mode, cwd);
  if (!resolved) {
    return builtinDefault ?? genericDefault(mode, "builtin");
  }

  const defaults = builtinDefault ?? genericDefault(mode, resolved.source);
  const cacheKey = `${cwd ?? ""}::${mode}`;
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

    const { frontmatter, body } = parseModeFile(
      readFileSync(resolved.path, "utf8"),
    );
    const config: ModeConfig = {
      id: mode,
      label: frontmatter.label ?? defaults.label,
      description: frontmatter.description ?? defaults.description,
      preamble: body.length > 0 ? body : defaults.preamble,
      tools: frontmatter.tools ?? defaults.tools,
      agents: frontmatter.agents ?? defaults.agents,
      color: normalizeColor(frontmatter.color) ?? defaults.color,
      icon: frontmatter.icon ?? defaults.icon,
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
 * Every mode visible to a workspace: the three built-ins followed by any custom
 * modes found in `<cwd>/.lamda/modes` (workspace-local) and `~/.lamda/modes`
 * (global), de-duplicated by id (local wins) and sorted by label. Omit `cwd` to
 * list only global + built-in modes. Each entry is resolved through
 * {@link getModeConfig}, so local files override globals of the same id.
 */
export function listModes(cwd?: string): ModeConfig[] {
  const ids = new Set<string>(BUILTIN_MODES);
  const dirs = [cwd ? lamdaLocalModesDir(cwd) : null, lamdaModesDir()];
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
      if (isValidModeId(id)) ids.add(id);
    }
  }

  const builtins = BUILTIN_MODES.filter((id) => ids.has(id));
  const custom = [...ids]
    .filter((id) => !(BUILTIN_MODES as readonly string[]).includes(id))
    .sort();
  return [...builtins, ...custom].map((id) => getModeConfig(id, cwd));
}

/**
 * Seed each built-in mode's default definition into `~/.lamda/modes/<mode>.md`
 * when that file doesn't yet exist, so modes are discoverable and editable on
 * disk. Existing built-in files are refreshed only when they still look like an
 * auto-generated seed (same metadata + body), so stale tool allowlists are
 * upgraded while user-edited definitions still win.
 * Best-effort: any filesystem failure is swallowed so a read-only home dir can't
 * break startup. Call once at server startup.
 */
export function ensureModeFiles(): void {
  try {
    mkdirSync(lamdaModesDir(), { recursive: true });
  } catch {
    return;
  }
  for (const mode of BUILTIN_MODES) {
    const path = lamdaModeFilePath(mode);
    const defaults = DEFAULT_MODE_CONFIG[mode];
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf8");
        if (!modeFileMatchesDefaultSeed(raw, defaults)) continue;
      }
      writeFileSync(path, serializeModeFile(defaults), "utf8");
    } catch {
      // Seeding is best-effort; the in-memory default still applies.
    }
  }
}

export function getModePreamble(mode: Mode, cwd?: string): string {
  return getModeConfig(mode, cwd).preamble;
}

/** Separator inserted between an injected mode preamble and the user's text. */
const PREAMBLE_SEPARATOR = "\n\n";

/**
 * Prepend a mode's preamble to user text before it is sent to the SDK. The SDK
 * persists the combined string into the conversation it replays to the model.
 */
export function applyModePreamble(
  mode: Mode,
  userText: string,
  cwd?: string,
): string {
  return `${getModePreamble(mode, cwd)}${PREAMBLE_SEPARATOR}${userText}`;
}

/**
 * Inverse of `applyModePreamble`: strip a leading mode preamble if the text
 * begins with one. Used when reconstructing the original user text from
 * persisted session history (e.g. seeding a forked thread's DB blocks), where
 * the preamble is baked into the stored message. Returns the text unchanged if
 * it doesn't start with a known preamble.
 *
 * Tries both the current on-disk preamble and the built-in default for each
 * available mode, so text stored under an earlier (or since-edited) mode file
 * still strips cleanly. Pass `cwd` to also consider workspace-local custom modes.
 */
export function stripModePreamble(text: string, cwd?: string): string {
  return createModePreambleStripper(cwd)(text);
}

/**
 * Build a reusable preamble-stripper for `cwd`, collecting the candidate
 * preambles (current on-disk + built-in defaults) once. Prefer this over calling
 * {@link stripModePreamble} in a loop — e.g. stripping every user block of a
 * forked thread — so the directory scan and file reads happen a single time
 * rather than per call. See {@link stripModePreamble} for the matching rules.
 */
export function createModePreambleStripper(
  cwd?: string,
): (text: string) => string {
  const preambles = new Set<string>();
  for (const config of listModes(cwd)) preambles.add(config.preamble);
  for (const mode of BUILTIN_MODES)
    preambles.add(DEFAULT_MODE_CONFIG[mode].preamble);
  const prefixes = [...preambles]
    .filter((preamble) => preamble.length > 0)
    .map((preamble) => preamble + PREAMBLE_SEPARATOR);
  return (text) => {
    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) return text.slice(prefix.length);
    }
    return text;
  };
}

/**
 * The active tool list a mode prescribes: the names in its `tools` allowlist,
 * with `*`-suffixed prefix globs (e.g. `mcp__github__*`) expanded against
 * `availableTools` when provided. Exact names that aren't registered in the
 * session are ignored by the SDK when applied, so the list can safely include
 * tools a given workspace doesn't have (e.g. git-host tools in a non-GitHub
 * repo).
 */
export function computeActiveToolsForMode(
  mode: Mode,
  cwd?: string,
  availableTools?: readonly string[],
): string[] {
  const tools = getModeConfig(mode, cwd).tools;
  return availableTools
    ? expandToolAllowlist(tools, availableTools)
    : [...new Set(tools)];
}
