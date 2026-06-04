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
      "Ask mode is active. Answer the user's question conversationally based on the code. Do not propose changes, write plans, edit files, or run shell commands. Be concise.",
    allowedBuiltins: ["read", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: false,
  },
  plan: {
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .agents/plans/.",
    preamble:
      "Plan mode is active.\nGoal: deliver one implementation-ready plan artifact for the user's request.\n\nRules:\n1) Investigate first using read-only analysis (`read`, `grep`, `find`, `ls`, and read-only `bash`).\n2) Do not modify source files, configuration, tests, or docs.\n3) Use `plan_write` only to save the final plan file under `.agents/plans/<short-kebab-slug>.md` (2-5 word kebab-case slug).\n4) You may use `plan_read` only for files in `.agents/plans/`.\n5) When the request is vague, ambiguous, or could be approached several materially different ways, use the `question` tool to ask the user before writing the plan. Ask about goals, scope, constraints, or which approach to take whenever the answer would meaningfully change the plan. Batch related questions into a single `question` call. Reserve assumptions (stated explicitly in the plan) for minor gaps where any reasonable default is fine.\n\nPlan quality bar (must include):\n- Problem summary and current-state findings.\n- Step-by-step implementation plan ordered by execution.\n- Affected files/modules with intended changes.\n- Risks/edge cases and validation strategy.\n- Clear definition of done.\n\nOutput protocol:\n- Produce exactly one plan artifact for this request.\n- After writing the plan file successfully, stop and wait for user review.\n- Do not perform implementation in this mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "plan_read", "plan_write", QUESTION_TOOL_NAME],
    allowCustomTools: false,
  },
  agent: {
    label: "Agent",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble:
      "You are a skilled software engineer. For any task that involves more than 2–3 steps, use the `todo` tool to plan and track your work before you begin:\n\n" +
      "1. Call `todo` with operation=`create` to list every step you plan to take.\n" +
      "2. Before starting each step, call `todo` with operation=`update` to mark it `in_progress`.\n" +
      "3. When a step is done, mark it `completed`.\n" +
      "4. Keep todos updated so the user always knows current progress.\n\n" +
      "Simple, single-step tasks do not need todos. Use your judgement — when in doubt, use todos.\n\n" +
      "When the request is vague or ambiguous, or you hit a decision that is genuinely the user's to make and would change what you build (scope, approach, trade-offs, conflicting requirements), use the `question` tool to clarify before writing code. Batch related questions into a single `question` call and offer concrete options. Don't ask about choices that have an obvious sensible default — pick it, mention it, and proceed.",
    allowedBuiltins: ["read", "bash", "edit", "write", "todo", "grep", "find", "ls", QUESTION_TOOL_NAME],
    allowCustomTools: true,
  },
};

export function getModePreamble(mode: Mode): string {
  return MODE_CONFIG[mode].preamble;
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
