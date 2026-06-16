import type { ToolApprovalBridge } from "@lamda/pi-sdk";
import {
  QUESTION_TOOL_NAME,
  TODO_TOOL_NAME,
  MEMORY_TOOL_NAME,
  PLAN_TOOL_NAME,
} from "@lamda/pi-sdk";
import { getThread } from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { waitForApproval } from "./approval-registry.js";
import { getToolDecision, setToolDecision } from "./tool-approval-store.js";
import { bashCommandScope } from "./bash-command-scope.js";

/**
 * Tools that never require approval: read-only built-ins and host tools that
 * only touch app state (not the user's files or shell). Everything else —
 * `bash`, `edit`, `write`, and any custom MCP/LSP tool — is gated.
 */
const AUTO_ALLOW = new Set<string>([
  "read",
  "grep",
  "find",
  "ls",
  // The `plan` tool is constrained to .lamda/plans/ (read/list/write), so it's
  // safe to auto-allow including its writes.
  PLAN_TOOL_NAME,
  QUESTION_TOOL_NAME,
  TODO_TOOL_NAME,
  MEMORY_TOOL_NAME,
]);

/**
 * The unit a remembered decision applies to. Most tools are gated as a whole
 * (key = tool name), but `bash` is gated per leading command (`git status`,
 * `npm run`, …) so approving one command doesn't unlock every shell command.
 * `label` is what the approval UI shows that "Always"/"Don't allow" will remember.
 */
function approvalScope(
  toolName: string,
  input: Record<string, unknown>,
): { storeKey: string; label: string } {
  if (toolName === "bash") {
    const command = typeof input.command === "string" ? input.command : "";
    const { key, label } = bashCommandScope(command);
    return { storeKey: `bash:${key}`, label };
  }
  return { storeKey: toolName, label: toolName };
}

/**
 * Build the approval gate for one thread's session. Consulted by the SDK before
 * every tool call. State (the thread's approval mode, saved per-workspace
 * decisions) is read fresh on each call so changes take effect immediately. The
 * live sessionId is resolved lazily because it doesn't exist yet when the
 * session — and thus this bridge — is created.
 */
export function createToolApprovalBridge(threadId: string): ToolApprovalBridge {
  return {
    async decide(req, signal) {
      // Thread's per-conversation toggle: skip all gating when "all_allowed".
      const approvalMode = getThread(threadId)?.approvalMode ?? "ask";
      if (approvalMode === "all_allowed") return { allow: true };

      if (AUTO_ALLOW.has(req.toolName)) return { allow: true };

      const { storeKey, label } = approvalScope(req.toolName, req.input);

      // Remembered workspace decisions short-circuit the prompt.
      const saved = getToolDecision(req.cwd, storeKey);
      if (saved === "allow") return { allow: true };
      if (saved === "deny") {
        return {
          allow: false,
          reason: `Blocked by a saved workspace rule: "${label}" is set to never allow.`,
        };
      }

      // Need a live session to surface the prompt and receive the answer. If
      // there's none we can't ask, so fail open rather than hang the agent.
      const sessionId = store.getByThreadId(threadId)?.sessionId;
      if (!sessionId) return { allow: true };

      sessionEvents.emitToolApprovalRequest(sessionId, {
        toolCallId: req.toolCallId,
        toolName: req.toolName,
        input: req.input,
        scopeLabel: label,
      });

      const decision = await waitForApproval(req.toolCallId, signal);

      // `always`/`never` persist a workspace rule; `once`/`reject` are one-offs.
      if (decision === "always") setToolDecision(req.cwd, storeKey, "allow");
      if (decision === "never") setToolDecision(req.cwd, storeKey, "deny");

      sessionEvents.emitToolApprovalResolved(sessionId, {
        toolCallId: req.toolCallId,
        decision,
      });

      // Both deny choices block this call but let the agent continue; only
      // `never` is remembered for the workspace.
      if (decision === "never" || decision === "reject") {
        return { allow: false, reason: "Denied by user." };
      }
      return { allow: true };
    },
  };
}
