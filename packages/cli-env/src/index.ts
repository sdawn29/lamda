import { execFileSync } from "node:child_process";

const PATH_KEY = process.platform === "win32" ? "Path" : "PATH";

// Standard locations for CLI tools on macOS/Linux. Always unioned into the
// resolved PATH so Homebrew-installed binaries (gh, glab, …) are found even when
// the shell probe returns an incomplete PATH or fails entirely.
const STANDARD_UNIX_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

// Brackets the PATH the login shell prints so any stdout noise from rc files
// (banners, version-manager chatter) can be stripped before/after the markers.
const PATH_MARKER = "__LAMDA_CLI_ENV_PATH__";

let resolvedLoginShellPath: string | undefined;

/** Join PATH fragments, splitting on ":" and dropping empties/duplicates (first wins). */
function dedupePath(...parts: Array<string | undefined>): string {
  return Array.from(
    new Set(
      parts
        .filter((part): part is string => Boolean(part))
        .flatMap((part) => part.split(":"))
        .filter(Boolean),
    ),
  ).join(":");
}

/**
 * Resolve a PATH suitable for GUI-launched desktop apps.
 *
 * Packaged Electron apps on macOS are not launched from an interactive shell, so
 * they usually inherit only /usr/bin:/bin:/usr/sbin:/sbin. Asking the user's
 * login shell for PATH picks up Homebrew, nvm, volta, fnm, mise, asdf, and other
 * shell-managed tool installs.
 *
 * The probe runs an **interactive** login shell (`-ilc`): many users export
 * their PATH (including `brew shellenv`) from ~/.zshrc / ~/.bashrc, which a
 * non-interactive login shell does not source — so `-lc` alone silently misses
 * Homebrew. The standard bin dirs are always unioned in as a safety net for the
 * case where the probe returns an incomplete PATH or throws.
 */
export function getLoginShellPath(): string {
  if (resolvedLoginShellPath !== undefined) return resolvedLoginShellPath;

  if (process.platform === "win32") {
    resolvedLoginShellPath = process.env[PATH_KEY] ?? "";
    return resolvedLoginShellPath;
  }

  let shellPath: string | undefined;
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const script = `printf '${PATH_MARKER}%s${PATH_MARKER}' "$PATH"`;
    const output = execFileSync(shell, ["-ilc", script], {
      encoding: "utf8",
      timeout: 8_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const start = output.indexOf(PATH_MARKER);
    const end = output.indexOf(PATH_MARKER, start + PATH_MARKER.length);
    if (start !== -1 && end !== -1) {
      shellPath = output.slice(start + PATH_MARKER.length, end);
    }
  } catch {
    // Fall through: the standard dirs + current PATH still give a usable value.
  }

  resolvedLoginShellPath = dedupePath(
    shellPath,
    ...STANDARD_UNIX_BIN_DIRS,
    process.env[PATH_KEY] ?? process.env.PATH,
  );

  return resolvedLoginShellPath;
}

export function createCliEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env[PATH_KEY] = getLoginShellPath();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}
