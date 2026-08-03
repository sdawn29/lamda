import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { createCliEnv } from "@lamda/cli-env";
import {
  createCliRunner,
  assertNotOption,
  assertPositiveInt,
} from "@lamda/cli-runner";

const execFileAsync = promisify(execFile);

/**
 * Default timeout for `gh` invocations. GitHub network calls can be slow, so
 * this is more generous than the local git timeouts.
 */
const DEFAULT_TIMEOUT = 20000;

const ghRunner = createCliRunner({
  binary: "gh",
  env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
  defaultTimeoutMs: DEFAULT_TIMEOUT,
  errorName: "GhError",
});

/**
 * Raised when a `gh` command exits non-zero for a reason the caller should
 * surface (e.g. failed PR creation). "Expected" failures — gh missing, not a
 * repo, not authenticated — are handled by returning null/empty instead.
 */
export const GhError = ghRunner.CliError;

/**
 * Runs `gh` and returns stdout/stderr. Throws GhError on non-zero exit. Callers
 * that treat failure as a soft "no" (status/list) should catch and degrade.
 */
const runGh = ghRunner.run;
const runGhJson = ghRunner.runJson;

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
    await execFileAsync("gh", ["--version"], {
      cwd,
      timeout: 5000,
      env: createCliEnv(),
    });
  } catch {
    return { installed: false, authenticated: false, login: null };
  }

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      cwd,
      timeout: 5000,
      env: createCliEnv({
        GH_PROMPT_DISABLED: "1",
        GH_NO_UPDATE_NOTIFIER: "1",
      }),
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
      {
        cwd,
        timeout: 8000,
        env: createCliEnv({
          GH_PROMPT_DISABLED: "1",
          GH_NO_UPDATE_NOTIFIER: "1",
        }),
      },
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

export interface GhRepositorySummary {
  nameWithOwner: string;
  description: string | null;
  isPrivate: boolean;
  url: string;
  updatedAt: string;
}

export type GhRepositoryVisibility = "private" | "public";

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
    }>(["repo", "view", "--json", "nameWithOwner,defaultBranchRef,url"], cwd);
    return {
      nameWithOwner: data.nameWithOwner,
      defaultBranch: data.defaultBranchRef?.name ?? null,
      url: data.url,
    };
  } catch {
    return null;
  }
}

export async function listRepositories(
  cwd: string,
  opts: { limit?: number } = {},
): Promise<GhRepositorySummary[]> {
  const limit = opts.limit ?? 1000;
  assertPositiveInt(limit, "limit");
  try {
    return await runGhJson<GhRepositorySummary[]>(
      [
        "repo",
        "list",
        "--limit",
        String(limit),
        "--json",
        "nameWithOwner,description,isPrivate,url,updatedAt",
      ],
      cwd,
      30000,
    );
  } catch {
    return [];
  }
}

async function hasRemote(cwd: string, remote: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["remote", "get-url", remote], {
      cwd,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function publishRepository(
  cwd: string,
  opts: { name?: string; visibility?: GhRepositoryVisibility } = {},
): Promise<GhRepoInfo> {
  const name = (opts.name?.trim() || basename(cwd)).trim();
  const visibility = opts.visibility ?? "private";
  assertNotOption(name, "repository name");
  const remote = (await hasRemote(cwd, "origin")) ? "github" : "origin";
  await runGh(
    [
      "repo",
      "create",
      name,
      "--source",
      ".",
      "--remote",
      remote,
      "--push",
      visibility === "private" ? "--private" : "--public",
    ],
    cwd,
    120000,
  );
  const repo = await getRepoInfo(cwd);
  if (repo) return repo;
  const data = await runGhJson<{
    nameWithOwner: string;
    defaultBranchRef: { name: string } | null;
    url: string;
  }>(
    ["repo", "view", name, "--json", "nameWithOwner,defaultBranchRef,url"],
    cwd,
  );
  return {
    nameWithOwner: data.nameWithOwner,
    defaultBranch: data.defaultBranchRef?.name ?? null,
    url: data.url,
  };
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
    [
      "pr",
      "list",
      "--state",
      state,
      "--limit",
      String(limit),
      "--json",
      PR_LIST_FIELDS,
    ],
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
  /** True when GitHub auto-merge is armed for this PR. */
  autoMergeEnabled: boolean;
  /** Logins of users/teams whose review is requested but not yet given. */
  reviewRequests: string[];
  /** Most recent review per reviewer, e.g. state APPROVED / CHANGES_REQUESTED. */
  latestReviews: { author: string | null; state: string }[];
  files: { path: string; additions: number; deletions: number }[];
  commits: PullRequestCommit[];
  comments: { author: string | null; body: string; createdAt: string }[];
  checks: CheckRun[];
}

export interface PullRequestCommit {
  oid: string;
  messageHeadline: string;
  messageBody: string;
  authoredDate: string;
  committedDate: string;
  authors: {
    login: string | null;
    name: string | null;
    email: string | null;
  }[];
}

export type ReviewSide = "LEFT" | "RIGHT";

export interface PullRequestFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PullRequestReviewComment {
  id: number;
  path: string;
  body: string;
  author: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  line: number | null;
  originalLine: number | null;
  side: ReviewSide | null;
  startLine: number | null;
  startSide: ReviewSide | null;
  inReplyToId: number | null;
  commitId: string;
  originalCommitId: string;
  url: string;
}

export interface PullRequestReview {
  headCommitOid: string;
  files: PullRequestFile[];
  comments: PullRequestReviewComment[];
}

interface RawPullRequestFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface RawReviewComment {
  id: number;
  path: string;
  body: string;
  user: { login?: string; avatar_url?: string } | null;
  created_at: string;
  updated_at: string;
  line: number | null;
  original_line: number | null;
  side: ReviewSide | null;
  start_line: number | null;
  start_side: ReviewSide | null;
  in_reply_to_id?: number;
  commit_id: string;
  original_commit_id: string;
  html_url: string;
}

function flattenPages<T>(pages: T[][]): T[] {
  return pages.flat();
}

function mapReviewComment(raw: RawReviewComment): PullRequestReviewComment {
  return {
    id: raw.id,
    path: raw.path,
    body: raw.body,
    author: raw.user?.login ?? null,
    authorAvatarUrl: raw.user?.avatar_url ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    line: raw.line,
    originalLine: raw.original_line,
    side: raw.side,
    startLine: raw.start_line,
    startSide: raw.start_side,
    inReplyToId: raw.in_reply_to_id ?? null,
    commitId: raw.commit_id,
    originalCommitId: raw.original_commit_id,
    url: raw.html_url,
  };
}

/**
 * Loads the heavyweight code-review payload separately from PR metadata so the
 * overview remains quick. GitHub's REST API supplies both patches and the
 * original/current line anchors needed to place comments in a diff.
 */
export async function getPullRequestReview(
  cwd: string,
  number: number,
): Promise<PullRequestReview> {
  assertPositiveInt(number, "pull request number");
  const repo = await getRepoInfo(cwd);
  if (!repo) throw new Error("GitHub repository not found");
  const endpoint = `repos/${repo.nameWithOwner}/pulls/${number}`;

  const headPromise = runGhJson<{ headRefOid: string }>(
    ["pr", "view", String(number), "--json", "headRefOid"],
    cwd,
  );
  const filesPromise = runGhJson<RawPullRequestFile[][]>(
    ["api", `${endpoint}/files?per_page=100`, "--paginate", "--slurp"],
    cwd,
    30000,
  );
  const commentsPromise = runGhJson<RawReviewComment[][]>(
    ["api", `${endpoint}/comments?per_page=100`, "--paginate", "--slurp"],
    cwd,
    30000,
  );

  const [head, filePages, commentPages] = await Promise.all([
    headPromise,
    filesPromise,
    commentsPromise,
  ]);

  return {
    headCommitOid: head.headRefOid,
    files: flattenPages(filePages).map((file) => ({
      path: file.filename,
      previousPath: file.previous_filename ?? null,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch ?? null,
    })),
    comments: flattenPages(commentPages).map(mapReviewComment),
  };
}

export async function createPullRequestReviewComment(
  cwd: string,
  number: number,
  input: {
    body: string;
    commitId: string;
    path: string;
    side: ReviewSide;
    line: number;
  },
): Promise<PullRequestReviewComment> {
  assertPositiveInt(number, "pull request number");
  assertPositiveInt(input.line, "line");
  if (!input.body.trim()) throw new Error("Comment body is required");
  if (!input.path.trim()) throw new Error("File path is required");
  const repo = await getRepoInfo(cwd);
  if (!repo) throw new Error("GitHub repository not found");

  const raw = await runGhJson<RawReviewComment>(
    [
      "api",
      `repos/${repo.nameWithOwner}/pulls/${number}/comments`,
      "--method",
      "POST",
      "--raw-field",
      `body=${input.body}`,
      "--raw-field",
      `commit_id=${input.commitId}`,
      "--raw-field",
      `path=${input.path}`,
      "--raw-field",
      `side=${input.side}`,
      "--field",
      `line=${input.line}`,
    ],
    cwd,
  );
  return mapReviewComment(raw);
}

export async function replyToPullRequestReviewComment(
  cwd: string,
  number: number,
  commentId: number,
  body: string,
): Promise<PullRequestReviewComment> {
  assertPositiveInt(number, "pull request number");
  assertPositiveInt(commentId, "review comment id");
  if (!body.trim()) throw new Error("Reply body is required");
  const repo = await getRepoInfo(cwd);
  if (!repo) throw new Error("GitHub repository not found");

  const raw = await runGhJson<RawReviewComment>(
    [
      "api",
      `repos/${repo.nameWithOwner}/pulls/${number}/comments/${commentId}/replies`,
      "--method",
      "POST",
      "--raw-field",
      `body=${body}`,
    ],
    cwd,
  );
  return mapReviewComment(raw);
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
      autoMergeRequest: { enabledAt?: string | null } | null;
      reviewRequests: { login?: string; name?: string; slug?: string }[] | null;
      latestReviews: { author: RawPrAuthor | null; state: string }[] | null;
      files: { path: string; additions: number; deletions: number }[];
      commits: {
        oid: string;
        messageHeadline: string;
        messageBody: string;
        authoredDate: string;
        committedDate: string;
        authors: {
          login?: string;
          name?: string;
          email?: string;
        }[];
      }[];
      comments: {
        author: RawPrAuthor | null;
        body: string;
        createdAt: string;
      }[];
      statusCheckRollup: RawStatusCheck[] | null;
    }
  >(
    [
      "pr",
      "view",
      String(number),
      "--json",
      `${PR_LIST_FIELDS},body,additions,deletions,changedFiles,reviewDecision,mergeable,autoMergeRequest,reviewRequests,latestReviews,files,commits,comments,statusCheckRollup`,
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
    autoMergeEnabled: raw.autoMergeRequest != null,
    reviewRequests: (raw.reviewRequests ?? [])
      .map((r) => r.login ?? r.name ?? r.slug ?? null)
      .filter((login): login is string => login !== null),
    latestReviews: (raw.latestReviews ?? []).map((r) => ({
      author: r.author?.login ?? null,
      state: r.state,
    })),
    files: raw.files ?? [],
    commits: (raw.commits ?? []).map((commit) => ({
      oid: commit.oid,
      messageHeadline: commit.messageHeadline,
      messageBody: commit.messageBody,
      authoredDate: commit.authoredDate,
      committedDate: commit.committedDate,
      authors: (commit.authors ?? []).map((author) => ({
        login: author.login ?? null,
        name: author.name ?? null,
        email: author.email ?? null,
      })),
    })),
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
  const args = [
    "pr",
    "create",
    "--title",
    input.title,
    "--body",
    input.body ?? "",
  ];
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

export interface CommitDiffFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Changed files (with patches) for a single commit, via the REST API. */
export async function getCommitDiff(
  cwd: string,
  oid: string,
): Promise<CommitDiffFile[]> {
  if (!/^[0-9a-f]{7,40}$/i.test(oid)) {
    throw new Error("Invalid commit id");
  }
  const repo = await getRepoInfo(cwd);
  if (!repo) throw new Error("GitHub repository not found");
  const raw = await runGhJson<{ files?: RawPullRequestFile[] }>(
    ["api", `repos/${repo.nameWithOwner}/commits/${oid}`],
    cwd,
    30000,
  );
  return (raw.files ?? []).map((file) => ({
    path: file.filename,
    previousPath: file.previous_filename ?? null,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch ?? null,
  }));
}

export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePullRequest(
  cwd: string,
  number: number,
  method: MergeMethod = "squash",
  /** Arm GitHub auto-merge instead of merging immediately. */
  auto = false,
): Promise<void> {
  assertPositiveInt(number, "pull request number");
  const args = ["pr", "merge", String(number), `--${method}`];
  if (auto) args.push("--auto");
  await runGh(args, cwd, 30000);
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
  const raws = await runGhJson<Parameters<typeof mapIssueSummary>[0][]>(
    args,
    cwd,
  );
  return raws.map(mapIssueSummary);
}

export interface IssueDetail extends IssueSummary {
  body: string;
  comments: { author: string | null; body: string; createdAt: string }[];
}

export async function getIssue(
  cwd: string,
  number: number,
): Promise<IssueDetail> {
  assertPositiveInt(number, "issue number");
  const raw = await runGhJson<
    Parameters<typeof mapIssueSummary>[0] & {
      body: string;
      comments: {
        author: RawPrAuthor | null;
        body: string;
        createdAt: string;
      }[];
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
  if (
    [
      "FAILURE",
      "ERROR",
      "TIMED_OUT",
      "ACTION_REQUIRED",
      "STARTUP_FAILURE",
    ].includes(s)
  )
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
      {
        name: string;
        state: string;
        bucket: string;
        link: string;
        workflow: string;
      }[]
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
    if (
      err instanceof GhError &&
      /no checks|no pull requests/i.test(err.stderr)
    ) {
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
  const { stdout } = await runGh(
    ["run", "view", String(runId), "--log"],
    cwd,
    30000,
  );
  return stdout;
}
