import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { lamdaModeFilePath, lamdaModesDir } from "./lamda-paths.js";
import { QUESTION_TOOL_NAME } from "./question-tool.js";

export type Mode = "ask" | "plan" | "agent";

export const MODES: Mode[] = ["ask", "plan", "agent"];

/** Workspace-relative directory where plan-mode artifacts are saved. */
export const PLAN_DIR = ".lamda/plans";

export function isMode(value: unknown): value is Mode {
  return value === "ask" || value === "plan" || value === "agent";
}

export function normalizeMode(value: unknown): Mode | undefined {
  if (value === "code") return "agent";
  return isMode(value) ? value : undefined;
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

export interface ModeConfig {
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
}

/**
 * Built-in defaults for each mode. These seed `~/.lamda/modes/<mode>.md` on
 * first run and act as the fallback for any field a file omits (or when the file
 * is missing/unreadable). Once a file exists, its frontmatter + body take
 * precedence — see `getModeConfig`.
 */
const DEFAULT_MODE_CONFIG: Record<Mode, ModeConfig> = {
  ask: {
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
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      "Agent mode — you are a skilled software engineer with full `read`, `edit`, `write`, and `bash` access. Implement the request end to end and leave the workspace in a working state.\n\n" +
      "- Match the codebase: read enough of the surrounding files to follow existing conventions, naming, and patterns before changing anything. Make the smallest change that fully solves the problem; don't refactor or reformat unrelated code.\n" +
      "- Verify before claiming: run the relevant tests, type-checks, or build, and fix what you broke. Never report success you haven't checked, and never leave the workspace half-migrated — if you can't finish, say so and describe what remains.\n" +
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
  }
  return { frontmatter, body: text.slice(match[0].length).trim() };
}

/** Render a mode config as the on-disk file: frontmatter block + preamble body. */
function serializeModeFile(config: ModeConfig): string {
  return [
    "---",
    `name: ${config.label}`,
    `description: ${config.description}`,
    `tools: [${config.allowedBuiltins.join(", ")}]`,
    `allowCustomTools: ${config.allowCustomTools}`,
    "---",
    "",
    config.preamble,
    "",
  ].join("\n");
}

// Cache of file-loaded configs keyed by mode, invalidated by file mtime so a
// manual edit to `~/.lamda/modes/<mode>.md` takes effect on the next turn without
// a server restart (mirroring how `.lamda/tool-approvals.json` is re-read).
const configCache = new Map<Mode, { mtimeMs: number; config: ModeConfig }>();

/**
 * The active config for a mode: the parsed `~/.lamda/modes/<mode>.md` (frontmatter
 * over `DEFAULT_MODE_CONFIG`, body as the preamble), or the built-in default when
 * that file is missing/unreadable. Each frontmatter field independently falls
 * back to its default when absent, so a file may override only the prompt and
 * keep the default tool allowlist (or vice versa). Reads are cached and
 * invalidated by file mtime.
 */
export function getModeConfig(mode: Mode): ModeConfig {
  const defaults = DEFAULT_MODE_CONFIG[mode];
  try {
    const stat = statSync(lamdaModeFilePath(mode));
    const cached = configCache.get(mode);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.config;

    const { frontmatter, body } = parseModeFile(
      readFileSync(lamdaModeFilePath(mode), "utf8"),
    );
    const config: ModeConfig = {
      label: frontmatter.label ?? defaults.label,
      description: frontmatter.description ?? defaults.description,
      preamble: body.length > 0 ? body : defaults.preamble,
      allowedBuiltins: frontmatter.allowedBuiltins ?? defaults.allowedBuiltins,
      allowCustomTools: frontmatter.allowCustomTools ?? defaults.allowCustomTools,
    };
    configCache.set(mode, { mtimeMs: stat.mtimeMs, config });
    return config;
  } catch {
    return defaults;
  }
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
  for (const mode of MODES) {
    const path = lamdaModeFilePath(mode);
    if (existsSync(path)) continue;
    try {
      writeFileSync(path, serializeModeFile(DEFAULT_MODE_CONFIG[mode]), "utf8");
    } catch {
      // Seeding is best-effort; the in-memory default still applies.
    }
  }
}

export function getModePreamble(mode: Mode): string {
  return getModeConfig(mode).preamble;
}

/** Separator inserted between an injected mode preamble and the user's text. */
const PREAMBLE_SEPARATOR = "\n\n";

/**
 * Prepend a mode's preamble to user text before it is sent to the SDK. The SDK
 * persists the combined string into the conversation it replays to the model.
 */
export function applyModePreamble(mode: Mode, userText: string): string {
  return `${getModePreamble(mode)}${PREAMBLE_SEPARATOR}${userText}`;
}

/**
 * Inverse of `applyModePreamble`: strip a leading mode preamble if the text
 * begins with one. Used when reconstructing the original user text from
 * persisted session history (e.g. seeding a forked thread's DB blocks), where
 * the preamble is baked into the stored message. Returns the text unchanged if
 * it doesn't start with a known preamble.
 *
 * Tries both the current on-disk preamble and the built-in default for each
 * mode, so text stored under an earlier (or since-edited) `~/.lamda/modes/*.md`
 * still strips cleanly.
 */
export function stripModePreamble(text: string): string {
  for (const mode of MODES) {
    for (const preamble of new Set([
      getModeConfig(mode).preamble,
      DEFAULT_MODE_CONFIG[mode].preamble,
    ])) {
      const prefix = preamble + PREAMBLE_SEPARATOR;
      if (text.startsWith(prefix)) return text.slice(prefix.length);
    }
  }
  return text;
}

/**
 * Given the currently-active tool names and a target mode, return the active
 * tool list that should be applied. Preserves non-builtin tools (MCP/LSP/extensions)
 * and swaps in the builtin set that mode allows.
 */
export function computeActiveToolsForMode(
  mode: Mode,
  currentActive: readonly string[],
): string[] {
  const modeConfig = getModeConfig(mode);
  const allowed = new Set(modeConfig.allowedBuiltins);
  const builtins = new Set<string>(BUILTIN_TOOL_NAMES);
  const preserved = modeConfig.allowCustomTools
    ? currentActive.filter((name) => !builtins.has(name))
    : [];
  return [...new Set([...preserved, ...allowed])];
}
