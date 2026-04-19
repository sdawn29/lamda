import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

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
}

/**
 * All events emitted by a managed session.
 * Extends the pi-coding-agent AgentSessionEvent union with an sdk_error variant.
 */
export type SessionEvent =
  | AgentSessionEvent
  | { type: "sdk_error"; message: string };

export interface ContextUsage {
  /** Estimated context tokens used, or null if unknown. */
  tokens: number | null;
  /** Total context window size. */
  contextWindow: number;
  /** Usage as percentage of context window, or null if tokens is unknown. */
  percent: number | null;
}

export interface ManagedSessionHandle {
  /** Send a prompt to the agent (non-blocking — events stream via events()). */
  prompt(text: string): Promise<void>;
  /** Switch the model used for subsequent prompts. */
  setModel(provider: string, modelId: string): Promise<void>;
  /** Set the thinking/reasoning effort level. Only affects reasoning-capable models. */
  setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"): void;
  /** Path to the persisted session file, or undefined for in-memory sessions. */
  readonly sessionFile: string | undefined;
  /** Abort the current agent turn. */
  abort(): Promise<void>;
  /** Dispose the session and free resources. */
  dispose(): void;
  /**
   * Returns an async generator that yields all session events.
   * The generator stays alive across multiple prompts.
   * Breaking out of the loop or calling return() cleans up the subscription.
   */
  events(): AsyncGenerator<SessionEvent>;
  /** List available slash commands (skills) for the current workspace. */
  getCommands(): SlashCommand[];
  /** Get current context window usage. Returns undefined if unavailable. */
  getContextUsage(): ContextUsage | undefined;
  /** Compact the context window by summarizing conversation history. */
  compact(): Promise<void>;
}
