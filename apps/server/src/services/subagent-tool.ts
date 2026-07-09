import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  getAgentConfig,
  getModeConfig,
  listAgents,
  normalizeMode,
  DELEGATE_TOOL_NAME,
  type AgentConfig,
} from "@lamda/pi-sdk";
import { getThread } from "@lamda/db";
import { sessionEvents } from "../session-events.js";
import { store } from "../store.js";
import { runSubagent } from "./subagent-runner.js";

/** Keep per-agent blurbs in the tool description to one tight line. */
function clampDescription(text: string, max = 220): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function buildDelegateDescription(agents: AgentConfig[]): string {
  const list = agents
    .map((a) => `- ${a.id}: ${clampDescription(a.description) || a.label}`)
    .join("\n");
  return `Delegate a task to a subagent that handles it autonomously and reports back.

The subagent runs in this conversation's working directory with its own context window and its agent-specific toolset. It cannot ask the user questions and cannot spawn further subagents. Nothing but its final message comes back to you, so \`prompt\` must be fully self-contained: include all the context it needs and state exactly what it should return.

To run subagents in parallel, emit multiple delegate calls in a single message (at most 4 execute concurrently; extras wait in a queue). Prefer the cheapest agent that can do the job — use \`explore\` for read-only codebase questions, \`research\` for reading external docs and web pages, and reserve \`general\` for work that needs edits or shell access. The active mode may restrict which agents can be launched (read-only modes only allow read-only agents); a disallowed launch fails with the permitted list.

Available agents:
${list}`;
}

/**
 * The `delegate` tool: lets the main agent delegate work to a subagent defined
 * in `.lamda/agents/` (or a built-in). The nested run streams its transcript up
 * through this tool call's partial results — see subagent-runner.ts.
 *
 * The available-agents list is baked into the description at build time;
 * `refreshSessionTools` rebuilds custom tools when agent files change, and
 * `execute` re-resolves the agent from disk so a stale description still runs
 * the current definition.
 */
export function createDelegateTool(
  threadId: string,
  workspacePath: string,
): ToolDefinition {
  return {
    name: DELEGATE_TOOL_NAME,
    label: "delegate",
    description: buildDelegateDescription(listAgents(workspacePath)),
    // Multiple delegate calls in one assistant message run concurrently; the
    // global MAX_CONCURRENT_SUBAGENTS semaphore bounds the fan-out.
    executionMode: "parallel",
    parameters: {
      type: "object",
      required: ["agent", "description", "prompt"],
      properties: {
        agent: {
          type: "string",
          description:
            'Id of the agent to launch — one from the "Available agents" list.',
        },
        description: {
          type: "string",
          description:
            'A 3-7 word present-tense summary of the task, shown in the UI (e.g. "Find session lifecycle code").',
        },
        prompt: {
          type: "string",
          description:
            "The complete, self-contained task. The agent cannot see this conversation — include all needed context and say exactly what to return.",
        },
      },
    },
    execute: async (toolCallId, params, signal, onUpdate) => {
      const p = (params ?? {}) as Record<string, unknown>;
      const agentId = typeof p.agent === "string" ? p.agent.trim() : "";
      const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";

      // The thread may have moved into a worktree since this tool was built —
      // resolve the live session's cwd at run time.
      const live = store.getByThreadId(threadId);
      const cwd =
        (live ? store.get(live.sessionId)?.cwd : undefined) ?? workspacePath;

      const agent = getAgentConfig(agentId, cwd);
      if (!agent) {
        const available = listAgents(cwd)
          .map((a) => a.id)
          .join(", ");
        throw new Error(
          `Unknown agent "${agentId}". Available agents: ${available}.`,
        );
      }
      // Enforce the current mode's `agents` allowlist at launch time (the
      // thread's mode can change after this tool's description was built).
      // This is a real boundary, not advice: a read-only mode delegating to
      // an agent with edit/bash would bypass the mode's own tool gating.
      const mode = normalizeMode(getThread(threadId)?.mode);
      const allowedAgents = mode ? getModeConfig(mode, cwd).agents : null;
      if (allowedAgents !== null && !allowedAgents.includes(agent.id)) {
        throw new Error(
          allowedAgents.length > 0
            ? `Agent "${agent.id}" is not allowed in ${mode} mode. Allowed agents: ${allowedAgents.join(", ")}.`
            : `The ${mode} mode does not allow launching subagents.`,
        );
      }
      if (!prompt) throw new Error("`prompt` is required.");

      const { finalText, details, failed } = await runSubagent({
        parentThreadId: threadId,
        agent,
        prompt,
        cwd,
        // Inherit the parent turn's thinking effort so the subagent reasons
        // (and streams thinking into its transcript) like the parent does.
        thinkingLevel: live
          ? sessionEvents.getThinkingLevel(live.sessionId)
          : undefined,
        signal,
        onUpdate,
        parentToolCallId: toolCallId,
      });

      // Failures return normally (not throw) so the transcript in `details`
      // survives into the persisted tool result.
      const text = failed
        ? `Subagent ${agent.id} ${details.status === "aborted" ? "was aborted" : "failed"}${
            details.errorMessage ? `: ${details.errorMessage}` : "."
          }${finalText ? `\n\nPartial report:\n${finalText}` : ""}`
        : finalText ||
          "The subagent finished without producing a final report.";
      return { content: [{ type: "text" as const, text }], details };
    },
  };
}
