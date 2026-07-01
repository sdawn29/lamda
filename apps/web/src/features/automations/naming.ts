/**
 * Derive a short, human-readable automation name from its prompt. Used so users
 * never have to name an automation by hand — the name tracks the prompt.
 */
export function generateAutomationName(prompt: string): string {
  const firstLine = prompt.trim().split(/\r?\n/)[0]?.trim() ?? ""
  if (!firstLine) return "Untitled automation"

  const words = firstLine.split(/\s+/)
  let name = words.slice(0, 7).join(" ")
  // Drop trailing punctuation left dangling by the truncation.
  name = name.replace(/[\s.,;:!?-]+$/, "")
  if (name.length > 52) name = name.slice(0, 52).trimEnd()

  return name.charAt(0).toUpperCase() + name.slice(1)
}
