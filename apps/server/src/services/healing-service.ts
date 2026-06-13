import { getSetting, getThread, insertMemory } from "@lamda/db";
import { normalizeMode } from "@lamda/pi-sdk";
import { store } from "../store.js";
import {
  sessionEvents,
  setAgentTurnObserver,
  setSessionCrashObserver,
  type AgentTurnEndInfo,
  type SessionCrashInfo,
} from "../session-events.js";
import { openSessionForThread } from "./session-service.js";

// ── Config ──────────────────────────────────────────────────────────────────────

export interface HealingConfig {
  enabled: boolean;
  maxAttempts: number;
}

const DEFAULTS: HealingConfig = { enabled: false, maxAttempts: 2 };

export function getHealingConfig(): HealingConfig {
  const raw = getSetting("healing");
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<HealingConfig>;
    const maxAttempts =
      typeof parsed.maxAttempts === "number" && parsed.maxAttempts > 0
        ? Math.min(Math.floor(parsed.maxAttempts), 5)
        : DEFAULTS.maxAttempts;
    return {
      enabled: parsed.enabled === true,
      maxAttempts,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Errors the agent cannot fix from inside the workspace — re-prompting only
 * burns tokens. Auth/billing/rate-limit failures are surfaced to the user
 * through the existing retryable error UI instead.
 */
const NON_HEALABLE =
  /rate.?limit|overloaded|quota|insufficient|billing|payment|api.?key|unauthorized|forbidden|\b401\b|\b403\b|\b429\b/i;

// ── State ───────────────────────────────────────────────────────────────────────

/** Per-thread healing attempt tracking; cleared on success or abort. */
const turnState = new Map<string, { attempts: number; lastError: string }>();

/** Session-recovery guards. */
const recoveryInFlight = new Set<string>();
const lastRecoveryAt = new Map<string, number>();
const RECOVERY_COOLDOWN_MS = 60_000;

/** Delay before re-prompting so agent_end side effects settle first. */
const HEALING_DELAY_MS = 500;

// ── Registration ────────────────────────────────────────────────────────────────

export function registerHealingHooks(): void {
  setAgentTurnObserver(onAgentTurnEnd);
  setSessionCrashObserver(onSessionCrash);
}

// ── Turn-level healing ───────────────────────────────────────────────────────────

function onAgentTurnEnd(info: AgentTurnEndInfo): void {
  const { sessionId, threadId, outcome, errorMessage } = info;

  // A user abort is never a failure to heal.
  if (outcome === "aborted") {
    turnState.delete(threadId);
    return;
  }

  if (outcome === "success") {
    const prior = turnState.get(threadId);
    if (prior && prior.attempts > 0) {
      recordHealingSuccess(sessionId, prior.lastError);
      sessionEvents.emitHealingStatus(sessionId, { type: "auto_retry_end", success: true });
    }
    turnState.delete(threadId);
    return;
  }

  // outcome === "error"
  const cfg = getHealingConfig();
  const message = errorMessage ?? "Unknown error";
  if (!cfg.enabled || NON_HEALABLE.test(message)) {
    turnState.delete(threadId);
    return;
  }
  // Only the full agent mode can run tools to actually fix things.
  if (normalizeMode(getThread(threadId)?.mode) !== "agent") {
    turnState.delete(threadId);
    return;
  }

  const attempts = (turnState.get(threadId)?.attempts ?? 0) + 1;
  if (attempts > cfg.maxAttempts) {
    sessionEvents.emitHealingStatus(sessionId, {
      type: "auto_retry_end",
      success: false,
      finalError: message,
    });
    turnState.delete(threadId);
    return;
  }

  turnState.set(threadId, { attempts, lastError: message });
  sessionEvents.emitHealingStatus(sessionId, {
    type: "auto_retry_start",
    attempt: attempts,
    errorMessage: `Self-healing attempt ${attempts}/${cfg.maxAttempts}: ${message}`,
  });

  setTimeout(() => {
    // The user may have already followed up, or the session may have been
    // rebuilt — re-fetch the handle and bail if a turn is already running.
    if (sessionEvents.getStatus(sessionId).isRunning) return;
    const handle = store.get(sessionId)?.handle;
    if (!handle) return;
    handle.prompt(buildHealingPrompt(message)).catch((err: unknown) => {
      sessionEvents.emitError(sessionId, err instanceof Error ? err.message : String(err));
    });
  }, HEALING_DELAY_MS);
}

function buildHealingPrompt(error: string): string {
  return (
    "Your previous turn ended with this error:\n\n" +
    "```\n" +
    error +
    "\n```\n\n" +
    "Diagnose the most likely cause and fix it, then continue and complete the " +
    "original task. If it cannot be fixed from inside this workspace (e.g. it is " +
    "an external service, credential, or quota problem), explain why briefly and stop."
  );
}

function recordHealingSuccess(sessionId: string, error: string): void {
  const workspaceId = store.get(sessionId)?.workspaceId;
  if (!workspaceId) return;
  const firstLine = error.split("\n")[0].slice(0, 80);
  try {
    insertMemory({
      scope: "workspace",
      workspaceId,
      source: "healing",
      title: `Recovered from: ${firstLine}`,
      content:
        `A turn failed with this error:\n${error}\n\n` +
        "It was resolved by a self-healing retry that asked the agent to diagnose " +
        "and fix the problem. If this recurs, check the fix applied in that recovery turn.",
    });
  } catch {
    // recording a lesson must never break healing
  }
}

// ── Session-level recovery ───────────────────────────────────────────────────────

function onSessionCrash(info: SessionCrashInfo): void {
  const cfg = getHealingConfig();
  const resendText =
    cfg.enabled && info.wasRunning ? store.get(info.sessionId)?.lastPromptText : undefined;
  void recoverSession(info.sessionId, { resendText });
}

/**
 * Rebuild a crashed session's handle from its persisted session file, keeping
 * the same sessionId and event hub so connected clients never notice. Optionally
 * re-sends an interrupted prompt. Returns true when the handle was rebuilt.
 */
export async function recoverSession(
  sessionId: string,
  opts: { resendText?: string } = {},
): Promise<boolean> {
  if (recoveryInFlight.has(sessionId)) return false;
  if (Date.now() - (lastRecoveryAt.get(sessionId) ?? 0) < RECOVERY_COOLDOWN_MS) return false;

  const entry = store.get(sessionId);
  if (!entry) return false;
  const thread = getThread(entry.threadId);
  if (!thread?.sessionFile) return false;

  recoveryInFlight.add(sessionId);
  try {
    const newHandle = await openSessionForThread(
      entry.threadId,
      thread.sessionFile,
      entry.cwd,
      entry.workspaceId,
    );
    store.replaceHandle(sessionId, newHandle);
    sessionEvents.reattach(sessionId, newHandle);
    lastRecoveryAt.set(sessionId, Date.now());

    if (opts.resendText) {
      // The user block already exists from the original prompt — don't re-insert.
      await newHandle.prompt(opts.resendText).catch((err: unknown) => {
        sessionEvents.emitError(sessionId, err instanceof Error ? err.message : String(err));
      });
    }
    return true;
  } catch (err) {
    sessionEvents.emitError(
      sessionId,
      "Session recovery failed: " + (err instanceof Error ? err.message : String(err)),
    );
    return false;
  } finally {
    recoveryInFlight.delete(sessionId);
  }
}
