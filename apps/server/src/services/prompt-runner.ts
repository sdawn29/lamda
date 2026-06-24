import type { PromptOptions } from "@lamda/pi-sdk"
import { insertUserBlock } from "@lamda/db"
import type { AttachmentMetadata } from "@lamda/db"
import { store } from "../store.js"
import { ensureSessionEventHub } from "./session-service.js"
import { withInjections } from "./prompt-injection.js"
import { ensurePromptsFreshForText } from "./prompt-freshness.js"

export interface SendPromptOptions {
  /** Text persisted on the user message block. Defaults to `text`. */
  displayText?: string
  /** Attachment metadata to record on the user message block. */
  attachments?: AttachmentMetadata[]
  /** Images / streaming behaviour / template-expansion flags for the agent. */
  promptOptions?: PromptOptions
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
  const entry = store.get(sessionId)
  if (!entry) throw new Error(`Session ${sessionId} not found`)

  ensureSessionEventHub(sessionId, entry)

  insertUserBlock(entry.threadId, opts.displayText ?? text, opts.attachments)

  const injected = await withInjections(entry, text)
  // Kept so session-level self-healing can re-send the interrupted prompt.
  entry.lastPromptText = injected

  // Refresh prompt templates first when this is a `/command`, so a just-authored
  // prompt file resolves without a server restart.
  await ensurePromptsFreshForText(entry, opts.displayText ?? text)

  await entry.handle.prompt(injected, opts.promptOptions)
}
