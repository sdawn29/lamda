import { type Dirent, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Directory name lamda uses for its config/data, both globally and per workspace. */
export const LAMDA_DIR_NAME = ".lamda"

/** Subdirectory (under a `.lamda` dir) that holds prompt template markdown files. */
const PROMPTS_SUBDIR = "prompts"

/** Subdirectory (under a `.lamda` dir) that holds skill definitions. */
const SKILLS_SUBDIR = "skills"

/** Global `.lamda` subdirectory that holds per-mode prompt override files. */
const MODES_SUBDIR = "modes"

/** Global `.lamda` subdirectory that contains managed git worktrees. */
const WORKTREES_SUBDIR = "worktrees"

/** Keep only paths that currently exist and are directories. */
function existingDirs(dirs: string[]): string[] {
  return dirs.filter((dir) => {
    try {
      return existsSync(dir) && statSync(dir).isDirectory()
    } catch {
      return false
    }
  })
}

/** Best-effort `mkdir -p`; a read-only home dir can't break startup. */
function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Seeding is best-effort; an existing dir or absent feature still works.
  }
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

/** Absolute directory for a workspace's worktrees: `~/.lamda/worktrees/<workspace-name>`. */
export function lamdaWorktreesDir(workspaceName: string): string {
  return join(
    homedir(),
    LAMDA_DIR_NAME,
    WORKTREES_SUBDIR,
    slugify(workspaceName)
  )
}

/**
 * Computes a unique absolute worktree path under
 * `~/.lamda/worktrees/<workspace-name>/<worktree-name>`, using the branch as
 * the worktree name. For example, workspace `my-repo` and branch `feat/x`
 * produce `~/.lamda/worktrees/my-repo/feat-x`. If that path already exists on
 * disk, a numeric suffix is appended (`-2`, `-3`, …).
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

/** Absolute directory holding global per-mode prompt override files: `~/.lamda/modes`. */
export function lamdaModesDir(): string {
  return join(homedir(), LAMDA_DIR_NAME, MODES_SUBDIR)
}

/**
 * Workspace-local directory holding per-mode files: `<cwd>/.lamda/modes`. Modes
 * defined here are scoped to the workspace and take precedence over a global
 * mode of the same id (see {@link lamdaModesDir}).
 */
export function lamdaLocalModesDir(cwd: string): string {
  return join(cwd, LAMDA_DIR_NAME, MODES_SUBDIR)
}

/** Absolute path to a single global mode's prompt file: `~/.lamda/modes/<mode>.md`. */
export function lamdaModeFilePath(mode: string): string {
  return join(lamdaModesDir(), `${mode}.md`)
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
  return existingDirs([lamdaGlobalPromptsDir(), lamdaLocalPromptsDir(cwd)])
}

/** Global prompt-template directory: `~/.lamda/prompts`. */
export function lamdaGlobalPromptsDir(): string {
  return join(homedir(), LAMDA_DIR_NAME, PROMPTS_SUBDIR)
}

/** Workspace-local prompt-template directory: `<cwd>/.lamda/prompts`. */
export function lamdaLocalPromptsDir(cwd: string): string {
  return join(cwd, LAMDA_DIR_NAME, PROMPTS_SUBDIR)
}

/** Global skills directory: `~/.lamda/skills`. */
export function lamdaGlobalSkillsDir(): string {
  return join(homedir(), LAMDA_DIR_NAME, SKILLS_SUBDIR)
}

/** Workspace-local skills directory: `<cwd>/.lamda/skills`. */
export function lamdaLocalSkillsDir(cwd: string): string {
  return join(cwd, LAMDA_DIR_NAME, SKILLS_SUBDIR)
}

/**
 * Extra skill directories lamda layers on top of the Pi SDK defaults (`~/.pi`
 * and `<cwd>/.pi` skills), so model-invocable skills can live alongside lamda's
 * own config:
 *
 * 1. Global: `~/.lamda/skills`
 * 2. Per workspace: `<cwd>/.lamda/skills`
 *
 * Pass these as `additionalSkillPaths` so the SDK's skill loader discovers them
 * (direct `.md` children, or subdirectories containing a `SKILL.md`).
 *
 * Only directories that currently exist are returned: the loader records an
 * error diagnostic for any additional skill path that is missing, and these
 * dirs are optional, so we filter them out rather than surface that noise.
 */
export function lamdaSkillPaths(cwd: string): string[] {
  return existingDirs([lamdaGlobalSkillsDir(), lamdaLocalSkillsDir(cwd)])
}

/**
 * Create the global `~/.lamda/skills` directory so the path is always available
 * for the skill loader. Mirrors {@link ensurePromptsDir}: because
 * {@link lamdaSkillPaths} filters out dirs that don't exist when a session is
 * built, seeding the dir on startup means skills later dropped into it are
 * picked up by a resource reload without restarting the server. Best-effort: a
 * read-only home dir can't break startup.
 */
export function ensureSkillsDir(): void {
  ensureDir(lamdaGlobalSkillsDir())
}

/**
 * Create the global `~/.lamda/prompts` directory so the path is always
 * registered with a session's resource loader. Because the loader filters out
 * prompt dirs that don't exist when a session is built (see
 * {@link lamdaPromptTemplatePaths}), seeding the dir on startup means prompt
 * files later dropped into it are picked up by a resource reload without
 * restarting the server. Best-effort: a read-only home dir can't break startup.
 */
export function ensurePromptsDir(): void {
  ensureDir(lamdaGlobalPromptsDir())
}

/**
 * Fingerprint the markdown skills visible to a workspace under a single
 * `.lamda/skills` dir, derived from each skill's path and last-modified time.
 * Handles both skill shapes the SDK discovers: a direct `.md` child is one
 * skill; a subdirectory is a skill packaged around its `SKILL.md`. Best-effort
 * — unreadable dirs/files contribute nothing rather than throwing.
 */
/** Fingerprint parts (`path:mtime`) for the direct `.md` children of `dir`, sorted. */
function dirMdSignatureParts(dir: string): string[] {
  const parts: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return parts
  }
  for (const name of entries.sort()) {
    if (!name.endsWith(".md")) continue
    const file = join(dir, name)
    try {
      parts.push(`${file}:${statSync(file).mtimeMs}`)
    } catch {
      // Vanished between readdir and stat; just skip it.
    }
  }
  return parts
}

function skillDirSignatureParts(dir: string): string[] {
  const parts: string[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return parts
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // A packaged skill: track its SKILL.md so edits to the skill register.
      const skillMd = join(full, "SKILL.md")
      try {
        parts.push(`${skillMd}:${statSync(skillMd).mtimeMs}`)
      } catch {
        // No SKILL.md at this level; nothing to fingerprint.
      }
    } else if (entry.name.endsWith(".md")) {
      try {
        parts.push(`${full}:${statSync(full).mtimeMs}`)
      } catch {
        // Vanished between readdir and stat; just skip it.
      }
    }
  }
  return parts
}

/**
 * A cheap fingerprint of every prompt template and skill visible to a workspace
 * — global `~/.lamda/prompts` + `~/.lamda/skills` plus the workspace's
 * `<cwd>/.lamda/{prompts,skills}` — derived from each file's path and
 * last-modified time. The signature changes whenever a prompt or skill file is
 * added, edited, or removed, so callers can detect staleness and reload the
 * resource loader on demand rather than caching the resource set for the
 * lifetime of the server. Best-effort and non-recursive beyond one level —
 * unreadable dirs contribute nothing rather than throwing.
 */
export function promptTemplatesSignature(cwd: string): string {
  const parts: string[] = []
  for (const dir of [lamdaGlobalPromptsDir(), lamdaLocalPromptsDir(cwd)]) {
    parts.push(...dirMdSignatureParts(dir))
  }
  for (const dir of [lamdaGlobalSkillsDir(), lamdaLocalSkillsDir(cwd)]) {
    parts.push(...skillDirSignatureParts(dir))
  }
  return parts.join("|")
}
