import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function parseNumstat(stdout: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const line of stdout.split("\n")) {
    const [added, deleted] = line.trim().split("\t");
    const addedCount = Number.parseInt(added ?? "", 10);
    const deletedCount = Number.parseInt(deleted ?? "", 10);

    if (!Number.isNaN(addedCount)) additions += addedCount;
    if (!Number.isNaN(deletedCount)) deletions += deletedCount;
  }

  return { additions, deletions };
}

async function getTrackedNumstat(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "HEAD"],
      { cwd, timeout: 5000 },
    );
    return stdout;
  } catch {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--cached", "--numstat", "--root", EMPTY_TREE_HASH],
        { cwd, timeout: 5000 },
      );
      return stdout;
    } catch {
      return "";
    }
  }
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd, timeout: 5000 },
    );
    return stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

async function getUntrackedNumstat(
  cwd: string,
  filePath: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-index", "--numstat", "--", "/dev/null", filePath],
      { cwd, timeout: 5000 },
    );
    return stdout;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "stdout" in err &&
      typeof (err as { stdout?: unknown }).stdout === "string"
    ) {
      return (err as { stdout: string }).stdout;
    }

    return "";
  }
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["branch", "--show-current"],
      { cwd, timeout: 3000 },
    );
    const branch = stdout.trim();
    if (branch) return branch;

    const symbolicRef = await execFileAsync(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      { cwd, timeout: 3000 },
    );
    return symbolicRef.stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, timeout: 3000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const root = await getRepoRoot(cwd);
  return root !== null;
}

/** Clones a repository to the specified directory. Returns the clone output. */
export async function gitClone(url: string, cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["clone", url, cwd],
    { cwd, timeout: 60000 },
  );
  return stdout;
}

export async function initGitRepo(cwd: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd, timeout: 10000 });
}

export async function listBranches(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["branch", "--format=%(refname:short)"],
      { cwd, timeout: 3000 },
    );
    const branches = stdout
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);
    if (branches.length > 0) return branches;

    const currentBranch = await getCurrentBranch(cwd);
    return currentBranch ? [currentBranch] : [];
  } catch {
    return [];
  }
}

export async function checkoutBranch(
  cwd: string,
  branch: string,
): Promise<void> {
  await execFileAsync("git", ["checkout", branch], { cwd, timeout: 10000 });
}

export async function createBranch(cwd: string, branch: string): Promise<void> {
  await execFileAsync("git", ["checkout", "-b", branch], {
    cwd,
    timeout: 10000,
  });
}

/** Returns raw `git status --short` output. Uses -uall so untracked files inside
 *  dot-folders (e.g. .claude/) are listed individually rather than as a single
 *  directory entry, which would break diffing and staging. */
export async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--short", "-uall"],
    { cwd, timeout: 5000 },
  );
  return stdout;
}

/**
 * Returns the unified diff for a single file.
 * For untracked files uses `git diff --no-index /dev/null <file>`.
 */
export async function gitFileDiff(
  cwd: string,
  filePath: string,
  statusCode: string,
): Promise<string> {
  const isUntracked = statusCode.trim() === "??" || statusCode.trim() === "U";
  const args = isUntracked
    ? ["diff", "--no-index", "--", "/dev/null", filePath]
    : ["diff", "HEAD", "--", filePath];
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 10000,
    });
    return stdout;
  } catch (err: unknown) {
    // git diff --no-index exits with code 1 when there are diffs — not a real error
    if (
      err &&
      typeof err === "object" &&
      "stdout" in err &&
      (err as { stdout: string }).stdout
    ) {
      return (err as { stdout: string }).stdout;
    }
    throw err;
  }
}

/** Stages `git add -A` then commits with the given message. Returns the git output. */
export async function gitCommit(cwd: string, message: string): Promise<string> {
  await execFileAsync("git", ["add", "-A"], { cwd, timeout: 10000 });
  const { stdout } = await execFileAsync("git", ["commit", "-m", message], {
    cwd,
    timeout: 10000,
  });
  return stdout;
}

/** Stages a single file: `git add -- <filePath>` */
export async function gitStage(cwd: string, filePath: string): Promise<void> {
  await execFileAsync("git", ["add", "--", filePath], { cwd, timeout: 5000 });
}

/** Unstages a single file: `git restore --staged -- <filePath>` */
export async function gitUnstage(cwd: string, filePath: string): Promise<void> {
  await execFileAsync("git", ["restore", "--staged", "--", filePath], {
    cwd,
    timeout: 5000,
  });
}

/** Stages all changes: `git add -A` */
export async function gitStageAll(cwd: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd, timeout: 10000 });
}

/** Unstages all changes: `git restore --staged .` */
export async function gitUnstageAll(cwd: string): Promise<void> {
  await execFileAsync("git", ["restore", "--staged", "."], {
    cwd,
    timeout: 10000,
  });
}

/**
 * Discards all changes to a file and restores it to HEAD.
 * - Tracked files (M/D/R/etc): `git restore --source=HEAD --staged --worktree`
 * - Staged-new files (A): unstages via `git restore --staged` (file stays on disk)
 * - Untracked files (??): no-op
 */
export async function gitRevertFile(
  cwd: string,
  filePath: string,
  raw: string,
): Promise<void> {
  const isUntracked = raw.trim() === "??";
  if (isUntracked) return;

  const X = raw[0] ?? " ";
  const isAddedOnly = X === "A" && (raw[1] ?? " ") === " ";

  if (isAddedOnly) {
    await execFileAsync("git", ["restore", "--staged", "--", filePath], {
      cwd,
      timeout: 5000,
    });
  } else {
    await execFileAsync(
      "git",
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", filePath],
      { cwd, timeout: 5000 },
    );
  }
}

/** Pushes a stash (includes untracked files with -u). */
export async function gitStash(cwd: string, message?: string): Promise<void> {
  const args = message
    ? ["stash", "push", "-u", "-m", message]
    : ["stash", "push", "-u"];
  await execFileAsync("git", args, { cwd, timeout: 10000 });
}

/** Returns raw `git stash list` output formatted as `ref<TAB>subject` lines. */
export async function gitStashList(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["stash", "list", "--format=%gd\t%s"],
      { cwd, timeout: 5000 },
    );
    return stdout;
  } catch {
    return "";
  }
}

/** Pops a stash: `git stash pop <ref>` */
export async function gitStashPop(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "pop", ref], { cwd, timeout: 10000 });
}

/** Applies a stash without removing it: `git stash apply <ref>` */
export async function gitStashApply(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "apply", ref], { cwd, timeout: 10000 });
}

/** Drops a stash without applying it: `git stash drop <ref>` */
export async function gitStashDrop(cwd: string, ref: string): Promise<void> {
  await execFileAsync("git", ["stash", "drop", ref], { cwd, timeout: 10000 });
}

/** Returns total insertions/deletions across all uncommitted changes, including untracked files. */
export async function gitDiffStat(
  cwd: string,
): Promise<{ additions: number; deletions: number }> {
  try {
    const [trackedNumstat, untrackedFiles] = await Promise.all([
      getTrackedNumstat(cwd),
      listUntrackedFiles(cwd),
    ]);

    const total = parseNumstat(trackedNumstat);

    const untrackedStats = await Promise.all(
      untrackedFiles.map(async (filePath) =>
        parseNumstat(await getUntrackedNumstat(cwd, filePath)),
      ),
    );

    for (const stat of untrackedStats) {
      total.additions += stat.additions;
      total.deletions += stat.deletions;
    }

    return total;
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

/** Pushes the current branch to its upstream: `git push`. */
export async function gitPush(cwd: string): Promise<void> {
  await execFileAsync("git", ["push"], { cwd, timeout: 30000 });
}

/** Returns the full staged diff (`git diff --cached`). */
export async function gitStagedDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--cached"], {
      cwd,
      timeout: 10000,
    });
    return stdout;
  } catch {
    return "";
  }
}
