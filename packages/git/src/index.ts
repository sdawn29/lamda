import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      ["--no-optional-locks", "diff", "--numstat", "HEAD"],
      { cwd, timeout: 5000 },
    );
    return stdout;
  } catch {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["--no-optional-locks", "diff", "--cached", "--numstat", "--root", EMPTY_TREE_HASH],
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

/**
 * Lists every file git considers part of the working tree: tracked files plus
 * untracked-but-not-ignored files (`-c -o --exclude-standard`). `.gitignore` is
 * respected natively, so `node_modules` and other ignored paths are excluded for
 * free. Paths are workspace-relative, "/"-separated. Returns [] if not a repo.
 */
export async function listWorkspaceFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "-c", "-o", "--exclude-standard", "-z"],
      { cwd, timeout: 15000, maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
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
 *  directory entry, which would break diffing and staging.
 *  --no-optional-locks prevents git from refreshing the stat cache in .git/index,
 *  which would otherwise trigger the fs.watcher → broadcast → refetch feedback loop. */
export async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["--no-optional-locks", "status", "--short", "-uall"],
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
  // --no-optional-locks: prevent stat-cache writes to .git/index that would
  // re-trigger the fs.watcher → broadcast → refetch feedback loop.
  const args = isUntracked
    ? ["--no-optional-locks", "diff", "--no-index", "--", "/dev/null", filePath]
    : ["--no-optional-locks", "diff", "HEAD", "--", filePath];
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
    return "";
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

/** Fetches from the remote without merging: `git fetch`. */
export async function gitFetch(cwd: string): Promise<void> {
  await execFileAsync("git", ["fetch"], { cwd, timeout: 30000 });
}

/** Pulls from the remote (fetch + merge): `git pull`. */
export async function gitPull(cwd: string): Promise<void> {
  await execFileAsync("git", ["pull"], { cwd, timeout: 30000 });
}

/**
 * Returns structured git log output. Each line is pipe-delimited:
 * fullSha|shortSha|authorName|authorDate(ISO)|subject
 */
export async function gitLog(cwd: string, maxCount = 50): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--pretty=format:%H|%h|%an|%ai|%s", `-${maxCount}`],
      { cwd, timeout: 10000 },
    );
    return stdout;
  } catch {
    return "";
  }
}

/** Returns the list of files changed in a single commit with their status codes. */
export async function gitShowFiles(
  cwd: string,
  sha: string,
): Promise<{ path: string; status: string; added: number; removed: number }[]> {
  try {
    const [nameStatusResult, numstatResult] = await Promise.all([
      execFileAsync("git", ["diff-tree", "--no-commit-id", "-r", "--name-status", sha], {
        cwd,
        timeout: 10000,
      }),
      execFileAsync("git", ["diff-tree", "--no-commit-id", "-r", "--numstat", sha], {
        cwd,
        timeout: 10000,
      }),
    ])

    const statMap = new Map<string, { added: number; removed: number }>()
    for (const line of numstatResult.stdout.trim().split("\n").filter(Boolean)) {
      const parts = line.split("\t")
      const added = parseInt(parts[0] ?? "0", 10)
      const removed = parseInt(parts[1] ?? "0", 10)
      // for renamed files numstat uses the new path as the last tab-separated field
      const path = parts.length > 2 ? (parts[parts.length - 1] ?? "") : (parts[1] ?? "")
      if (path) {
        statMap.set(path, { added: isNaN(added) ? 0 : added, removed: isNaN(removed) ? 0 : removed })
      }
    }

    return nameStatusResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t")
        const rawStatus = parts[0] ?? "M"
        // Normalize R100/C100 → R/C; use the new (last) path for renames/copies
        const status = rawStatus[0] ?? "M"
        const path = parts.length > 2 ? (parts[parts.length - 1] ?? "") : (parts[1] ?? "")
        const stat = statMap.get(path) ?? { added: 0, removed: 0 }
        return { status, path, ...stat }
      })
  } catch {
    return []
  }
}

/** Returns the unified diff for a single file within a specific commit. */
export async function gitShowFileDiff(
  cwd: string,
  sha: string,
  filePath: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff-tree", "-p", "--no-commit-id", "-U3", sha, "--", filePath],
      { cwd, timeout: 10000 },
    )
    return stdout
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "stdout" in err &&
      typeof (err as { stdout?: unknown }).stdout === "string"
    ) {
      return (err as { stdout: string }).stdout
    }
    return ""
  }
}

/** Returns the unified diff for a single commit: `git show --unified=3 <sha>`. */
export async function gitShow(cwd: string, sha: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["show", "--unified=3", sha],
      { cwd, timeout: 10000 },
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

/**
 * Returns how many commits the current branch is ahead of and behind its upstream.
 * Returns null when no upstream is configured.
 */
export async function getAheadBehind(
  cwd: string,
): Promise<{ ahead: number; behind: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--left-right", "--count", "@{u}...HEAD"],
      { cwd, timeout: 5000 },
    );
    const parts = stdout.trim().split("\t");
    const behind = parseInt(parts[0] ?? "0", 10);
    const ahead = parseInt(parts[1] ?? "0", 10);
    return { ahead: isNaN(ahead) ? 0 : ahead, behind: isNaN(behind) ? 0 : behind };
  } catch {
    return null;
  }
}

/**
 * Returns the content of a file as it existed at a given ref (e.g. "HEAD" or a
 * stash/commit sha): `git show <ref>:<path>`. Returns null if the file does not
 * exist at that ref or the ref is unreadable.
 */
export async function gitFileAtRef(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["--no-optional-locks", "show", `${ref}:${filePath}`],
      { cwd, timeout: 10000, maxBuffer: 50 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Produces a unified diff between two in-memory file versions, labeled with the
 * file path. Used for per-turn diffs where the pre/post content is reconstructed
 * from stored snapshots rather than live git refs (newly-created files are never
 * present in `git stash create` checkpoints, so a ref-to-ref diff can't be used).
 * Returns "" when the two versions are identical.
 */
export async function gitDiffContents(
  preText: string,
  postText: string,
  filePath: string,
): Promise<string> {
  if (preText === postText) return "";
  const dir = await mkdtemp(join(tmpdir(), "lamda-turndiff-"));
  const preFile = join(dir, "pre");
  const postFile = join(dir, "post");
  try {
    await writeFile(preFile, preText);
    await writeFile(postFile, postText);
    let raw = "";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--no-index", "--no-color", "--", preFile, postFile],
        { timeout: 10000, maxBuffer: 50 * 1024 * 1024 },
      );
      raw = stdout;
    } catch (err: unknown) {
      // git diff --no-index exits 1 when files differ — that's the expected path.
      if (
        err &&
        typeof err === "object" &&
        "stdout" in err &&
        typeof (err as { stdout?: unknown }).stdout === "string"
      ) {
        raw = (err as { stdout: string }).stdout;
      }
    }
    // Relabel the temp-file paths in the diff header with the real file path.
    return raw
      .split("\n")
      .map((line) => {
        if (line.startsWith("diff --git "))
          return `diff --git a/${filePath} b/${filePath}`;
        if (line.startsWith("--- ") && line !== "--- /dev/null")
          return `--- a/${filePath}`;
        if (line.startsWith("+++ ") && line !== "+++ /dev/null")
          return `+++ b/${filePath}`;
        return line;
      })
      .join("\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

/**
 * Creates a stash object for the current working tree state WITHOUT modifying
 * the working tree or index. Returns the stash SHA, or empty string if the
 * working tree is clean (nothing to checkpoint).
 */
export async function gitStashCreate(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["stash", "create"], {
      cwd,
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Registers a stash object (from gitStashCreate) into the stash list with a
 * given message. No-op if sha is empty.
 */
export async function gitStashStore(cwd: string, sha: string, message: string): Promise<void> {
  if (!sha) return;
  await execFileAsync("git", ["stash", "store", "-m", message, sha], {
    cwd,
    timeout: 10000,
  });
}

/**
 * Restores a specific file from a stash object back to the pre-stash working
 * tree state. The stash commit's own tree holds the working-tree snapshot;
 * stash^2 is the index snapshot and would miss unstaged changes for " M" files.
 */
export async function gitRestoreFileFromRef(cwd: string, ref: string, filePath: string): Promise<void> {
  await execFileAsync("git", ["checkout", ref, "--", filePath], {
    cwd,
    timeout: 10000,
  });
}
