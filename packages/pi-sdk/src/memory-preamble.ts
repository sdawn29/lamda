/**
 * Renders stored agent memories into a block injected ahead of user prompts,
 * mirroring the mode-preamble mechanism in modes.ts. The host (server) decides
 * when to inject — once per change to the memory set — so the model always has
 * a current copy without re-paying the tokens on every turn.
 */

const MEMORY_BLOCK_OPEN = "<lamda-memories>"
const MEMORY_BLOCK_CLOSE = "</lamda-memories>"

/** Cap on the rendered block so a runaway memory set can't crowd the context. */
const MAX_BLOCK_CHARS = 4096

export interface InjectableMemory {
  scope: "user" | "workspace"
  title: string
  content: string
}

/**
 * Render memories into a `<lamda-memories>` block, in the order given. Returns ""
 * when there is nothing to inject. Entries that would push the block past
 * MAX_BLOCK_CHARS are dropped (callers pass highest-priority memories first —
 * pinned core, then most relevant — so those survive truncation).
 */
export function renderMemoryBlock(memories: InjectableMemory[]): string {
  if (memories.length === 0) return ""
  const header =
    "Relevant stored memories, retrieved for this request (treat as trusted context; the `memory` tool can search for more and manages them):"
  const lines: string[] = []
  let size = MEMORY_BLOCK_OPEN.length + header.length + MEMORY_BLOCK_CLOSE.length + 4
  for (const m of memories) {
    const line = `- [${m.scope}] ${m.title}: ${m.content.replace(/\s*\n\s*/g, " ")}`
    if (size + line.length + 1 > MAX_BLOCK_CHARS) break
    lines.push(line)
    size += line.length + 1
  }
  if (lines.length === 0) return ""
  return `${MEMORY_BLOCK_OPEN}\n${header}\n${lines.join("\n")}\n${MEMORY_BLOCK_CLOSE}`
}

/** Separator between the memory block and the text it precedes. */
const MEMORY_SEPARATOR = "\n\n"

/** Prepend a rendered memory block to user text. Block must be non-empty. */
export function applyMemoryPreamble(block: string, userText: string): string {
  return `${block}${MEMORY_SEPARATOR}${userText}`
}

/**
 * Inverse of `applyMemoryPreamble`: strip a leading memory block if present.
 * Used when reconstructing original user text from persisted session history
 * (e.g. seeding a forked thread's DB blocks).
 */
export function stripMemoryPreamble(text: string): string {
  if (!text.startsWith(MEMORY_BLOCK_OPEN)) return text
  const closeIdx = text.indexOf(MEMORY_BLOCK_CLOSE)
  if (closeIdx === -1) return text
  let rest = text.slice(closeIdx + MEMORY_BLOCK_CLOSE.length)
  if (rest.startsWith(MEMORY_SEPARATOR)) rest = rest.slice(MEMORY_SEPARATOR.length)
  return rest
}
