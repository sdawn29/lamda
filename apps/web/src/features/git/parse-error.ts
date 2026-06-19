export function parseApiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const stripped = message.replace(/^API \d+:\s*/, "")
  try {
    const parsed = JSON.parse(stripped) as { error?: string }
    return parsed.error ?? stripped
  } catch {
    return stripped
  }
}
