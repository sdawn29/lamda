import {
  createManagedSession,
  getAvailableModels,
  isToolAllowed,
  SUBAGENT_TOOL_NAMES,
  type AgentConfig,
  type ManagedSessionHandle,
} from "@lamda/pi-sdk";
import { getThread, insertAiUsage } from "@lamda/db";
import { createToolApprovalBridge } from "./tool-approval-bridge.js";
import { collectSubagentCustomTools } from "./subagent-custom-tools.js";
import {
  SubagentTranscriptRecorder,
  type SubagentRunDetails,
} from "./subagent-transcript.js";

/**
 * At most this many subagents run at once across the whole server; further
 * spawns wait in FIFO order (surfaced to the UI as status "queued"). Note a
 * subagent paused on a tool approval keeps holding its slot — acceptable at
 * this cap, and the parent can always abort.
 */
const MAX_CONCURRENT_SUBAGENTS = 4;

/** Trailing-edge throttle for streaming transcript snapshots to the client. */
const UPDATE_THROTTLE_MS = 150;

let activeRuns = 0;
const slotWaiters: Array<() => void> = [];

/** Resolves true once a slot is held, or false if aborted while queued. */
function acquireSlot(signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (activeRuns < MAX_CONCURRENT_SUBAGENTS) {
    activeRuns += 1;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const waiter = () => {
      signal?.removeEventListener("abort", onAbort);
      activeRuns += 1;
      resolve(true);
    };
    const onAbort = () => {
      const index = slotWaiters.indexOf(waiter);
      if (index >= 0) slotWaiters.splice(index, 1);
      resolve(false);
    };
    slotWaiters.push(waiter);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function releaseSlot(): void {
  activeRuns = Math.max(0, activeRuns - 1);
  slotWaiters.shift()?.();
}

/** Split a `provider::model` id, mirroring `modelConfigForThread`. */
function parseModelId(
  modelId: string | null | undefined,
): { provider: string; model: string } | undefined {
  if (!modelId) return undefined;
  const separator = modelId.indexOf("::");
  if (separator <= 0 || separator === modelId.length - 2) return undefined;
  return {
    provider: modelId.slice(0, separator),
    model: modelId.slice(separator + 2),
  };
}

/**
 * The model a subagent runs on: the caller's per-call override (already
 * validated by the delegate tool) wins, then the agent definition's override
 * when it names a model that actually exists, otherwise the parent thread's
 * model (a bad frontmatter `model` must soften to inheritance, never fail the
 * spawn), otherwise the SDK default.
 */
async function resolveModel(
  agent: AgentConfig,
  parentThreadId: string,
  override?: { provider: string; model: string },
): Promise<{ provider: string; model: string } | undefined> {
  if (override) return override;
  if (agent.model) {
    try {
      const available = await getAvailableModels();
      if (
        available.some(
          (m) =>
            m.provider === agent.model!.provider && m.id === agent.model!.model,
        )
      ) {
        return agent.model;
      }
    } catch {
      // Model registry unavailable — fall through to the parent's model.
    }
  }
  return parseModelId(getThread(parentThreadId)?.modelId);
}

/** Thinking levels accepted by the SDK — anything else is dropped. */
const THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const);
type ThinkingLevel = typeof THINKING_LEVELS extends Set<infer T> ? T : never;

function asThinkingLevel(level: string | undefined): ThinkingLevel | undefined {
  return level && THINKING_LEVELS.has(level as ThinkingLevel)
    ? (level as ThinkingLevel)
    : undefined;
}

export interface RunSubagentOptions {
  parentThreadId: string;
  agent: AgentConfig;
  /** The full, self-contained task prompt from the parent model. */
  prompt: string;
  /** Directory the subagent works in — the parent session's (worktree-aware) cwd. */
  cwd: string;
  /**
   * Per-call model override chosen by the delegating agent (the delegate
   * tool's `model` param, already validated against the registry). Takes
   * precedence over the agent definition's frontmatter `model`.
   */
  modelOverride?: { provider: string; model: string };
  /**
   * Thinking level inherited from the parent turn. Without it the subagent
   * session falls back to the pi settings default (often "off"), so its
   * transcript would never contain thinking. The SDK clamps it to the
   * subagent's model capabilities.
   */
  thinkingLevel?: string;
  /** The parent `delegate` tool call's abort signal. */
  signal: AbortSignal | undefined;
  /** Streams transcript snapshots up as the parent tool call's partial result. */
  onUpdate:
    | ((partial: { content: never[]; details: SubagentRunDetails }) => void)
    | undefined;
  parentToolCallId: string;
}

export interface SubagentRunResult {
  /** The subagent's final report (empty when it produced none). */
  finalText: string;
  details: SubagentRunDetails;
  /** True when the run ended in error or was aborted. */
  failed: boolean;
}

/**
 * Run one subagent to completion: an in-memory nested session in the parent's
 * cwd, gated by the parent thread's approval bridge, streaming its transcript
 * up through `onUpdate`. Never throws — failures settle into the returned
 * details so the parent tool result keeps the transcript.
 */
export async function runSubagent(
  opts: RunSubagentOptions,
): Promise<SubagentRunResult> {
  const model = await resolveModel(
    opts.agent,
    opts.parentThreadId,
    opts.modelOverride,
  );
  const recorder = new SubagentTranscriptRecorder({
    agent: opts.agent.id,
    agentLabel: opts.agent.label,
    color: opts.agent.color,
    icon: opts.agent.icon,
    model: model ? `${model.provider}::${model.model}` : undefined,
  });

  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUpdateAt = 0;
  const sendUpdate = () => {
    lastUpdateAt = Date.now();
    opts.onUpdate?.({ content: [], details: recorder.snapshot() });
  };
  const scheduleUpdate = (eager: boolean) => {
    if (!opts.onUpdate) return;
    const elapsed = Date.now() - lastUpdateAt;
    if (eager || elapsed >= UPDATE_THROTTLE_MS) {
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      sendUpdate();
      return;
    }
    if (!updateTimer) {
      updateTimer = setTimeout(() => {
        updateTimer = null;
        sendUpdate();
      }, UPDATE_THROTTLE_MS - elapsed);
    }
  };
  const settle = (
    status: "done" | "error" | "aborted",
    errorMessage?: string,
  ): SubagentRunResult => {
    if (updateTimer) {
      clearTimeout(updateTimer);
      updateTimer = null;
    }
    recorder.finish(status, errorMessage);
    const details = recorder.snapshot();
    return {
      finalText: recorder.lastAssistantText(),
      details,
      failed: status !== "done",
    };
  };

  // Show the card immediately, even while waiting for a slot.
  sendUpdate();

  if (!(await acquireSlot(opts.signal))) {
    return settle("aborted", "Aborted before the subagent started.");
  }

  let handle: ManagedSessionHandle | null = null;
  let events: AsyncGenerator<unknown> | null = null;
  let abortRequested = false;
  const onAbort = () => {
    abortRequested = true;
    void handle?.abort();
  };

  try {
    const thread = getThread(opts.parentThreadId);
    const availableCustomTools = await collectSubagentCustomTools(
      thread?.workspaceId,
      opts.cwd,
      opts.parentThreadId,
    );
    // The agent's `tools` is one flat allowlist of builtin and custom names
    // (plus `*` prefix globs like `mcp__github__*`); intersect it with what's
    // actually available here. Denied names (`delegate`, `question`, …) were
    // already stripped when the config loaded, and globs can't reach them —
    // the available set here never contains host chat controls.
    const selectedCustomTools = availableCustomTools.filter((tool) =>
      isToolAllowed(tool.name, opts.agent.tools),
    );
    handle = await createManagedSession({
      cwd: opts.cwd,
      ...(model ?? {}),
      thinkingLevel: asThinkingLevel(opts.thinkingLevel),
      subagent: { systemPrompt: opts.agent.systemPrompt },
      customTools: selectedCustomTools,
      toolApproval: createToolApprovalBridge(opts.parentThreadId, {
        agentLabel: opts.agent.label,
        parentToolCallId: opts.parentToolCallId,
      }),
    });
    // Apply the agent definition's tool allowlist. `delegate` is never granted, so
    // subagents cannot spawn subagents.
    const grantableBuiltins = new Set<string>(SUBAGENT_TOOL_NAMES);
    handle.setActiveTools([
      ...opts.agent.tools.filter((name) => grantableBuiltins.has(name)),
      ...selectedCustomTools.map((tool) => tool.name),
    ]);

    if (opts.signal?.aborted) {
      return settle("aborted", "Aborted before the subagent started.");
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    recorder.markRunning();
    scheduleUpdate(true);

    const workspaceId = getThread(opts.parentThreadId)?.workspaceId ?? "";
    const generator = handle.events();
    events = generator;
    // `handle.events()` is documented to stay alive across multiple prompts —
    // it only yields when a new event arrives, and otherwise waits forever
    // (see packages/pi-sdk/src/stream.ts). For this ephemeral one-shot
    // session we only ever send one prompt, so we must `break` the instant
    // `agent_end` (the terminal event for a single prompt() call) arrives,
    // while the loop is still suspended right at that event's yield — a
    // `for await` loop's implicit `return()` on break unwinds cleanly there.
    // Calling `.return()` from *outside* after `prompt()` resolves is unsafe:
    // by then the generator has already moved past that yield and is parked
    // awaiting a next event that will never come, so the external call just
    // hangs forever — which froze the whole parent turn on this tool call.
    const pumpEvents = async () => {
      for await (const event of generator) {
        const hint = recorder.handleEvent(event);
        if (hint !== "ignore") scheduleUpdate(hint === "eager");
        // Subagent spend lands on the parent thread so the usage dashboard
        // sees it (mirrors the hub's message_end accounting).
        if (event.type === "message_end") {
          const m = (
            event as {
              message?: {
                role?: string;
                model?: string;
                provider?: string;
                usage?: {
                  input: number;
                  output: number;
                  cacheRead: number;
                  cacheWrite: number;
                  reasoning?: number;
                  totalTokens?: number;
                  cost?: { total?: number };
                };
              };
            }
          ).message;
          if (m?.role === "assistant" && m.usage) {
            const { input, output, cacheRead, cacheWrite } = m.usage;
            if (input + output + cacheRead + cacheWrite > 0) {
              try {
                insertAiUsage({
                  threadId: opts.parentThreadId,
                  workspaceId,
                  provider: m.provider ?? "",
                  model: m.model ?? "",
                  agentId: opts.agent.id,
                  agentLabel: opts.agent.label,
                  inputTokens: input,
                  outputTokens: output,
                  cacheReadTokens: cacheRead,
                  cacheWriteTokens: cacheWrite,
                  reasoningTokens: m.usage.reasoning ?? 0,
                  totalTokens:
                    m.usage.totalTokens ??
                    input + output + cacheRead + cacheWrite,
                  cost: m.usage.cost?.total ?? 0,
                });
              } catch {
                // Usage accounting must never break the run.
              }
            }
          }
        }
        if (event.type === "agent_end") break;
      }
    };

    await Promise.all([handle.prompt(opts.prompt), pumpEvents()]);

    if (abortRequested || opts.signal?.aborted) {
      return settle("aborted");
    }
    if (recorder.assistantError) {
      return settle("error", recorder.assistantError);
    }
    return settle("done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return settle(abortRequested ? "aborted" : "error", message);
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    void events?.return(undefined).catch(() => undefined);
    try {
      handle?.dispose();
    } catch {
      // Dispose failures must not mask the run's outcome.
    }
    releaseSlot();
  }
}
