/**
 * Helpers for converting between the `Record<string, string>` env shape stored
 * on a workspace and the dotenv (`KEY=VALUE`) text format used for import,
 * export, and the raw editor.
 */

/**
 * Parse dotenv-style text into a key/value map. Tolerates blank lines, `#`
 * comments, an optional `export ` prefix, and single/double quoted values
 * (double quotes support `\n`, `\t`, `\"`, … escapes). Later keys win.
 */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line
    const eq = withoutExport.indexOf("=")
    if (eq === -1) continue

    const key = withoutExport.slice(0, eq).trim()
    if (!key) continue

    let value = withoutExport.slice(eq + 1).trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1)
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
      }
    } else {
      // Strip trailing inline comment from unquoted values (e.g. `FOO=bar # note`).
      const comment = value.indexOf(" #")
      if (comment !== -1) value = value.slice(0, comment).trim()
    }

    result[key] = value
  }
  return result
}

/** Serialize a key/value map into dotenv text, quoting values that need it. */
export function serializeEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join("\n")
}

function formatValue(value: string): string {
  if (value === "") return ""
  // Quote when the value has surrounding/embedded whitespace or characters that
  // would otherwise change the parse (#, =, quotes, newlines).
  if (/[\s#"'=]/.test(value)) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
    return `"${escaped}"`
  }
  return value
}
