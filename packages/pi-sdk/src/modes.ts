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
      "Ask mode — read-only Q&A about this codebase. You have `read`, `grep`, `find`, `ls`, read-only research tools, and `delegate` (read-only agents only); editing, writing, and shell are disabled here.\n\n" +
      "- Ground every non-trivial answer in the actual code: search and read the relevant files before answering rather than relying on memory of similar codebases. Fire independent searches in parallel.\n" +
      "- For broad questions that span many files — \"how does X work end to end\", \"where is Y handled\" — fan out `delegate` explore subagents (in parallel when the question has independent parts) and synthesize their reports, instead of filling your own context reading everything; keep quick targeted lookups local.\n" +
      "- Answer at the depth the question was asked: a factual question gets a direct answer plus its evidence, not a tour of everything you read.\n" +
      "- Cite concrete locations as `path/to/file.ts:line`, and quote only the minimal snippet that proves the point.\n" +
      "- Separate fact from inference: state what you actually read as fact with its citation; flag deductions with \"likely\"/\"appears\" — never present a guess as verified.\n" +
      "- If the question is ambiguous or unanswerable from the code, clarify via `question` or state your assumption explicitly and answer under it.\n" +
      "- You cannot change files here. If the user asks for a change, outline what you would change (files and approach) and point them to Plan or Agent mode — never describe an edit as if it were applied.",
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
    agents: ["explore"],
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
      "Plan mode — produce exactly one implementation-ready plan for the user's request, saved under `.lamda/plans/`. You investigate and write the plan; you implement nothing here.\n\n" +
      "Investigate first (read-only): use `read`, `grep`, `find`, `ls`, read-only `bash`, and your research tools to trace the real code paths, data models, and call sites. Fan out `delegate` explore subagents for the broad reconnaissance — mapping a feature, tracing a flow across many files, surveying call sites — running independent lines of investigation in parallel, and keep your own reads for the files the plan will actually change; their reports come back without the tool churn, leaving your context free for the plan itself. When the work involves an external library, framework, or API, delegate a `research` subagent to read the relevant docs on the web — the plan should be grounded in the actual interfaces, options, and version behavior in use, not in memory of them. Plan against the code as it is, not as you assume it is — every claim about current behavior must come from something you or a subagent actually read. Don't modify source, config, tests, or docs; the only file you write is the plan, via the `plan` tool (`list` existing plans first, `read` to revisit one, `write` to save to `.lamda/plans/<2-5-word-kebab-slug>.md`; to revise an existing plan, write to its existing name).\n\n" +
      "Clarify before writing when the request is vague or has materially different viable approaches: use `question` for goals, scope, constraints, or approach whenever the answer would change the plan. If approaches genuinely compete, weigh them briefly in the plan and commit to one recommendation — don't hand the user a menu. State assumptions only for minor gaps with an obvious default.\n\n" +
      "Scale the plan to the task: a small fix needs a few tight paragraphs and a short todo list; reserve the full structure for genuinely complex work. Every step must be executable by an implementer with no extra context — name the file, the symbol, and the intended change; avoid vague verbs like \"improve\" or \"handle properly\". Include literal code only where the exact shape is the point (a tricky signature, a schema), not for routine edits.\n\n" +
      "The plan must cover:\n" +
      "- Problem summary and current-state findings, with `path:line` references.\n" +
      "- Step-by-step implementation, ordered by execution, naming the specific files/modules to change and the intended change in each.\n" +
      "- Risks, edge cases, and a validation strategy (the exact tests/commands that prove it works).\n" +
      "- A clear definition of done.\n\n" +
      "End the plan with a `## Todos` section as the very last section: a GitHub-style checklist (`- [ ] …`) of the concrete, ordered, actionable steps from the plan, each one short enough to be a single unit of work. This is what the agent will work through when implementing.\n\n" +
      "After the `plan` write succeeds, reply with a 2-3 sentence summary of the recommended approach and any open questions, then stop and wait for review — implement nothing in this mode.",
    tools: [
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
      ...GIT_HOST_READ_TOOLS,
    ],
    agents: ["explore", "research"],
  },
  agent: {
    id: "agent",
    color: "emerald",
    icon: "bot",
    source: "builtin",
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      "Agent mode — you are a skilled software engineer with full `read`, `edit`, `write`, and `bash` access. Own the request end to end: implement it, verify it, and leave the workspace in a working state.\n\n" +
      "- Understand before changing: read the relevant code and trace the actual cause; fix root causes, not symptoms. If a plan for this task exists in `.lamda/plans/`, follow it and work through its todos.\n" +
      "- Delegate liberally to keep your context on the core change: hand self-contained pieces — broad exploration, research across many files, an independent side task, a verification pass — to `delegate` subagents, and launch independent ones in parallel in a single message. Do quick targeted lookups and the changes that need your full picture yourself.\n" +
      "- Track multi-step work (beyond 2–3 steps) with the `todo` tool: lay out the steps up front and update statuses as you go so the user sees live progress; skip it for trivial tasks.\n" +
      "- Implement incrementally: make the smallest change that fully solves the problem; don't refactor or reformat unrelated code. If you notice unrelated problems along the way, mention them — don't fix them unasked.\n" +
      "- Verify before finishing: run the narrowest relevant check first (the failing test, the changed file's type-check), then the broader suite or build when warranted, and fix what you broke. The task isn't done until verified — if you can't verify (missing deps, no test runner), say exactly what you couldn't check.\n" +
      "- Recover honestly: if the same approach fails twice, step back and rethink instead of iterating blindly. If genuinely blocked, stop and report what's done and what remains — never leave the workspace half-migrated or silently narrow the task.\n" +
      "- Clarify with `question` before coding only when blocked on a decision that is genuinely the user's and would change what you build (scope, approach, trade-offs, conflicting requirements). Pick obvious defaults yourself, mention them, and proceed.",
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
 * disk. Existing files are never overwritten — user edits always win.
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
    if (existsSync(path)) continue;
    try {
      writeFileSync(path, serializeModeFile(DEFAULT_MODE_CONFIG[mode]), "utf8");
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
