import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd, timeout: 3000 }
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function getRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, timeout: 3000 }
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const root = await getRepoRoot(cwd)
  return root !== null
}

export async function listBranches(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["branch", "--format=%(refname:short)"],
      { cwd, timeout: 3000 }
    )
    return stdout.split("\n").map((b) => b.trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
  await execFileAsync("git", ["checkout", branch], { cwd, timeout: 10000 })
}

/** Returns raw `git status --short` output. */
export async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd, timeout: 5000 })
  return stdout
}

/**
 * Returns the unified diff for a single file.
 * For untracked files uses `git diff --no-index /dev/null <file>`.
 */
export async function gitFileDiff(
  cwd: string,
  filePath: string,
  statusCode: string
): Promise<string> {
  const isUntracked = statusCode.trim() === "??" || statusCode.trim() === "U"
  const args = isUntracked
    ? ["diff", "--no-index", "--", "/dev/null", filePath]
    : ["diff", "HEAD", "--", filePath]
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10000 })
    return stdout
  } catch (err: unknown) {
    // git diff --no-index exits with code 1 when there are diffs — not a real error
    if (err && typeof err === "object" && "stdout" in err && (err as { stdout: string }).stdout) {
      return (err as { stdout: string }).stdout
    }
    throw err
  }
}

/** Stages `git add -A` then commits with the given message. Returns the git output. */
export async function gitCommit(cwd: string, message: string): Promise<string> {
  await execFileAsync("git", ["add", "-A"], { cwd, timeout: 10000 })
  const { stdout } = await execFileAsync("git", ["commit", "-m", message], { cwd, timeout: 10000 })
  return stdout
}

/** Stages a single file: `git add -- <filePath>` */
export async function gitStage(cwd: string, filePath: string): Promise<void> {
  await execFileAsync("git", ["add", "--", filePath], { cwd, timeout: 5000 })
}

/** Unstages a single file: `git restore --staged -- <filePath>` */
export async function gitUnstage(cwd: string, filePath: string): Promise<void> {
  await execFileAsync("git", ["restore", "--staged", "--", filePath], { cwd, timeout: 5000 })
}

/** Stages all changes: `git add -A` */
export async function gitStageAll(cwd: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd, timeout: 10000 })
}

/** Unstages all changes: `git restore --staged .` */
export async function gitUnstageAll(cwd: string): Promise<void> {
  await execFileAsync("git", ["restore", "--staged", "."], { cwd, timeout: 10000 })
}

/** Pushes a stash (includes untracked files with -u). */
export async function gitStash(cwd: string, message?: string): Promise<void> {
  const args = message
    ? ["stash", "push", "-u", "-m", message]
    : ["stash", "push", "-u"]
  await execFileAsync("git", args, { cwd, timeout: 10000 })
}

/** Returns raw `git stash list` output formatted as `ref<TAB>subject` lines. */
export async function gitStashList(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["stash", "list", "--format=%gd\t%s"],
      { cwd, timeout: 5000 }
    )
    return stdout
  } catch {
    return ""
  }
}

/** Pops a stash: `git stash pop <ref>` */
export async function gitStashPop(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "pop", ref], { cwd, timeout: 10000 })
}

/** Applies a stash without removing it: `git stash apply <ref>` */
export async function gitStashApply(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "apply", ref], { cwd, timeout: 10000 })
}

/** Drops a stash without applying it: `git stash drop <ref>` */
export async function gitStashDrop(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "drop", ref], { cwd, timeout: 10000 })
}
