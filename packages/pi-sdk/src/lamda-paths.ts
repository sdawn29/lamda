import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Directory name lamda uses for its config/data, both globally and per workspace. */
export const LAMDA_DIR_NAME = ".lamda"

/** Subdirectory (under a `.lamda` dir) that holds prompt template markdown files. */
const PROMPTS_SUBDIR = "prompts"

/** Subdirectory (under the global `~/.lamda` dir) that holds git worktrees. */
const WORKTREES_SUBDIR = "worktrees"

/** Absolute path of the global worktrees directory: `~/.lamda/worktrees`. */
export function lamdaWorktreesDir(): string {
  return join(homedir(), LAMDA_DIR_NAME, WORKTREES_SUBDIR)
}

/** Lowercases and collapses non-alphanumeric runs to single dashes for use in a path segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "wt"
  )
}

/**
 * Computes a unique absolute worktree path under `~/.lamda/worktrees` for the
 * given repo name and branch, e.g. `~/.lamda/worktrees/my-repo-feat-x`. If that
 * path already exists on disk, a numeric suffix is appended (`-2`, `-3`, …) so
 * each worktree gets its own directory.
 */
export function lamdaWorktreePath(repoName: string, branch: string): string {
  const base = `${slugify(repoName)}-${slugify(branch)}`
  const dir = lamdaWorktreesDir()
  let candidate = join(dir, base)
  let counter = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${counter}`)
    counter += 1
  }
  return candidate
}

/**
 * Extra prompt-template directories lamda layers on top of the Pi SDK defaults
 * (`~/.pi/agent/prompts` and `<cwd>/.pi/prompts`):
 *
 * 1. Global: `~/.lamda/prompts`
 * 2. Per workspace: `<cwd>/.lamda/prompts`
 *
 * Pass these as `additionalPromptTemplatePaths` so `/`-commands resolve from
 * lamda's own directories.
 *
 * Only directories that currently exist are returned: the loader records an
 * error diagnostic for any additional prompt path that is missing, and these
 * dirs are optional, so we filter them out rather than surface that noise.
 */
export function lamdaPromptTemplatePaths(cwd: string): string[] {
  return [
    join(homedir(), LAMDA_DIR_NAME, PROMPTS_SUBDIR),
    join(cwd, LAMDA_DIR_NAME, PROMPTS_SUBDIR),
  ].filter((dir) => {
    try {
      return existsSync(dir) && statSync(dir).isDirectory()
    } catch {
      return false
    }
  })
}
