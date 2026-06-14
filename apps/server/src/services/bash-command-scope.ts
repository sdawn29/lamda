/**
 * Derive the approval "scope" for a bash command — the unit a remembered
 * (Always allow / Don't allow) decision applies to. Rather than gating the whole
 * `bash` tool, decisions are keyed to the leading command:
 *
 *   `git status -sb`      → `git status`   (program + subcommand)
 *   `npm run build`       → `npm run`
 *   `ls -la`              → `ls`           (no subcommand → program)
 *   `cd x && npm install` → exact string   (compound → never reduced)
 *
 * Compound/complex commands (pipes, chains, substitutions, redirects) can't be
 * safely reduced to a prefix, so they match exactly and a broad rule never leaks.
 */

// Shell operators that make a command "complex" — if any appear, we don't trust
// a simple prefix and fall back to exact-string matching.
const SHELL_METACHARS = /[;&|<>`$(){}]|\n/;

// A token that reads like a subcommand: a bare word, not a flag, path, or filename.
const SUBCOMMAND = /^[a-zA-Z][a-zA-Z0-9:_-]*$/;

export interface BashScope {
  /** Stable key for storing/looking up the decision. */
  key: string;
  /** Human-readable label shown in the approval UI (what "Always" remembers). */
  label: string;
}

export function bashCommandScope(rawCommand: string): BashScope {
  const command = rawCommand.trim();
  if (!command) return { key: "", label: "bash" };

  if (SHELL_METACHARS.test(command)) {
    return { key: command, label: command };
  }

  const tokens = command.split(/\s+/);
  let i = 0;
  // Skip leading `VAR=value` assignments and a `sudo` prefix.
  while (i < tokens.length && (/^\w+=/.test(tokens[i]) || tokens[i] === "sudo")) {
    i++;
  }

  const program = tokens[i];
  if (!program) return { key: command, label: command };

  const next = tokens[i + 1];
  const scope = next != null && SUBCOMMAND.test(next) ? `${program} ${next}` : program;
  return { key: scope, label: scope };
}
