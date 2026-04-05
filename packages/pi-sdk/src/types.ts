import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

/** SDK-agnostic model descriptor. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
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
}

/**
 * All events emitted by a managed session.
 * Extends the pi-coding-agent AgentSessionEvent union with an sdk_error variant.
 */
export type SessionEvent =
  | AgentSessionEvent
  | { type: "sdk_error"; message: string };

export interface ManagedSessionHandle {
  /** Send a prompt to the agent (non-blocking — events stream via events()). */
  prompt(text: string): Promise<void>;
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
}
