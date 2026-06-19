import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Rejects values that git would interpret as an option flag. Even though every
 * call uses execFile (no shell), a leading-dash argument can be parsed by git as
 * an option (argument injection), e.g. a branch named `--upload-pack=...`.
 */
function assertNotOption(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${label}: must not start with '-'`);
  }
}

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
        [
          "--no-optional-locks",
          "diff",
          "--cached",
          "--numstat",
          "--root",
          EMPTY_TREE_HASH,
        ],
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

/** Derives a repository folder name from a clone URL (e.g. ".../foo.git" -> "foo"). */
export function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const lastSegment = trimmed.split(/[/:]/).filter(Boolean).pop();
  return lastSegment || "repository";
}

/**
 * Clones a repository into a subfolder named after the repository inside `dir`.
 * Returns the absolute path of the created clone directory.
 */
export async function gitClone(url: string, dir: string): Promise<string> {
  assertNotOption(url.trim(), "repository URL");
  const target = join(dir, repoNameFromUrl(url));
  // Restrict transports to ordinary remote protocols. Git's `ext::`/`fd::`
  // transports execute arbitrary shell commands for user-initiated clones, so an
  // attacker-supplied URL like `ext::sh -c <cmd>` would be remote code execution.
  // `--` ends option parsing so the URL can't be read as a flag.
  await execFileAsync(
    "git",
    [
      "-c",
      "protocol.ext.allow=never",
      "-c",
      "protocol.fd.allow=never",
      "clone",
      "--",
      url,
      target,
    ],
    {
      cwd: dir,
      timeout: 60000,
      env: { ...process.env, GIT_ALLOW_PROTOCOL: "http:https:git:ssh:file" },
    },
  );
  return target;
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
  assertNotOption(branch, "branch");
  await execFileAsync("git", ["checkout", branch], { cwd, timeout: 10000 });
}

export async function createBranch(cwd: string, branch: string): Promise<void> {
  assertNotOption(branch, "branch");
  await execFileAsync("git", ["checkout", "-b", branch], {
    cwd,
    timeout: 10000,
  });
}

/** Deletes a local branch after it has been merged. */
export async function deleteBranch(cwd: string, branch: string): Promise<void> {
  assertNotOption(branch, "branch");
  await execFileAsync("git", ["branch", "--delete", "--", branch], {
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
  assertNotOption(ref, "stash ref");
  await execFileAsync("git", ["stash", "pop", ref], { cwd, timeout: 10000 });
}

/** Applies a stash without removing it: `git stash apply <ref>` */
export async function gitStashApply(cwd: string, ref: string): Promise<void> {
  assertNotOption(ref, "stash ref");
  await execFileAsync("git", ["stash", "apply", ref], { cwd, timeout: 10000 });
}

/** Drops a stash without applying it: `git stash drop <ref>` */
export async function gitStashDrop(cwd: string, ref: string): Promise<void> {
  assertNotOption(ref, "stash ref");
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
 * Returns structured git log output. Records are separated by \x1e and
 * fields by \x1f: fullSha, shortSha, authorName, authorDate(ISO), subject, body.
 * Control-character separators keep multi-line bodies parseable.
 */
export async function gitLog(cwd: string, maxCount = 50): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "log",
        "--pretty=format:%H%x1f%h%x1f%an%x1f%ai%x1f%s%x1f%b%x1e",
        `-${maxCount}`,
      ],
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
      execFileAsync(
        "git",
        ["diff-tree", "--no-commit-id", "-r", "--name-status", sha],
        {
          cwd,
          timeout: 10000,
        },
      ),
      execFileAsync(
        "git",
        ["diff-tree", "--no-commit-id", "-r", "--numstat", sha],
        {
          cwd,
          timeout: 10000,
        },
      ),
    ]);

    const statMap = new Map<string, { added: number; removed: number }>();
    for (const line of numstatResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)) {
      const parts = line.split("\t");
      const added = parseInt(parts[0] ?? "0", 10);
      const removed = parseInt(parts[1] ?? "0", 10);
      // for renamed files numstat uses the new path as the last tab-separated field
      const path =
        parts.length > 2 ? (parts[parts.length - 1] ?? "") : (parts[1] ?? "");
      if (path) {
        statMap.set(path, {
          added: isNaN(added) ? 0 : added,
          removed: isNaN(removed) ? 0 : removed,
        });
      }
    }

    return nameStatusResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const rawStatus = parts[0] ?? "M";
        // Normalize R100/C100 → R/C; use the new (last) path for renames/copies
        const status = rawStatus[0] ?? "M";
        const path =
          parts.length > 2 ? (parts[parts.length - 1] ?? "") : (parts[1] ?? "");
        const stat = statMap.get(path) ?? { added: 0, removed: 0 };
        return { status, path, ...stat };
      });
  } catch {
    return [];
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
    return {
      ahead: isNaN(ahead) ? 0 : ahead,
      behind: isNaN(behind) ? 0 : behind,
    };
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
export async function gitStashStore(
  cwd: string,
  sha: string,
  message: string,
): Promise<void> {
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
export async function gitRestoreFileFromRef(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<void> {
  assertNotOption(ref, "ref");
  await execFileAsync("git", ["checkout", ref, "--", filePath], {
    cwd,
    timeout: 10000,
  });
}

// ── Durable checkpoint refs ───────────────────────────────────────────────────
// Per-turn checkpoints are stash commit objects (from gitStashCreate). Left
// dangling they'd be reclaimed by `git gc`; parked under `refs/stash` they'd be
// vulnerable to `git stash clear/drop` and would pollute the user's stash list.
// Instead we anchor each one under a private ref namespace, which keeps the
// object durably reachable and invisible to ordinary git porcelain.

const CHECKPOINT_REF_PREFIX = "refs/lamda/checkpoints/";

/**
 * Anchor a checkpoint commit object under `refs/lamda/checkpoints/<sha>` so it
 * survives `git gc` and app restarts. No-op if sha is empty.
 */
export async function gitWriteCheckpointRef(
  cwd: string,
  sha: string,
): Promise<void> {
  if (!sha) return;
  await execFileAsync(
    "git",
    ["update-ref", `${CHECKPOINT_REF_PREFIX}${sha}`, sha],
    {
      cwd,
      timeout: 10000,
    },
  );
}

/** Remove a checkpoint ref so its object becomes eligible for GC. Best-effort. */
export async function gitDeleteCheckpointRef(
  cwd: string,
  sha: string,
): Promise<void> {
  if (!sha) return;
  await execFileAsync(
    "git",
    ["update-ref", "-d", `${CHECKPOINT_REF_PREFIX}${sha}`],
    {
      cwd,
      timeout: 10000,
    },
  ).catch(() => {});
}

/** List the checkpoint SHAs currently anchored in this repo. */
export async function gitListCheckpointRefs(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", CHECKPOINT_REF_PREFIX],
      { cwd, timeout: 5000 },
    );
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((ref) => ref.slice(CHECKPOINT_REF_PREFIX.length));
  } catch {
    return [];
  }
}

// ── Worktrees ─────────────────────────────────────────────────────────────────
// Each worktree is an additional working directory linked to the same repo,
// letting independent threads/agents edit in isolation without colliding. lamda
// stores them under ~/.lamda/worktrees/<workspace-name>/<worktree-name>.

export interface WorktreeInfo {
  /** Absolute path of the worktree's working directory. */
  path: string;
  /** Checked-out commit SHA, or "" for a bare entry. */
  head: string;
  /** Short branch name (e.g. "main"), or null when detached/bare. */
  branch: string | null;
  detached: boolean;
  locked: boolean;
}

/**
 * Creates a worktree at `worktreePath` checked out to a NEW branch `newBranch`
 * forked from `baseRef`: `git worktree add -b <newBranch> <worktreePath> <baseRef>`.
 * Creating a fresh branch sidesteps the "branch already checked out in another
 * worktree" restriction. Throws on failure (e.g. branch exists, dirty base).
 */
export async function addWorktree(
  repoCwd: string,
  worktreePath: string,
  newBranch: string,
  baseRef: string,
): Promise<void> {
  assertNotOption(newBranch, "branch");
  assertNotOption(baseRef, "base ref");
  assertNotOption(worktreePath, "worktree path");
  await execFileAsync(
    "git",
    ["worktree", "add", "-b", newBranch, "--", worktreePath, baseRef],
    { cwd: repoCwd, timeout: 30000 },
  );
}

/**
 * Lists the worktrees registered for this repo via `git worktree list
 * --porcelain`. Records are blank-line separated; each has `worktree <path>`,
 * an optional `HEAD <sha>`, `branch <refname>` / `detached`, and `locked`.
 * Returns [] if the command fails (e.g. not a repo).
 */
export async function listWorktrees(repoCwd: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: repoCwd, timeout: 5000 },
    );
    const worktrees: WorktreeInfo[] = [];
    let current: WorktreeInfo | null = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current) worktrees.push(current);
        current = {
          path: line.slice("worktree ".length),
          head: "",
          branch: null,
          detached: false,
          locked: false,
        };
      } else if (!current) {
        continue;
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        // e.g. "branch refs/heads/feat-x" → "feat-x"
        current.branch = line
          .slice("branch ".length)
          .replace(/^refs\/heads\//, "");
      } else if (line === "detached") {
        current.detached = true;
      } else if (line === "locked" || line.startsWith("locked ")) {
        current.locked = true;
      }
    }
    if (current) worktrees.push(current);
    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Removes a worktree: `git worktree remove [--force] -- <worktreePath>`.
 * `--force` is required when the worktree has uncommitted changes; callers
 * gate on that with a confirmation. Throws on failure.
 */
export async function removeWorktree(
  repoCwd: string,
  worktreePath: string,
  force = true,
): Promise<void> {
  assertNotOption(worktreePath, "worktree path");
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push("--", worktreePath);
  await execFileAsync("git", args, { cwd: repoCwd, timeout: 15000 });
}

/** Prunes worktree admin entries whose directories no longer exist. Best-effort. */
export async function pruneWorktrees(repoCwd: string): Promise<void> {
  await execFileAsync("git", ["worktree", "prune"], {
    cwd: repoCwd,
    timeout: 10000,
  }).catch(() => {});
}

/**
 * Starts a non-committing merge of `branch` into the branch currently checked
 * out in `repoCwd`. This first lets Git populate the index and report conflicts;
 * callers commit only after the conflict check passes. Returns true when a
 * merge commit is pending, or false when Git reports "already up to date".
 */
export async function mergeBranch(
  repoCwd: string,
  branch: string,
): Promise<boolean> {
  assertNotOption(branch, "branch");
  await execFileAsync(
    "git",
    ["merge", "--no-commit", "--no-ff", "--", branch],
    {
      cwd: repoCwd,
      timeout: 30000,
    },
  );
  return isMergeInProgress(repoCwd);
}

/** Whether Git currently has a merge commit waiting to be completed. */
export async function isMergeInProgress(repoCwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--verify", "-q", "MERGE_HEAD"], {
      cwd: repoCwd,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Resolves a ref to its commit SHA, returning null when it does not exist. */
export async function getRefSha(
  repoCwd: string,
  ref: string,
): Promise<string | null> {
  assertNotOption(ref, "ref");
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--verify", ref],
      { cwd: repoCwd, timeout: 5000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Whether `ancestorRef` is already contained in `descendantRef`. */
export async function isRefAncestor(
  repoCwd: string,
  ancestorRef: string,
  descendantRef = "HEAD",
): Promise<boolean> {
  assertNotOption(ancestorRef, "ancestor ref");
  assertNotOption(descendantRef, "descendant ref");
  try {
    await execFileAsync(
      "git",
      ["merge-base", "--is-ancestor", ancestorRef, descendantRef],
      { cwd: repoCwd, timeout: 10000 },
    );
    return true;
  } catch {
    return false;
  }
}

/** Returns repository-relative paths that are still unmerged. */
export async function listMergeConflicts(repoCwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--unmerged", "-z"],
    { cwd: repoCwd, timeout: 10000 },
  );
  const conflicts = new Set<string>();
  for (const record of stdout.split("\0")) {
    if (!record) continue;
    // `git ls-files -u` records are:
    // <mode> <object> <stage>\t<path>
    const separator = record.indexOf("\t");
    if (separator !== -1) conflicts.add(record.slice(separator + 1));
  }
  return [...conflicts];
}

/**
 * Resolves one conflicted path with the destination branch's version (`ours`)
 * or the incoming worktree branch's version (`theirs`), then stages it.
 */
export async function resolveMergeConflict(
  repoCwd: string,
  filePath: string,
  strategy: "ours" | "theirs",
): Promise<void> {
  let acceptedDeletion = false;
  try {
    await execFileAsync("git", ["checkout", `--${strategy}`, "--", filePath], {
      cwd: repoCwd,
      timeout: 10000,
    });
  } catch (error) {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--unmerged", "--", filePath],
      { cwd: repoCwd, timeout: 10000 },
    );
    const requiredStage = strategy === "ours" ? "2" : "3";
    const selectedSideExists = stdout
      .split("\n")
      .filter(Boolean)
      .some((line) => line.split(/\s+/, 4)[2] === requiredStage);
    if (selectedSideExists) throw error;

    // Modify/delete conflicts have no entry for the deleted side. Choosing that
    // side means accepting the deletion; other checkout failures are rethrown.
    await execFileAsync("git", ["rm", "-f", "--", filePath], {
      cwd: repoCwd,
      timeout: 10000,
    });
    acceptedDeletion = true;
  }
  if (acceptedDeletion) return;
  await execFileAsync("git", ["add", "-A", "--", filePath], {
    cwd: repoCwd,
    timeout: 10000,
  });
}

/**
 * Reads the working-tree contents of a conflicted file — i.e. the version git
 * wrote with `<<<<<<<` / `=======` / `>>>>>>>` markers — so it can be edited by
 * hand. Callers must validate `filePath` against {@link listMergeConflicts}.
 */
export async function readConflictedFile(
  repoCwd: string,
  filePath: string,
): Promise<string> {
  return readFile(join(repoCwd, filePath), "utf8");
}

/**
 * Writes a hand-resolved version of a conflicted file and stages it, marking the
 * conflict resolved. Callers must validate `filePath` against
 * {@link listMergeConflicts} first. The content is expected to be free of
 * conflict markers, but git does not enforce that here.
 */
export async function writeResolvedConflict(
  repoCwd: string,
  filePath: string,
  content: string,
): Promise<void> {
  await writeFile(join(repoCwd, filePath), content, "utf8");
  await execFileAsync("git", ["add", "-A", "--", filePath], {
    cwd: repoCwd,
    timeout: 10000,
  });
}

/** Completes an in-progress merge after every conflict has been staged. */
export async function continueMerge(repoCwd: string): Promise<void> {
  const conflicts = await listMergeConflicts(repoCwd);
  if (conflicts.length > 0) {
    throw new Error("Resolve all merge conflicts before continuing");
  }
  await execFileAsync("git", ["commit", "--no-edit"], {
    cwd: repoCwd,
    timeout: 30000,
  });
}

/** Aborts an in-progress merge. No-op when no merge is active. */
export async function abortMerge(repoCwd: string): Promise<void> {
  await execFileAsync("git", ["merge", "--abort"], {
    cwd: repoCwd,
    timeout: 10000,
  }).catch(() => {});
}
