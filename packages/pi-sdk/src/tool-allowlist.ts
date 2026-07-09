/**
 * Tool-allowlist matching shared by modes and agents. An allowlist is a flat
 * array of tool names; an entry ending in `*` is a prefix glob — e.g.
 * `mcp__github__*` covers every tool from the "github" MCP server, including
 * tools the server adds later. Globs let a mode/agent trust a whole server
 * without pinning today's tool names; everything else matches exactly.
 */

/** True when allowlist `entry` covers the tool named `name`. */
export function toolAllowlistEntryMatches(
  entry: string,
  name: string,
): boolean {
  return entry.endsWith("*")
    ? name.startsWith(entry.slice(0, -1))
    : entry === name;
}

/** True when any allowlist entry covers the tool named `name`. */
export function isToolAllowed(
  name: string,
  allowlist: readonly string[],
): boolean {
  return allowlist.some((entry) => toolAllowlistEntryMatches(entry, name));
}

/**
 * Resolve an allowlist against the tool names actually available: glob
 * entries expand to their matches, exact entries pass through as-is (an
 * unavailable exact name is harmless downstream — the SDK ignores unknown
 * names when activating tools).
 */
export function expandToolAllowlist(
  allowlist: readonly string[],
  available: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const entry of allowlist) {
    if (entry.endsWith("*")) {
      const prefix = entry.slice(0, -1);
      for (const name of available) {
        if (name.startsWith(prefix)) out.add(name);
      }
    } else {
      out.add(entry);
    }
  }
  return [...out];
}
