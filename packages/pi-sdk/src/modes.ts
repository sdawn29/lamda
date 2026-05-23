export type Mode = "ask" | "plan" | "code";

export const MODES: Mode[] = ["ask", "plan", "code"];

/** Workspace-relative directory where plan-mode artifacts are saved. */
export const PLAN_DIR = ".agents/plans";

export function isMode(value: unknown): value is Mode {
  return value === "ask" || value === "plan" || value === "code";
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
  "grep",
  "find",
  "ls",
] as const;

interface ModeConfig {
  label: string;
  description: string;
  /** Prepended to user text before it reaches the SDK. Empty for "code" mode. */
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
    allowedBuiltins: ["read", "grep", "find", "ls"],
    allowCustomTools: false,
  },
  plan: {
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .agents/plans/.",
    preamble:
      "Plan mode is active.\nGoal: deliver one implementation-ready plan artifact for the user's request.\n\nRules:\n1) Investigate first using read-only analysis (`read`, `grep`, `find`, `ls`, and read-only `bash`).\n2) Do not modify source files, configuration, tests, or docs.\n3) Use `plan_write` only to save the final plan file under `.agents/plans/<short-kebab-slug>.md` (2-5 word kebab-case slug).\n4) You may use `plan_read` only for files in `.agents/plans/`.\n5) If information is missing, state assumptions explicitly in the plan.\n\nPlan quality bar (must include):\n- Problem summary and current-state findings.\n- Step-by-step implementation plan ordered by execution.\n- Affected files/modules with intended changes.\n- Risks/edge cases and validation strategy.\n- Clear definition of done.\n\nOutput protocol:\n- Produce exactly one plan artifact for this request.\n- After writing the plan file successfully, stop and wait for user review.\n- Do not perform implementation in this mode.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "plan_read", "plan_write"],
    allowCustomTools: false,
  },
  code: {
    label: "Code",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble: "",
    allowedBuiltins: ["read", "bash", "edit", "write", "grep", "find", "ls"],
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
