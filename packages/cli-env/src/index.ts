import { execFileSync } from "node:child_process";

const PATH_KEY = process.platform === "win32" ? "Path" : "PATH";

let resolvedLoginShellPath: string | undefined;

function fallbackPath(): string {
  const paths = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  const current = process.env[PATH_KEY] ?? process.env.PATH;
  if (current) paths.push(current);
  return Array.from(new Set(paths.flatMap((path) => path.split(":")).filter(Boolean))).join(":");
}

/**
 * Resolve a PATH suitable for GUI-launched desktop apps.
 *
 * Packaged Electron apps on macOS are not launched from an interactive shell, so
 * they usually inherit only /usr/bin:/bin:/usr/sbin:/sbin. Asking the user's
 * login shell for PATH picks up Homebrew, nvm, volta, fnm, mise, asdf, and other
 * shell-managed tool installs.
 */
export function getLoginShellPath(): string {
  if (resolvedLoginShellPath !== undefined) return resolvedLoginShellPath;

  if (process.platform === "win32") {
    resolvedLoginShellPath = process.env[PATH_KEY] ?? "";
    return resolvedLoginShellPath;
  }

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const output = execFileSync(shell, ["-l", "-c", 'printf "%s" "$PATH"'], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    resolvedLoginShellPath = output || fallbackPath();
  } catch {
    resolvedLoginShellPath = fallbackPath();
  }

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
