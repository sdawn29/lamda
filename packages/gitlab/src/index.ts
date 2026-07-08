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
const DEFAULT_TIMEOUT = 20000;

const glabRunner = createCliRunner({
  binary: "glab",
  env: { GLAB_NO_PROMPT: "1" },
  defaultTimeoutMs: DEFAULT_TIMEOUT,
  errorName: "GlabError",
});

export const GlabError = glabRunner.CliError;

const runGlab = glabRunner.run;
const runGlabJson = glabRunner.runJson;

async function runGit(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    timeout,
    env: createCliEnv(),
  });
  return { stdout, stderr };
}

export interface GlabStatus {
  installed: boolean;
  authenticated: boolean;
  login: string | null;
}

export async function getGlabStatus(cwd: string): Promise<GlabStatus> {
  try {
    await execFileAsync("glab", ["--version"], {
      cwd,
      timeout: 5000,
      env: createCliEnv(),
    });
  } catch {
    return { installed: false, authenticated: false, login: null };
  }

  try {
    await execFileAsync("glab", ["auth", "status"], {
      cwd,
      timeout: 8000,
      env: createCliEnv({ GLAB_NO_PROMPT: "1" }),
    });
  } catch {
    return { installed: true, authenticated: false, login: null };
  }

  let login: string | null = null;
  try {
    const { stdout } = await execFileAsync(
      "glab",
      ["api", "user", "--jq", ".username"],
      { cwd, timeout: 8000, env: createCliEnv({ GLAB_NO_PROMPT: "1" }) },
    );
    login = stdout.trim() || null;
  } catch {
    // Authenticated but the lookup failed.
  }

  return { installed: true, authenticated: true, login };
}

export interface GitlabRepoInfo {
  nameWithOwner: string;
  defaultBranch: string | null;
  url: string;
}

export interface GitlabRepositorySummary {
  nameWithOwner: string;
  description: string | null;
  isPrivate: boolean;
  url: string;
  cloneUrl: string;
  updatedAt: string;
}

export type GitlabRepositoryVisibility = "private" | "public";

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function defaultBranchFromRaw(raw: Record<string, unknown>): string | null {
  const direct = stringField(raw.default_branch ?? raw.defaultBranch);
  if (direct) return direct;

  const ref = raw.defaultBranchRef;
  if (typeof ref === "object" && ref !== null && "name" in ref) {
    return stringField(ref.name) || null;
  }

  return null;
}

function repoInfoFromRaw(raw: Record<string, unknown>): GitlabRepoInfo | null {
  const nameWithOwner = stringField(
    raw.path_with_namespace ??
      raw.pathWithNamespace ??
      raw.name_with_namespace ??
      raw.nameWithOwner ??
      "",
  );
  const url = stringField(raw.web_url ?? raw.webUrl ?? raw.url);
  if (!nameWithOwner || !url) return null;

  return {
    nameWithOwner,
    defaultBranch: defaultBranchFromRaw(raw),
    url,
  };
}

function parseGitlabRemote(
  url: string,
): { nameWithOwner: string; url: string } | null {
  const trimmed = url.trim();
  const scp = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (scp) {
    const host = scp[1];
    if (!host.toLowerCase().includes("gitlab")) return null;
    const path = scp[2].replace(/^\/+/, "").replace(/\.git$/, "");
    if (!path) return null;
    return { nameWithOwner: path, url: `https://${host}/${path}` };
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:", "ssh:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.toLowerCase().includes("gitlab")) return null;
    const path = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    if (!path) return null;
    return {
      nameWithOwner: path,
      url: `https://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${path}`,
    };
  } catch {
    return null;
  }
}

async function remoteNames(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(["remote"], cwd, 5000);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function remoteUrl(cwd: string, remote: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(["remote", "get-url", remote], cwd, 5000);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function currentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(["branch", "--show-current"], cwd, 5000);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getRepoInfo(cwd: string): Promise<GitlabRepoInfo | null> {
  try {
    const raw = await runGlabJson<Record<string, unknown>>(
      ["repo", "view", "--output", "json"],
      cwd,
    );
    const repo = repoInfoFromRaw(raw);
    if (repo) return repo;
  } catch {
    // Fall back to local remote parsing when glab cannot resolve the repo.
  }

  for (const remote of await remoteNames(cwd)) {
    const url = await remoteUrl(cwd, remote);
    if (!url) continue;
    const parsed = parseGitlabRemote(url);
    if (!parsed) continue;
    return {
      nameWithOwner: parsed.nameWithOwner,
      defaultBranch: await currentBranch(cwd),
      url: parsed.url,
    };
  }
  return null;
}

function mapRepository(raw: Record<string, unknown>): GitlabRepositorySummary {
  const nameWithOwner = String(
    raw.path_with_namespace ??
      raw.pathWithNamespace ??
      raw.name_with_namespace ??
      raw.name ??
      "",
  );
  const url = String(raw.web_url ?? raw.webUrl ?? "");
  const cloneUrl = String(
    raw.ssh_url_to_repo ??
      raw.sshUrlToRepo ??
      raw.http_url_to_repo ??
      raw.httpUrlToRepo ??
      url,
  );

  return {
    nameWithOwner,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description
        : null,
    isPrivate: String(raw.visibility ?? "").toLowerCase() !== "public",
    url,
    cloneUrl,
    updatedAt: String(
      raw.last_activity_at ?? raw.updated_at ?? raw.updatedAt ?? "",
    ),
  };
}

export async function listRepositories(
  cwd: string,
  opts: { limit?: number } = {},
): Promise<GitlabRepositorySummary[]> {
  const limit = opts.limit ?? 1000;
  assertPositiveInt(limit, "limit");
  try {
    const raws = await runGlabJson<Record<string, unknown>[]>(
      [
        "repo",
        "list",
        "--output",
        "json",
        "--member",
        "--per-page",
        String(limit),
      ],
      cwd,
      30000,
    );
    return raws
      .map(mapRepository)
      .filter((repo) => repo.nameWithOwner && repo.cloneUrl);
  } catch {
    return [];
  }
}

export type MergeRequestState = "opened" | "closed" | "merged" | "all";

export interface MergeRequestSummary {
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

function mapMergeRequest(raw: Record<string, unknown>): MergeRequestSummary {
  const author = raw.author as { username?: string; name?: string } | null;
  return {
    number: Number(raw.iid ?? raw.id ?? 0),
    title: String(raw.title ?? ""),
    state: String(raw.state ?? ""),
    isDraft: Boolean(raw.draft ?? raw.work_in_progress ?? false),
    author: author?.username ?? author?.name ?? null,
    headRefName: String(raw.source_branch ?? raw.sourceBranch ?? ""),
    baseRefName: String(raw.target_branch ?? raw.targetBranch ?? ""),
    url: String(raw.web_url ?? raw.webUrl ?? ""),
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ""),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

/**
 * Map a list state to the matching `glab ... list` flag. Opened is the CLI
 * default so it needs no flag; `--merged` only applies to merge requests.
 */
function stateListFlag(state: string): string | null {
  if (state === "closed") return "--closed";
  if (state === "merged") return "--merged";
  if (state === "all") return "--all";
  return null;
}

export async function listMergeRequests(
  cwd: string,
  opts: { state?: MergeRequestState; limit?: number } = {},
): Promise<MergeRequestSummary[]> {
  const state = opts.state ?? "opened";
  const limit = opts.limit ?? 30;
  assertPositiveInt(limit, "limit");
  const args = ["mr", "list", "--output", "json", "--per-page", String(limit)];
  const flag = stateListFlag(state);
  if (flag) args.push(flag);
  const raws = await runGlabJson<Record<string, unknown>[]>(args, cwd);
  return raws.map(mapMergeRequest);
}

export interface NoteSummary {
  author: string | null;
  body: string;
  createdAt: string;
}

/**
 * Non-system notes (comments) on an issue or merge request, via the REST API.
 * `:id` is glab's placeholder for the current project.
 */
async function listNotes(
  cwd: string,
  kind: "issues" | "merge_requests",
  iid: number,
): Promise<NoteSummary[]> {
  const raws = await runGlabJson<Record<string, unknown>[]>(
    ["api", `projects/:id/${kind}/${iid}/notes?per_page=100`],
    cwd,
  );
  return raws
    .filter((raw) => raw.system !== true)
    .map((raw) => {
      const author = raw.author as { username?: string; name?: string } | null;
      return {
        author: author?.username ?? author?.name ?? null,
        body: String(raw.body ?? ""),
        createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
      };
    });
}

export interface MergeRequestDetail extends MergeRequestSummary {
  description: string;
  mergeStatus: string | null;
  /** GitLab reports this as a string, e.g. "5" or "1000+". */
  changesCount: string | null;
  comments: NoteSummary[];
  pipeline: PipelineDetail | null;
}

export async function getMergeRequest(
  cwd: string,
  number: number,
): Promise<MergeRequestDetail> {
  assertPositiveInt(number, "merge request number");
  const raw = await runGlabJson<Record<string, unknown>>(
    ["mr", "view", String(number), "--output", "json"],
    cwd,
  );
  const [comments, pipeline] = await Promise.all([
    listNotes(cwd, "merge_requests", number).catch(() => []),
    getPipeline(cwd, { mr: number }).catch(() => null),
  ]);
  return {
    ...mapMergeRequest(raw),
    description: String(raw.description ?? ""),
    mergeStatus:
      stringField(raw.detailed_merge_status ?? raw.merge_status) || null,
    changesCount: stringField(raw.changes_count) || null,
    comments,
    pipeline,
  };
}

export interface CreateMergeRequestInput {
  title: string;
  description?: string;
  sourceBranch?: string;
  targetBranch?: string;
  draft?: boolean;
  removeSourceBranch?: boolean;
}

/** Pull the merge request URL out of glab's create output. */
function extractMergeRequestUrl(stdout: string): string {
  const matches = stdout.match(/https?:\/\/\S+/g);
  return matches?.[matches.length - 1]?.trim() ?? "";
}

export async function createMergeRequest(
  cwd: string,
  input: CreateMergeRequestInput,
): Promise<{ url: string }> {
  if (!input.title.trim()) {
    throw new GlabError("Merge request title is required", "");
  }
  const args = [
    "mr",
    "create",
    "--title",
    input.title,
    "--description",
    input.description ?? "",
    // Skip the confirmation prompt and never open an editor; the title and
    // description are supplied non-interactively above.
    "--yes",
    "--no-editor",
    // Push the source branch so the MR has a remote head to open against.
    "--push",
  ];
  if (input.sourceBranch) {
    assertNotOption(input.sourceBranch, "source branch");
    args.push("--source-branch", input.sourceBranch);
  }
  if (input.targetBranch) {
    assertNotOption(input.targetBranch, "target branch");
    args.push("--target-branch", input.targetBranch);
  }
  if (input.draft) args.push("--draft");
  if (input.removeSourceBranch) args.push("--remove-source-branch");

  const { stdout } = await runGlab(args, cwd, 60000);
  return { url: extractMergeRequestUrl(stdout) };
}

export type IssueState = "opened" | "closed" | "all";

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

function mapIssue(raw: Record<string, unknown>): IssueSummary {
  const author = raw.author as { username?: string; name?: string } | null;
  return {
    number: Number(raw.iid ?? raw.id ?? 0),
    title: String(raw.title ?? ""),
    state: String(raw.state ?? ""),
    author: author?.username ?? author?.name ?? null,
    labels: Array.isArray(raw.labels) ? raw.labels.map(String) : [],
    url: String(raw.web_url ?? raw.webUrl ?? ""),
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ""),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

export async function listIssues(
  cwd: string,
  opts: { state?: IssueState; search?: string; limit?: number } = {},
): Promise<IssueSummary[]> {
  const state = opts.state ?? "opened";
  const limit = opts.limit ?? 30;
  assertPositiveInt(limit, "limit");
  const args = [
    "issue",
    "list",
    "--output",
    "json",
    "--per-page",
    String(limit),
  ];
  const flag = stateListFlag(state);
  if (flag) args.push(flag);
  if (opts.search?.trim()) {
    args.push("--search", opts.search.trim());
  }
  const raws = await runGlabJson<Record<string, unknown>[]>(args, cwd);
  return raws.map(mapIssue);
}

export interface IssueDetail extends IssueSummary {
  description: string;
  comments: NoteSummary[];
}

export async function getIssue(
  cwd: string,
  number: number,
): Promise<IssueDetail> {
  assertPositiveInt(number, "issue number");
  const raw = await runGlabJson<Record<string, unknown>>(
    ["issue", "view", String(number), "--output", "json"],
    cwd,
  );
  const comments = await listNotes(cwd, "issues", number).catch(() => []);
  return {
    ...mapIssue(raw),
    description: String(raw.description ?? ""),
    comments,
  };
}

export async function commentIssue(
  cwd: string,
  number: number,
  body: string,
): Promise<void> {
  assertPositiveInt(number, "issue number");
  if (!body.trim()) throw new GlabError("Comment body is required", "");
  await runGlab(["issue", "note", String(number), "--message", body], cwd);
}

export async function commentMergeRequest(
  cwd: string,
  number: number,
  body: string,
): Promise<void> {
  assertPositiveInt(number, "merge request number");
  if (!body.trim()) throw new GlabError("Comment body is required", "");
  await runGlab(["mr", "note", String(number), "--message", body], cwd);
}

// ── Pipelines / CI ───────────────────────────────────────────────────────────

export interface PipelineJob {
  name: string;
  stage: string | null;
  /** Normalized bucket: "pass" | "fail" | "pending" | "skipping" | "cancel". */
  bucket: string;
  state: string;
  link: string | null;
  allowFailure: boolean;
}

export interface PipelineDetail {
  id: number;
  status: string;
  ref: string | null;
  url: string | null;
  jobs: PipelineJob[];
}

function normalizeJobBucket(status: string): string {
  const s = status.toLowerCase();
  if (s === "success") return "pass";
  if (s === "failed") return "fail";
  if (s === "canceled" || s === "canceling") return "cancel";
  if (s === "skipped" || s === "manual") return "skipping";
  return "pending";
}

async function pipelineJobs(
  cwd: string,
  pipelineId: number,
): Promise<PipelineJob[]> {
  const raws = await runGlabJson<Record<string, unknown>[]>(
    ["api", `projects/:id/pipelines/${pipelineId}/jobs?per_page=100`],
    cwd,
  );
  return raws.map((raw) => {
    const state = String(raw.status ?? "");
    return {
      name: String(raw.name ?? "job"),
      stage: stringField(raw.stage) || null,
      bucket: normalizeJobBucket(state),
      state,
      link: stringField(raw.web_url ?? raw.webUrl) || null,
      allowFailure: raw.allow_failure === true,
    };
  });
}

/**
 * Latest pipeline (with its jobs) for a merge request (by iid) or a ref;
 * defaults to the current branch. Returns null when there is no pipeline.
 */
export async function getPipeline(
  cwd: string,
  opts: { mr?: number; ref?: string } = {},
): Promise<PipelineDetail | null> {
  let raws: Record<string, unknown>[];
  if (opts.mr != null) {
    assertPositiveInt(opts.mr, "merge request number");
    raws = await runGlabJson<Record<string, unknown>[]>(
      ["api", `projects/:id/merge_requests/${opts.mr}/pipelines?per_page=1`],
      cwd,
    );
  } else {
    const ref = opts.ref ?? (await currentBranch(cwd));
    if (!ref) return null;
    assertNotOption(ref, "ref");
    raws = await runGlabJson<Record<string, unknown>[]>(
      [
        "api",
        `projects/:id/pipelines?ref=${encodeURIComponent(ref)}&per_page=1`,
      ],
      cwd,
    );
  }

  const raw = raws[0];
  if (!raw) return null;
  const id = Number(raw.id ?? 0);
  const jobs = id > 0 ? await pipelineJobs(cwd, id).catch(() => []) : [];
  return {
    id,
    status: String(raw.status ?? ""),
    ref: stringField(raw.ref) || null,
    url: stringField(raw.web_url ?? raw.webUrl) || null,
    jobs,
  };
}

async function hasRemote(cwd: string, remote: string): Promise<boolean> {
  return (await remoteUrl(cwd, remote)) !== null;
}

async function namespaceId(
  cwd: string,
  namespace: string,
): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(namespace);
    const { stdout } = await runGlab(
      ["api", `namespaces/${encoded}`, "--jq", ".id"],
      cwd,
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function publishRepository(
  cwd: string,
  opts: { name?: string; visibility?: GitlabRepositoryVisibility } = {},
): Promise<GitlabRepoInfo> {
  const rawName = (opts.name?.trim() || basename(cwd)).trim();
  const visibility = opts.visibility ?? "private";
  assertNotOption(rawName, "repository name");

  const parts = rawName.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new GlabError("Repository name is required", "");
  }
  const projectName = parts.pop()!;
  const namespace = parts.length > 0 ? parts.join("/") : null;
  assertNotOption(projectName, "repository name");

  const args = [
    "api",
    "projects",
    "--method",
    "POST",
    "--field",
    `name=${projectName}`,
    "--field",
    `visibility=${visibility}`,
  ];
  if (namespace) {
    const id = await namespaceId(cwd, namespace);
    if (!id) {
      throw new GlabError(`GitLab namespace "${namespace}" was not found`, "");
    }
    args.push("--field", `namespace_id=${id}`);
  }

  const project = await runGlabJson<{
    path_with_namespace: string;
    web_url: string;
    ssh_url_to_repo: string;
    default_branch: string | null;
  }>(args, cwd, 120000);

  const remote = (await hasRemote(cwd, "origin")) ? "gitlab" : "origin";
  if (await hasRemote(cwd, remote)) {
    await runGit(["remote", "set-url", remote, project.ssh_url_to_repo], cwd);
  } else {
    await runGit(["remote", "add", remote, project.ssh_url_to_repo], cwd);
  }
  await runGit(["push", "-u", remote, "HEAD"], cwd, 120000);

  return {
    nameWithOwner: project.path_with_namespace,
    defaultBranch: project.default_branch ?? (await currentBranch(cwd)),
    url: project.web_url,
  };
}
