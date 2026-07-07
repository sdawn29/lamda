// Shared parser for `.lamda` markdown config files (modes, agents): a YAML-ish
// frontmatter block followed by a markdown body.
//
//   ---
//   name: Explore
//   description: Fast read-only codebase scout.
//   tools: [read, grep, find, ls]
//   ---
//
//   You are a read-only exploration agent. ...
//
// Only the small subset these files need is supported — scalar strings,
// booleans, and inline `[a, b, c]` lists — rather than pulling in a YAML
// dependency. Callers map the raw key/value pairs onto their own config shape.

/** Raw frontmatter fields (key → trimmed value) plus the markdown body. */
export interface ParsedFrontmatter {
  fields: Map<string, string>;
  body: string;
}

/** Strip a single layer of matching single/double quotes, if present. */
export function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse an inline `[a, b, c]` (or bare `a, b, c`) list into trimmed strings. */
export function parseList(value: string): string[] {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0);
}

/**
 * Split a markdown file into its frontmatter fields and body. A file without a
 * leading `---` block yields empty fields and the whole (trimmed) text as body.
 * Comment lines (`#`) and lines without a `:` are skipped; values keep their
 * quotes — use {@link unquote}/{@link parseList} when mapping fields.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const text = raw.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { fields: new Map(), body: text.trim() };

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) fields.set(key, value);
  }
  return { fields, body: text.slice(match[0].length).trim() };
}
