import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  lamdaLocalModesDir,
  lamdaModeFilePath,
  lamdaModesDir,
} from "./lamda-paths.js";
import { QUESTION_TOOL_NAME } from "./question-tool.js";

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
function isValidModeId(value: string): boolean {
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

// Built-in tool names the agent ships with. Used to compute which to keep active
// per mode — anything not in this list is treated as a custom (MCP/LSP/extension)
// tool and left alone.
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
  /** Built-in tool names active in this mode (frontmatter `tools`). */
  allowedBuiltins: readonly string[];
  /**
   * Whether non-builtin tools (MCP/LSP/extensions) remain active in this mode
   * (frontmatter `allowCustomTools`).
   */
  allowCustomTools: boolean;
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
      "Ask mode — read-only Q&A about this codebase. You have `read`, `grep`, `find`, `ls`, and any available custom tools (memory, LSP, MCP); editing, writing, and shell are disabled here.\n\n" +
      "- Ground every non-trivial answer in the actual code: search and read the relevant files before answering rather than relying on memory.\n" +
      "- Cite concrete locations as `path/to/file.ts:line`.\n" +
      "- Lead with the answer, then the supporting evidence.\n" +
      "- If the question is ambiguous or unanswerable from the code, clarify via `question` or state your assumption explicitly.\n" +
      "- Don't describe edits as if you're applying them; if the user wants a change made, point them to Plan or Agent mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: true,
  },
  plan: {
    id: "plan",
    color: "amber",
    icon: "list-todo",
    source: "builtin",
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .lamda/plans/.",
    preamble:
      "Plan mode — produce exactly one implementation-ready plan for the user's request, saved under `.lamda/plans/`.\n\n" +
      "Investigate first (read-only): use `read`, `grep`, `find`, `ls`, read-only `bash`, and any available custom tools (memory, LSP, MCP) to trace the real code paths, data models, and call sites. Plan against the code, not assumptions. Use the `plan` tool to manage plans: `plan` with operation `list` to see existing plans, `read` to revisit one, and `write` to save. Don't modify source, config, tests, or docs — the only file you write is the plan, via `plan` (operation `write`), at `.lamda/plans/<2-5-word-kebab-slug>.md`. To revise an existing plan, write to its existing name.\n\n" +
      "Clarify before writing when the request is vague or could be approached in materially different ways: use `question` for goals, scope, constraints, or approach whenever the answer would change the plan. State assumptions only for minor gaps with an obvious default.\n\n" +
      "The plan must cover:\n" +
      "- Problem summary and current-state findings, with `path:line` references.\n" +
      "- Step-by-step implementation, ordered by execution.\n" +
      "- The specific files/modules to change and the intended change in each.\n" +
      "- Risks, edge cases, and a validation strategy (the tests/commands that prove it works).\n" +
      "- A clear definition of done.\n\n" +
      "End the plan with a `## Todos` section as the very last section: a GitHub-style checklist (`- [ ] …`) of the concrete, ordered, actionable steps from the plan, each one short enough to be a single unit of work. This is what the agent will work through when implementing.\n\n" +
      "After the `plan` write succeeds, stop and wait for review — implement nothing in this mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "plan", QUESTION_TOOL_NAME],
    allowCustomTools: true,
  },
  agent: {
    id: "agent",
    color: "emerald",
    icon: "bot",
    source: "builtin",
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      "Agent mode — you are a skilled software engineer with full `read`, `edit`, `write`, and `bash` access. Implement the request end to end and leave the workspace in a working state.\n\n" +
      "- Match the codebase: read enough of the surrounding files to follow existing conventions, naming, and patterns before changing anything. Make the smallest change that fully solves the problem; don't refactor or reformat unrelated code.\n" +
      "- Verify before finishing: run the relevant tests, type-checks, or build, and fix what you broke. Don't leave the workspace half-migrated — if you can't finish, say what remains.\n" +
      "- Track multi-step work (beyond 2–3 steps) with the `todo` tool so the user sees progress; skip it for trivial tasks.\n" +
      "- Clarify with `question` before coding only when blocked on a decision that is genuinely the user's and would change what you build (scope, approach, trade-offs, conflicting requirements). Pick obvious defaults yourself, mention them, and proceed.",
    allowedBuiltins: ["read", "bash", "edit", "write", "todo", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: true,
  },
};

// --- Mode file format: YAML-ish frontmatter + markdown body ----------------
//
//   ---
//   name: Ask
//   description: Read-only Q&A. Cannot edit, write, or run shell commands.
//   tools: [read, grep, find, ls, question]
//   allowCustomTools: true
//   ---
//
//   Ask mode — read-only Q&A about this codebase. ...
//
// The frontmatter carries the mode's metadata; the body is the preamble. We
// parse only the small subset above (scalar strings, a boolean, and an inline
// `[a, b, c]` list) rather than pull in a YAML dependency.

interface ParsedModeFile {
  frontmatter: Partial<Omit<ModeConfig, "preamble">>;
  body: string;
}

/** Strip a single layer of matching single/double quotes, if present. */
function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse an inline `[a, b, c]` (or bare `a, b, c`) list into trimmed strings. */
function parseList(value: string): string[] {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0);
}

function parseModeFile(raw: string): ParsedModeFile {
  const text = raw.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text.trim() };

  const frontmatter: ParsedModeFile["frontmatter"] = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key === "name") frontmatter.label = unquote(value);
    else if (key === "description") frontmatter.description = unquote(value);
    else if (key === "tools") frontmatter.allowedBuiltins = parseList(value);
    else if (key === "allowCustomTools") frontmatter.allowCustomTools = value === "true";
    else if (key === "color") frontmatter.color = unquote(value);
    else if (key === "icon") frontmatter.icon = unquote(value);
  }
  return { frontmatter, body: text.slice(match[0].length).trim() };
}

/** Normalize a frontmatter color to a known palette entry, or undefined. */
function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return (MODE_COLORS as readonly string[]).includes(lower) ? lower : undefined;
}

/** Render a mode config as the on-disk file: frontmatter block + preamble body. */
function serializeModeFile(config: ModeConfig): string {
  return [
    "---",
    `name: ${config.label}`,
    `description: ${config.description}`,
    `tools: [${config.allowedBuiltins.join(", ")}]`,
    `allowCustomTools: ${config.allowCustomTools}`,
    `color: ${config.color}`,
    `icon: ${config.icon}`,
    "---",
    "",
    config.preamble,
    "",
  ].join("\n");
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
    allowedBuiltins: agent.allowedBuiltins,
    allowCustomTools: true,
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
    if (cached && cached.path === resolved.path && cached.mtimeMs === stat.mtimeMs) {
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
      allowedBuiltins: frontmatter.allowedBuiltins ?? defaults.allowedBuiltins,
      allowCustomTools: frontmatter.allowCustomTools ?? defaults.allowCustomTools,
      color: normalizeColor(frontmatter.color) ?? defaults.color,
      icon: frontmatter.icon ?? defaults.icon,
      source: resolved.source,
    };
    configCache.set(cacheKey, { path: resolved.path, mtimeMs: stat.mtimeMs, config });
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
  for (const mode of BUILTIN_MODES) preambles.add(DEFAULT_MODE_CONFIG[mode].preamble);
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
 * Given the currently-active tool names and a target mode, return the active
 * tool list that should be applied. Preserves non-builtin tools (MCP/LSP/extensions)
 * and swaps in the builtin set that mode allows.
 */
export function computeActiveToolsForMode(
  mode: Mode,
  currentActive: readonly string[],
  cwd?: string,
): string[] {
  const modeConfig = getModeConfig(mode, cwd);
  const allowed = new Set(modeConfig.allowedBuiltins);
  const builtins = new Set<string>(BUILTIN_TOOL_NAMES);
  const preserved = modeConfig.allowCustomTools
    ? currentActive.filter((name) => !builtins.has(name))
    : [];
  return [...new Set([...preserved, ...allowed])];
}
