import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Directory name lamda uses for its config/data, both globally and per workspace. */
export const LAMDA_DIR_NAME = ".lamda"

/** Subdirectory (under a `.lamda` dir) that holds prompt template markdown files. */
const PROMPTS_SUBDIR = "prompts"

/** Lowercases and collapses non-alphanumeric runs to single dashes for use in a path segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "wt"
  )
}

/** Absolute directory for a workspace's worktrees: `~/.lamda/<workspace-name>`. */
export function lamdaWorktreesDir(workspaceName: string): string {
  return join(homedir(), LAMDA_DIR_NAME, slugify(workspaceName))
}

/**
 * Computes a unique absolute worktree path under
 * `~/.lamda/<workspace-name>/<worktree-name>`, using the branch as the worktree
 * name. For example, workspace `my-repo` and branch `feat/x` produce
 * `~/.lamda/my-repo/feat-x`. If that path already exists on disk, a numeric
 * suffix is appended (`-2`, `-3`, …).
 */
export function lamdaWorktreePath(
  workspaceName: string,
  branch: string,
): string {
  const base = slugify(branch)
  const dir = lamdaWorktreesDir(workspaceName)
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
