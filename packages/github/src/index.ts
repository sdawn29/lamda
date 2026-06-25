import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Default timeout for `gh` invocations. GitHub network calls can be slow, so
 * this is more generous than the local git timeouts.
 */
const DEFAULT_TIMEOUT = 20000;

/**
 * Raised when a `gh` command exits non-zero for a reason the caller should
 * surface (e.g. failed PR creation). "Expected" failures — gh missing, not a
 * repo, not authenticated — are handled by returning null/empty instead.
 */
export class GhError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GhError";
  }
}

/**
 * Rejects values that `gh` would interpret as an option flag. Every call uses
 * execFile (no shell), but a leading-dash argument can still be parsed by gh as
 * an option (argument injection), e.g. a branch named `--upload-pack=...`.
 */
function assertNotOption(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${label}: must not start with '-'`);
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}: must be a positive integer`);
  }
}

interface GhRunResult {
  stdout: string;
  stderr: string;
}

function isExecError(
  err: unknown,
): err is { stdout?: string; stderr?: string; code?: number } {
  return typeof err === "object" && err !== null;
}

/**
 * Runs `gh` and returns stdout/stderr. Throws GhError on non-zero exit. Callers
 * that treat failure as a soft "no" (status/list) should catch and degrade.
 */
async function runGh(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<GhRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync("gh", args, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 16,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    if (isExecError(err)) {
      const stderr = typeof err.stderr === "string" ? err.stderr : "";
      const message = stderr.trim() || (err as Error).message || "gh command failed";
      throw new GhError(message, stderr);
    }
    throw new GhError("gh command failed", "");
  }
}

async function runGhJson<T>(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const { stdout } = await runGh(args, cwd, timeout);
  return JSON.parse(stdout) as T;
}

// ── Status & repo ────────────────────────────────────────────────────────────

export interface GhStatus {
  /** Whether the `gh` binary is on PATH. */
  installed: boolean;
  /** Whether `gh` has a valid auth session. */
  authenticated: boolean;
  /** The logged-in GitHub login (username), if authenticated. */
  login: string | null;
}

/**
 * Detects whether `gh` is installed and authenticated. Never throws — every
 * failure degrades to `installed: false` / `authenticated: false`. Drives both
 * the connection UI and whether the agent's github tools are registered.
 */
export async function getGhStatus(cwd: string): Promise<GhStatus> {
  try {
    await execFileAsync("gh", ["--version"], { cwd, timeout: 5000 });
  } catch {
    return { installed: false, authenticated: false, login: null };
  }

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      cwd,
      timeout: 5000,
    });
    if (!stdout.trim()) {
      return { installed: true, authenticated: false, login: null };
    }
  } catch {
    return { installed: true, authenticated: false, login: null };
  }

  let login: string | null = null;
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["api", "user", "--jq", ".login"],
      { cwd, timeout: 8000 },
    );
    login = stdout.trim() || null;
  } catch {
    // Authenticated but the lookup failed (offline, etc.) — still "connected".
  }

  return { installed: true, authenticated: true, login };
}

export interface GhRepoInfo {
  nameWithOwner: string;
  defaultBranch: string | null;
  url: string;
}

/**
 * Resolves the GitHub repo for `cwd` from its git remote. Returns null when the
 * directory isn't a GitHub-backed repo (no remote, gh missing, etc.).
 */
export async function getRepoInfo(cwd: string): Promise<GhRepoInfo | null> {
  try {
    const data = await runGhJson<{
      nameWithOwner: string;
      defaultBranchRef: { name: string } | null;
      url: string;
    }>(
      ["repo", "view", "--json", "nameWithOwner,defaultBranchRef,url"],
      cwd,
    );
    return {
      nameWithOwner: data.nameWithOwner,
      defaultBranch: data.defaultBranchRef?.name ?? null,
      url: data.url,
    };
  } catch {
    return null;
  }
}

// ── Pull requests ────────────────────────────────────────────────────────────

export type PrState = "open" | "closed" | "merged" | "all";

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  author: string | null;
  headRefName: string;
  baseRefName: string;
  url: string;
  updatedAt: string;
  createdAt: string;
}

const PR_LIST_FIELDS =
  "number,title,state,isDraft,author,headRefName,baseRefName,url,updatedAt,createdAt";

interface RawPrAuthor {
  login?: string;
}

function mapPrSummary(raw: {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  author: RawPrAuthor | null;
  headRefName: string;
  baseRefName: string;
  url: string;
  updatedAt: string;
  createdAt: string;
}): PullRequestSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    isDraft: raw.isDraft,
    author: raw.author?.login ?? null,
    headRefName: raw.headRefName,
    baseRefName: raw.baseRefName,
    url: raw.url,
    updatedAt: raw.updatedAt,
    createdAt: raw.createdAt,
  };
}

export async function listPullRequests(
  cwd: string,
  opts: { state?: PrState; limit?: number } = {},
): Promise<PullRequestSummary[]> {
  const state = opts.state ?? "open";
  const limit = opts.limit ?? 30;
  assertPositiveInt(limit, "limit");
  const raws = await runGhJson<Parameters<typeof mapPrSummary>[0][]>(
    ["pr", "list", "--state", state, "--limit", String(limit), "--json", PR_LIST_FIELDS],
    cwd,
  );
  return raws.map(mapPrSummary);
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewDecision: string | null;
  mergeable: string | null;
  files: { path: string; additions: number; deletions: number }[];
  comments: { author: string | null; body: string; createdAt: string }[];
  checks: CheckRun[];
}

export async function getPullRequest(
  cwd: string,
  number: number,
): Promise<PullRequestDetail> {
  assertPositiveInt(number, "pull request number");
  const raw = await runGhJson<
    Parameters<typeof mapPrSummary>[0] & {
      body: string;
      additions: number;
      deletions: number;
      changedFiles: number;
      reviewDecision: string | null;
      mergeable: string | null;
      files: { path: string; additions: number; deletions: number }[];
      comments: { author: RawPrAuthor | null; body: string; createdAt: string }[];
      statusCheckRollup: RawStatusCheck[] | null;
    }
  >(
    [
      "pr",
      "view",
      String(number),
      "--json",
      `${PR_LIST_FIELDS},body,additions,deletions,changedFiles,reviewDecision,mergeable,files,comments,statusCheckRollup`,
    ],
    cwd,
  );
  return {
    ...mapPrSummary(raw),
    body: raw.body,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    reviewDecision: raw.reviewDecision,
    mergeable: raw.mergeable,
    files: raw.files ?? [],
    comments: (raw.comments ?? []).map((c) => ({
      author: c.author?.login ?? null,
      body: c.body,
      createdAt: c.createdAt,
    })),
    checks: mapStatusCheckRollup(raw.statusCheckRollup),
  };
}

export interface CreatePullRequestInput {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
}

/** Creates a PR via `gh pr create`. Returns the new PR's URL. */
export async function createPullRequest(
  cwd: string,
  input: CreatePullRequestInput,
): Promise<{ url: string }> {
  if (!input.title.trim()) throw new Error("Pull request title is required");
  const args = ["pr", "create", "--title", input.title, "--body", input.body ?? ""];
  if (input.base) {
    assertNotOption(input.base, "base branch");
    args.push("--base", input.base);
  }
  if (input.head) {
    assertNotOption(input.head, "head branch");
    args.push("--head", input.head);
  }
  if (input.draft) args.push("--draft");

  const { stdout } = await runGh(args, cwd, 30000);
  // gh prints the created PR URL on stdout.
  const url = stdout.trim().split("\n").pop()?.trim() ?? "";
  return { url };
}

export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePullRequest(
  cwd: string,
  number: number,
  method: MergeMethod = "squash",
): Promise<void> {
  assertPositiveInt(number, "pull request number");
  await runGh(["pr", "merge", String(number), `--${method}`], cwd, 30000);
}

export async function checkoutPullRequest(
  cwd: string,
  number: number,
): Promise<void> {
  assertPositiveInt(number, "pull request number");
  await runGh(["pr", "checkout", String(number)], cwd, 30000);
}

// ── Issues ───────────────────────────────────────────────────────────────────

export type IssueState = "open" | "closed" | "all";

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  author: string | null;
  labels: string[];
  url: string;
  updatedAt: string;
  createdAt: string;
}

const ISSUE_LIST_FIELDS =
  "number,title,state,author,labels,url,updatedAt,createdAt";

function mapIssueSummary(raw: {
  number: number;
  title: string;
  state: string;
  author: RawPrAuthor | null;
  labels: { name: string }[];
  url: string;
  updatedAt: string;
  createdAt: string;
}): IssueSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.author?.login ?? null,
    labels: (raw.labels ?? []).map((l) => l.name),
    url: raw.url,
    updatedAt: raw.updatedAt,
    createdAt: raw.createdAt,
  };
}

export async function listIssues(
  cwd: string,
  opts: { state?: IssueState; search?: string; limit?: number } = {},
): Promise<IssueSummary[]> {
  const state = opts.state ?? "open";
  const limit = opts.limit ?? 30;
  assertPositiveInt(limit, "limit");
  const args = [
    "issue",
    "list",
    "--state",
    state,
    "--limit",
    String(limit),
    "--json",
    ISSUE_LIST_FIELDS,
  ];
  if (opts.search?.trim()) {
    args.push("--search", opts.search.trim());
  }
  const raws = await runGhJson<Parameters<typeof mapIssueSummary>[0][]>(args, cwd);
  return raws.map(mapIssueSummary);
}

export interface IssueDetail extends IssueSummary {
  body: string;
  comments: { author: string | null; body: string; createdAt: string }[];
}

export async function getIssue(cwd: string, number: number): Promise<IssueDetail> {
  assertPositiveInt(number, "issue number");
  const raw = await runGhJson<
    Parameters<typeof mapIssueSummary>[0] & {
      body: string;
      comments: { author: RawPrAuthor | null; body: string; createdAt: string }[];
    }
  >(
    [
      "issue",
      "view",
      String(number),
      "--json",
      `${ISSUE_LIST_FIELDS},body,comments`,
    ],
    cwd,
  );
  return {
    ...mapIssueSummary(raw),
    body: raw.body,
    comments: (raw.comments ?? []).map((c) => ({
      author: c.author?.login ?? null,
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}

export async function createIssue(
  cwd: string,
  input: { title: string; body?: string },
): Promise<{ url: string }> {
  if (!input.title.trim()) throw new Error("Issue title is required");
  const { stdout } = await runGh(
    ["issue", "create", "--title", input.title, "--body", input.body ?? ""],
    cwd,
    30000,
  );
  const url = stdout.trim().split("\n").pop()?.trim() ?? "";
  return { url };
}

export async function commentIssue(
  cwd: string,
  number: number,
  body: string,
): Promise<void> {
  assertPositiveInt(number, "issue number");
  if (!body.trim()) throw new Error("Comment body is required");
  await runGh(["issue", "comment", String(number), "--body", body], cwd, 20000);
}

// ── Checks / CI ──────────────────────────────────────────────────────────────

export interface CheckRun {
  name: string;
  /** Normalized bucket: "pass" | "fail" | "pending" | "skipping" | "cancel". */
  bucket: string;
  state: string;
  link: string | null;
  workflow: string | null;
}

interface RawStatusCheck {
  name?: string;
  context?: string;
  workflowName?: string;
  state?: string;
  conclusion?: string;
  status?: string;
  detailsUrl?: string;
  targetUrl?: string;
}

function normalizeBucket(state: string): string {
  const s = state.toUpperCase();
  if (["SUCCESS", "NEUTRAL"].includes(s)) return "pass";
  if (["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(s))
    return "fail";
  if (["CANCELLED", "STALE"].includes(s)) return "cancel";
  if (["SKIPPED"].includes(s)) return "skipping";
  return "pending";
}

function mapStatusCheckRollup(rollup: RawStatusCheck[] | null): CheckRun[] {
  if (!rollup) return [];
  return rollup.map((c) => {
    const state = c.conclusion || c.state || c.status || "";
    return {
      name: c.name || c.context || c.workflowName || "check",
      bucket: normalizeBucket(state),
      state,
      link: c.detailsUrl || c.targetUrl || null,
      workflow: c.workflowName ?? null,
    };
  });
}

/**
 * Returns check runs for a PR (by number) or for the PR associated with a
 * branch ref. Uses `gh pr checks`, which resolves the branch's PR.
 */
export async function getChecks(
  cwd: string,
  opts: { pr?: number; ref?: string } = {},
): Promise<CheckRun[]> {
  const args = ["pr", "checks"];
  if (opts.pr != null) {
    assertPositiveInt(opts.pr, "pull request number");
    args.push(String(opts.pr));
  } else if (opts.ref) {
    assertNotOption(opts.ref, "ref");
    args.push(opts.ref);
  }
  args.push("--json", "name,state,bucket,link,workflow");
  try {
    const raws = await runGhJson<
      { name: string; state: string; bucket: string; link: string; workflow: string }[]
    >(args, cwd);
    return raws.map((c) => ({
      name: c.name,
      bucket: c.bucket || normalizeBucket(c.state),
      state: c.state,
      link: c.link || null,
      workflow: c.workflow || null,
    }));
  } catch (err) {
    // `gh pr checks` exits non-zero when there are no checks or no PR; treat as
    // empty rather than an error so the UI/agent can say "no checks".
    if (err instanceof GhError && /no checks|no pull requests/i.test(err.stderr)) {
      return [];
    }
    throw err;
  }
}

/** Fetches the failed-step logs for a workflow run, for the agent to read. */
export async function getRunLogs(cwd: string, runId: number): Promise<string> {
  assertPositiveInt(runId, "run id");
  try {
    const { stdout } = await runGh(
      ["run", "view", String(runId), "--log-failed"],
      cwd,
      30000,
    );
    if (stdout.trim()) return stdout;
  } catch {
    // Fall through to full log.
  }
  const { stdout } = await runGh(["run", "view", String(runId), "--log"], cwd, 30000);
  return stdout;
}
