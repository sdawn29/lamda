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
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  ask: {
    label: "Ask",
    description: "Read-only Q&A. Cannot edit, write, or run shell commands.",
    preamble:
      "Ask mode is active. Answer the user's question conversationally based on the code. Do not propose changes, write plans, edit files, or run shell commands. Be concise.",
    allowedBuiltins: ["read", "grep", "find", "ls"],
  },
  plan: {
    label: "Plan",
    description: "Research and propose a plan. Saves the plan to .agents/plans/.",
    preamble:
      "Plan mode is active. Investigate the request thoroughly using read tools, then save your plan as a markdown file at `.agents/plans/<short-kebab-slug>.md` (relative to the workspace root). The slug should be 2–5 words describing the task. Use the Write tool ONLY for this single plan file — do not edit or create any other files. Bash is available for read-only inspection (git log, ls, etc.) only. Once the plan file is written, stop and let the user review it.",
    allowedBuiltins: ["read", "grep", "find", "ls", "bash", "write"],
  },
  code: {
    label: "Code",
    description: "Full coding agent. Can edit, write, and run shell commands.",
    preamble: "",
    allowedBuiltins: ["read", "bash", "edit", "write", "grep", "find", "ls"],
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
  const allowed = new Set(MODE_CONFIG[mode].allowedBuiltins);
  const builtins = new Set<string>(BUILTIN_TOOL_NAMES);
  const preserved = currentActive.filter((name) => !builtins.has(name));
  return [...new Set([...preserved, ...allowed])];
}
