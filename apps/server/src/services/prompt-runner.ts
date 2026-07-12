import type { PromptOptions } from "@lamda/pi-sdk";
import { insertUserBlock, insertCheckpoint } from "@lamda/db";
import type { AttachmentMetadata } from "@lamda/db";
import { createShadowSnapshot, threadCheckpointRefName } from "@lamda/git";
import { store } from "../store.js";
import { ensureSessionEventHub } from "./session-service.js";
import { withInjections } from "./prompt-injection.js";
import { ensurePromptsFreshForText } from "./prompt-freshness.js";

export interface SendPromptOptions {
  /** Text persisted on the user message block. Defaults to `text`. */
  displayText?: string;
  /** Attachment metadata to record on the user message block. */
  attachments?: AttachmentMetadata[];
  /** Images / streaming behaviour / template-expansion flags for the agent. */
  promptOptions?: PromptOptions;
  /**
   * Client-generated id for the optimistic row this prompt originated from,
   * carried onto the persisted user block so the client can reconcile the two
   * by identity instead of by matching content.
   */
  clientId?: string;
}

/**
 * Core "send a prompt to the agent" path shared by the HTTP prompt route and the
 * automation runner. Persists the user block, applies mode/memory/file
 * injections, records `lastPromptText` for self-healing, refreshes `/command`
 * templates, then runs the turn. The returned promise resolves when the agent
 * finishes the turn (matching `handle.prompt` semantics) and rejects on failure
 * — callers decide whether to recover (route) or record an error (automation).
 */
export async function sendPrompt(
  sessionId: string,
  text: string,
  opts: SendPromptOptions = {},
): Promise<void> {
  const entry = store.get(sessionId);
  if (!entry) throw new Error(`Session ${sessionId} not found`);

  ensureSessionEventHub(sessionId, entry);

  const promptTime = Date.now();

  // Snapshot the working tree before the agent can touch it, so the
  // checkpoint reflects state as of this prompt. entry.cwd already resolves
  // to the thread's worktree path when it runs in one (see
  // session-service.createSessionForThread), so no separate DB lookup is
  // needed. Best-effort and silent: capture failures (non-git workspace, git
  // missing, etc.) must never block sending the prompt.
  try {
    const sha = await createShadowSnapshot(
      entry.cwd,
      threadCheckpointRefName(entry.threadId),
    );
    if (sha) {
      insertCheckpoint({
        threadId: entry.threadId,
        commitSha: sha,
        label: opts.displayText ?? text,
        createdAt: promptTime,
      });
    }
  } catch (err) {
    console.warn(
      `[checkpoint] capture failed for thread ${entry.threadId}:`,
      err,
    );
  }

  insertUserBlock(
    entry.threadId,
    opts.displayText ?? text,
    opts.attachments,
    promptTime,
    opts.clientId,
  );

  const injected = await withInjections(entry, text);
  // Kept so session-level self-healing can re-send the interrupted prompt.
  entry.lastPromptText = injected;

  // Refresh prompt templates first when this is a `/command`, so a just-authored
  // prompt file resolves without a server restart.
  await ensurePromptsFreshForText(entry, opts.displayText ?? text);

  await entry.handle.prompt(injected, opts.promptOptions);
}
