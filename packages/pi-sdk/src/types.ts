import type {
  AgentSessionEvent,
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";

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

/** Image content for prompts. */
export interface ImageContent {
  type: "image";
  source: {
    type: "base64" | "url";
    mediaType?: string;
    data: string;
    url?: string;
  };
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
}
