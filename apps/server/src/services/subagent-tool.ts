import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  getAgentConfig,
  getAvailableModels,
  getModeConfig,
  listAgents,
  normalizeMode,
  parseAgentModel,
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
  return `Delegate one bounded task to a headless subagent with an independent context window.

The subagent runs in this conversation's working directory with its agent-specific tools. It cannot see this conversation, ask the user questions, or spawn another agent. Only its final report returns, so \`prompt\` must stand alone. Include:
- objective and concrete deliverable;
- relevant user intent, facts already established, files/symbols, and external context;
- scope boundaries, constraints, and decisions already made;
- the investigation or implementation expected, including assumptions it may make; and
- the report format, evidence, and validation required on completion.

Delegate only work that is genuinely separable. Do not use a subagent for a tiny lookup, a decision that depends on the full conversation, or work you must immediately repeat. Never send a vague prompt such as "look into this." Split independent work into separate calls, then evaluate and synthesize their reports. A report is evidence, not proof: inspect changed files and validate integration before relying on delegated edits.

To run independent tasks in parallel, emit multiple delegate calls in one message (at most 4 run concurrently; extras queue). Choose the narrowest capable agent: \`explore\` for codebase tracing, \`research\` for external sources, \`reviewer\` for an independent audit, and \`general\` only when edits or shell execution are required. The active mode may restrict the available agents.

The optional \`model\` override can use a cheaper/faster model for mechanical work or a stronger model for difficult reasoning. Omit it to inherit the agent's configured/default model.

Available agents:
${list}`;
}

/** List the registry's model ids so the parent knows what `model` accepts. */
function buildModelParamDescription(): string {
  let ids: string[] = [];
  try {
    ids = getAvailableModels().map((m) => `${m.provider}::${m.id}`);
  } catch {
    // Registry unavailable — the param still documents its format.
  }
  return (
    "Optional model override for this run, as `provider::model`. Overrides the agent's default model. " +
    (ids.length > 0
      ? `Available models: ${ids.join(", ")}.`
      : "Must name a model available in this app.")
  );
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
            "A detailed, self-contained brief. Include the objective, relevant context/files, scope and constraints, expected work, and required report/validation. The agent cannot see this conversation or ask the user questions.",
        },
        model: {
          type: "string",
          description: buildModelParamDescription(),
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

      // Validate an explicit model override eagerly: unlike a bad frontmatter
      // `model` (which softens to inheritance), a bad tool param should fail
      // loudly so the parent can correct it and retry.
      const modelParam = typeof p.model === "string" ? p.model.trim() : "";
      let modelOverride: { provider: string; model: string } | undefined;
      if (modelParam) {
        const parsed = parseAgentModel(modelParam);
        const available = getAvailableModels();
        const match =
          parsed &&
          available.find(
            (m) => m.provider === parsed.provider && m.id === parsed.model,
          );
        if (!match) {
          throw new Error(
            `Unknown model "${modelParam}". Use \`provider::model\` with one of: ${available
              .map((m) => `${m.provider}::${m.id}`)
              .join(", ")}.`,
          );
        }
        modelOverride = parsed;
      }

      const { finalText, details, failed } = await runSubagent({
        parentThreadId: threadId,
        agent,
        prompt,
        cwd,
        modelOverride,
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
