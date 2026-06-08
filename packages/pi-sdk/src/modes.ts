import { QUESTION_TOOL_NAME } from "./question-tool.js";

export type Mode = "ask" | "plan" | "agent";

export const MODES: Mode[] = ["ask", "plan", "agent"];

/** Workspace-relative directory where plan-mode artifacts are saved. */
export const PLAN_DIR = ".agents/plans";

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
      "Ask mode is active — read-only Q&A about this codebase.\n\n" +
      "You can investigate with `read`, `grep`, `find`, and `ls`. You cannot edit or write files or run shell commands — those tools are disabled in this mode.\n\n" +
      "How to answer well:\n" +
      "- Ground every answer in the actual code. Before answering anything non-trivial, search and read the relevant files instead of guessing or relying on memory.\n" +
      "- Cite concrete locations as `path/to/file.ts:line` so the user can jump straight to them.\n" +
      "- Be direct and concise: lead with the answer, then back it with the evidence you found. Skip filler and restating the question.\n" +
      "- If the question is ambiguous or depends on something you can't determine from the code, use the `question` tool to clarify, or state your assumption explicitly.\n" +
      "- Don't describe code changes as if you're applying them. If the user clearly wants to make a change, note that Plan or Agent mode is where to do it.",
    allowedBuiltins: ["read", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: false,
  },
  plan: {
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .agents/plans/.",
    preamble:
      "Plan mode is active.\n" +
      "Goal: produce exactly one implementation-ready plan artifact for the user's request, saved under `.agents/plans/`.\n\n" +
      "Investigate first (read-only):\n" +
      "- Use `read`, `grep`, `find`, `ls`, and read-only `bash` to understand how the code actually works before proposing anything. Trace the real code paths, data models, and call sites involved — plan against the code, not assumptions.\n" +
      "- Do not modify source, configuration, tests, or docs. The only file you may write is the plan itself, via `plan_write`, under `.agents/plans/<short-kebab-slug>.md` (a 2–5 word kebab-case slug). Use `plan_read` only for files in `.agents/plans/`.\n\n" +
      "Clarify when it matters:\n" +
      "- When the request is vague, ambiguous, or could be approached in materially different ways, use the `question` tool before writing the plan. Ask about goals, scope, constraints, or which approach to take whenever the answer would change the plan. Batch related questions into a single `question` call. Reserve explicit, stated assumptions for minor gaps where any reasonable default is fine.\n\n" +
      "The plan must include:\n" +
      "- Problem summary and the relevant current-state findings, with concrete file references (`path:line`).\n" +
      "- A step-by-step implementation plan ordered by execution.\n" +
      "- The specific files/modules to change and the intended change in each.\n" +
      "- Risks, edge cases, and a validation strategy (the tests or commands that prove it works).\n" +
      "- A clear definition of done.\n\n" +
      "Output protocol:\n" +
      "- Produce exactly one plan artifact for this request.\n" +
      "- After `plan_write` succeeds, stop and wait for user review. Do not implement anything in this mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "plan_read", "plan_write", QUESTION_TOOL_NAME],
    allowCustomTools: false,
  },
  agent: {
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      "Agent mode is active — you are a skilled software engineer with full `read`, `edit`, `write`, and `bash` access. Implement the user's request end to end and leave the workspace in a working state.\n\n" +
      "Plan and track multi-step work:\n" +
      "- For any task beyond 2–3 steps, use the `todo` tool: call it with operation=`create` to list every step up front, mark each `in_progress` before you start it, and `completed` when it's done. Keep it current so the user always sees real progress. Simple single-step tasks don't need todos — use your judgement.\n\n" +
      "Work like the existing codebase:\n" +
      "- Before changing code, read enough of the surrounding files to match their conventions, naming, and patterns. Prefer the smallest change that fully solves the problem; don't refactor or reformat unrelated code.\n" +
      "- After making changes, verify them — run the relevant tests, type-checks, or build, and fix anything you broke. Don't claim something works if you haven't checked.\n" +
      "- Never leave the workspace broken or half-migrated. If you can't finish, say so plainly and describe what remains.\n\n" +
      "Clarify when it matters:\n" +
      "- When the request is vague or ambiguous, or you hit a decision that is genuinely the user's to make and would change what you build (scope, approach, trade-offs, conflicting requirements), use the `question` tool before writing code. Batch related questions into a single call and offer concrete options. Don't ask about choices with an obvious sensible default — pick it, mention it, and proceed.",
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
