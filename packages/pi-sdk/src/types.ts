import type {
  AgentSessionEvent,
  AuthStorage,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Mode } from "./modes.js";

/** A slash command available in the current session. */
export interface SlashCommand {
  name: string;
  description?: string;
  source: "skill" | "prompt";
}

/** SDK-agnostic model descriptor. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  /** Whether the model supports extended thinking/reasoning. */
  reasoning: boolean;
  /** Available thinking/effort levels for this model (empty if reasoning is false). */
  thinkingLevels: string[];
}

/** Options for the prompt() method. */
export interface PromptOptions {
  /** Image attachments to include with the prompt. */
  images?: ImageContent[];
  /**
   * When streaming, how to queue the message:
   * - "steer": Interrupt current work, deliver immediately after current tool calls finish
   * - "followUp": Wait until agent finishes all work before delivering
   */
  streamingBehavior?: "steer" | "followUp";
  /** Whether to expand file-based prompt templates (default: true). */
  expandPromptTemplates?: boolean;
}

/**
 * Image content for prompts. Matches the underlying agent's image content
 * shape (`@earendil-works/pi-ai` `ImageContent`): a flat base64 payload plus
 * its MIME type — NOT the Anthropic raw `{ source: {...} }` envelope.
 */
export interface ImageContent {
  type: "image";
  /** Base64-encoded image data (no data-URL prefix). */
  data: string;
  /** MIME type, e.g. "image/png". */
  mimeType: string;
}

/** A tool call the agent is about to execute, presented for approval. */
export interface ToolApprovalRequest {
  /** Globally-unique id for this tool call. */
  toolCallId: string;
  /** Name of the tool, e.g. "bash", "edit", or an MCP tool like "mcp__foo__bar". */
  toolName: string;
  /** The tool's arguments (e.g. `{ command }` for bash, `{ path }` for write). */
  input: Record<string, unknown>;
  /** Working directory of the session — used to scope persisted decisions. */
  cwd: string;
}

/** Outcome of an approval decision. */
export interface ToolApprovalDecision {
  /** Whether the tool is allowed to run. */
  allow: boolean;
  /** When blocked, the reason surfaced to the agent as the tool result. */
  reason?: string;
}

/**
 * Host-supplied gate consulted before each tool executes. The host decides
 * (possibly by prompting the user) whether the call may proceed. `signal` is
 * the agent turn's abort signal, so the host can stop waiting if the turn is
 * cancelled before the user responds.
 */
export interface ToolApprovalBridge {
  decide(req: ToolApprovalRequest, signal?: AbortSignal): Promise<ToolApprovalDecision>;
}

export interface SdkConfig {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var, then ~/.pi/agent/auth.json. */
  anthropicApiKey?: string;
  /** Working directory for the agent. Defaults to process.cwd(). */
  cwd?: string;
  /** Provider for the model, e.g. "anthropic". */
  provider?: string;
  /** Model ID to use, e.g. "claude-opus-4-5". */
  model?: string;
  /** Thinking/reasoning effort level. Only applies to models with reasoning support. */
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Pre-configured auth storage (creates one if not provided). */
  authStorage?: AuthStorage;
  /** Pre-configured model registry (creates one if not provided). */
  modelRegistry?: ModelRegistry;
  /** Additional custom tools to register with the agent (e.g., MCP tools). */
  customTools?: ToolDefinition[];
  /** Agent mode — controls base tool set ("agent" = full, "plan"/"ask" = read-only). Defaults to "agent". */
  mode?: Mode;
  /**
   * Optional gate consulted before each tool runs. When provided, the agent
   * pauses on every tool call until `decide()` resolves. Omit to run tools
   * without approval.
   */
  toolApproval?: ToolApprovalBridge;
}

/**
 * All events emitted by a managed session.
 */
export type SessionEvent = AgentSessionEvent;

export interface ContextUsage {
  /** Estimated context tokens used, or null if unknown. */
  tokens: number | null;
  /** Total context window size. */
  contextWindow: number;
  /** Usage as percentage of context window, or null if tokens is unknown. */
  percent: number | null;
  /**
   * Composition of the current context window, derived from the most recent
   * assistant request. Undefined until at least one assistant response exists.
   */
  breakdown?: ContextBreakdown;
}

export interface ContextBreakdown {
  /** Cached prefix reused this request (system prompt, tools, stable history). */
  cacheRead: number;
  /** Tokens newly written to cache this request. */
  cacheWrite: number;
  /** Fresh, uncached input tokens. */
  input: number;
  /** Tokens generated in the latest response. */
  output: number;
  /**
   * Estimated tokens for messages added after the last assistant response
   * (e.g. a queued user message not yet sent to the model).
   */
  pending: number;
}

export interface SessionTokenStats {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface ManagedSessionStats {
  sessionFile: string | null
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: SessionTokenStats
  cost: number
  contextUsage?: ContextUsage
}

export interface ManagedSessionHandle {
  /**
   * Send a prompt to the agent (non-blocking — events stream via events()).
   *
   * During streaming, you must specify `streamingBehavior` to indicate how to queue:
   * - "steer": Interrupt and redirect immediately
   * - "followUp": Wait until done, then process
   *
   * @param text - The prompt text
   * @param options - Optional settings for the prompt
   */
  prompt(text: string, options?: PromptOptions): Promise<void>
  /**
   * Queue a steering message while the agent is running.
   * Delivered after the current assistant turn finishes its tool calls.
   * Useful for redirecting mid-task.
   */
  steer(text: string): Promise<void>
  /**
   * Queue a follow-up message to be processed after the agent finishes.
   * Only delivered when agent has no more tool calls or steering messages.
   */
  followUp(text: string): Promise<void>
  /** Switch the model used for subsequent prompts. */
  setModel(provider: string, modelId: string): Promise<void>
  /** Set the thinking/reasoning effort level. Only affects reasoning-capable models. */
  setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"): void
  /** Path to the persisted session file, or undefined for in-memory sessions. */
  readonly sessionFile: string | undefined
  /**
   * Set a user-defined display name for the session. Persisted to the session
   * file (via a `session_info` entry) so resumed/listed sessions show the name.
   */
  setName(name: string): void
  /** Get the current user-defined session display name, or undefined if unset. */
  getName(): string | undefined
  /** Abort the current agent turn. */
  abort(): Promise<void>
  /** Dispose the session and free resources. */
  dispose(): void
  /**
   * Returns an async generator that yields all session events.
   * The generator stays alive across multiple prompts.
   * Breaking out of the loop or calling return() cleans up the subscription.
   */
  events(): AsyncGenerator<SessionEvent>
  /** List available slash commands (skills) for the current workspace. */
  getCommands(): SlashCommand[]
  /** Get current context window usage. Returns undefined if unavailable. */
  getContextUsage(): ContextUsage | undefined
  /** Compact the context window by summarizing conversation history. */
  compact(): Promise<void>
  /** Get the thinking/effort levels available for the current model. */
  getAvailableThinkingLevels(): string[]
  /** Get detailed session statistics including token usage and cost. */
  getSessionStats(): ManagedSessionStats
  /**
   * Replace the custom tools registered with this session.
   * New tools are immediately activated; removed tools are dropped.
   * Takes effect on the next agent turn.
   */
  setCustomTools(tools: ToolDefinition[]): void
  /**
   * Switch the agent mode. Re-applies the mode's base tool set (merged with any
   * workspace-supplied custom tools). Takes effect on the next agent turn.
   */
  setMode(mode: Mode): void
  /**
   * Branch the conversation at the Nth user message (0-indexed among user messages).
   * Returns the path of the new session JSONL file.
   * The caller is responsible for creating a new thread and opening the forked session.
   */
  fork(userMessageIndex: number): Promise<string>
}

/**
 * A normalized message block extracted from a JSONL session file.
 * Used to seed a new thread's DB records after a fork.
 */
export type HistoryBlock =
  | { role: "user"; content: string; createdAt: number }
  | {
      role: "assistant"
      content: string
      thinking: string
      model: string
      provider: string
      errorMessage?: string
      createdAt: number
    }
  | {
      role: "tool"
      toolCallId: string
      toolName: string
      toolArgs: string
      toolResult: string
      isError: boolean
      createdAt: number
    }
  | { role: "compaction"; createdAt: number }
