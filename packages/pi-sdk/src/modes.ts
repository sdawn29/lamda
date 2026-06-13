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
  "plan_read",
  "plan_write",
  "todo",
  "grep",
  "find",
  "ls",
] as const;

interface ModeConfig {
  label: string;
  description: string;
  /** Prepended to user text before it reaches the SDK. */
  preamble: string;
  /** Built-in tool names that should be active in this mode. */
  allowedBuiltins: readonly string[];
  /** Whether non-builtin tools (MCP/LSP/extensions) remain active in this mode. */
  allowCustomTools: boolean;
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  ask: {
    label: "Ask",
    description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
    preamble:
      "Ask mode — read-only Q&A about this codebase. You have `read`, `grep`, `find`, and `ls`; editing, writing, and shell are disabled here.\n\n" +
      "- Ground every non-trivial answer in the actual code: search and read the relevant files before answering rather than relying on memory.\n" +
      "- Cite concrete locations as `path/to/file.ts:line`.\n" +
      "- Lead with the answer, then the supporting evidence.\n" +
      "- If the question is ambiguous or unanswerable from the code, clarify via `question` or state your assumption explicitly.\n" +
      "- Don't describe edits as if you're applying them; if the user wants a change made, point them to Plan or Agent mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: false,
  },
  plan: {
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .lamda/plans/.",
    preamble:
      "Plan mode — produce exactly one implementation-ready plan for the user's request, saved under `.lamda/plans/`.\n\n" +
      "Investigate first (read-only): use `read`, `grep`, `find`, `ls`, and read-only `bash` to trace the real code paths, data models, and call sites. Plan against the code, not assumptions. Don't modify source, config, tests, or docs — the only file you write is the plan, via `plan_write`, at `.lamda/plans/<2-5-word-kebab-slug>.md` (`plan_read` is for that directory only).\n\n" +
      "Clarify before writing when the request is vague or could be approached in materially different ways: use `question` for goals, scope, constraints, or approach whenever the answer would change the plan. State assumptions only for minor gaps with an obvious default.\n\n" +
      "The plan must cover:\n" +
      "- Problem summary and current-state findings, with `path:line` references.\n" +
      "- Step-by-step implementation, ordered by execution.\n" +
      "- The specific files/modules to change and the intended change in each.\n" +
      "- Risks, edge cases, and a validation strategy (the tests/commands that prove it works).\n" +
      "- A clear definition of done.\n\n" +
      "After `plan_write` succeeds, stop and wait for review — implement nothing in this mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "plan_read", "plan_write", QUESTION_TOOL_NAME],
    allowCustomTools: false,
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

export function getModePreamble(mode: Mode): string {
  return MODE_CONFIG[mode].preamble;
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
 */
export function stripModePreamble(text: string): string {
  for (const mode of MODES) {
    const prefix = MODE_CONFIG[mode].preamble + PREAMBLE_SEPARATOR;
    if (text.startsWith(prefix)) return text.slice(prefix.length);
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
  const modeConfig = MODE_CONFIG[mode];
  const allowed = new Set(MODE_CONFIG[mode].allowedBuiltins);
  const builtins = new Set<string>(BUILTIN_TOOL_NAMES);
  const preserved = modeConfig.allowCustomTools
    ? currentActive.filter((name) => !builtins.has(name))
    : [];
  return [...new Set([...preserved, ...allowed])];
}
