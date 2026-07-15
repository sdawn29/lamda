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
  id: number;
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
    .filter((raw) => raw.system !== true && raw.type == null)
    .map((raw) => {
      const author = raw.author as { username?: string; name?: string } | null;
      return {
        id: Number(raw.id ?? 0),
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
  additions: number;
  deletions: number;
  changedFiles: number;
  files: { path: string; additions: number; deletions: number }[];
  commits: MergeRequestCommit[];
  comments: NoteSummary[];
  pipeline: PipelineDetail | null;
}

export interface MergeRequestCommit {
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

function mapMergeRequestCommit(
  raw: Record<string, unknown>,
): MergeRequestCommit {
  const title = String(raw.title ?? raw.message ?? "");
  const message = String(raw.message ?? "");
  const authorName = stringField(raw.author_name);
  const authorEmail = stringField(raw.author_email);
  return {
    oid: String(raw.id ?? raw.sha ?? ""),
    messageHeadline: title.split("\n", 1)[0] ?? "",
    messageBody: message.startsWith(title)
      ? message.slice(title.length).trim()
      : message.trim(),
    authoredDate: String(raw.authored_date ?? raw.created_at ?? ""),
    committedDate: String(raw.committed_date ?? raw.created_at ?? ""),
    authors: [
      {
        login: null,
        name: authorName || null,
        email: authorEmail || null,
      },
    ],
  };
}

function diffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
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
  const [comments, pipeline, changesResponse, commitRaws] = await Promise.all([
    listNotes(cwd, "merge_requests", number).catch(() => []),
    getPipeline(cwd, { mr: number }).catch(() => null),
    runGlabJson<Record<string, unknown>>(
      ["api", `projects/:id/merge_requests/${number}/changes`],
      cwd,
    ).catch(() => null),
    runGlabJson<Record<string, unknown>[]>(
      ["api", `projects/:id/merge_requests/${number}/commits?per_page=100`],
      cwd,
    ).catch(() => []),
  ]);
  const changes = Array.isArray(changesResponse?.changes)
    ? (changesResponse.changes as Record<string, unknown>[])
    : [];
  const files = changes.map((change) => ({
    path: String(change.new_path ?? change.old_path ?? ""),
    ...diffStats(String(change.diff ?? "")),
  }));
  const totals = files.reduce(
    (result, file) => ({
      additions: result.additions + file.additions,
      deletions: result.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
  return {
    ...mapMergeRequest(raw),
    description: String(raw.description ?? ""),
    mergeStatus:
      stringField(raw.detailed_merge_status ?? raw.merge_status) || null,
    changesCount: stringField(raw.changes_count) || null,
    additions: totals.additions,
    deletions: totals.deletions,
    changedFiles: files.length,
    files,
    commits: commitRaws.map(mapMergeRequestCommit),
    comments,
    pipeline,
  };
}

export type ReviewSide = "LEFT" | "RIGHT";

export interface MergeRequestReviewFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface MergeRequestReviewComment {
  id: number;
  discussionId: string;
  path: string;
  body: string;
  author: string | null;
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

export interface MergeRequestReview {
  baseCommitOid: string;
  startCommitOid: string;
  headCommitOid: string;
  files: MergeRequestReviewFile[];
  comments: MergeRequestReviewComment[];
}

function reviewFileStatus(change: Record<string, unknown>): string {
  if (change.new_file === true) return "added";
  if (change.deleted_file === true) return "removed";
  if (change.renamed_file === true) return "renamed";
  return "modified";
}

function mapReviewNote(
  raw: Record<string, unknown>,
  discussionId: string,
  rootNoteId: number | null,
  mrUrl: string,
  fallback?: MergeRequestReviewComment,
): MergeRequestReviewComment | null {
  if (raw.system === true) return null;
  const author = raw.author as { username?: string; name?: string } | null;
  const position =
    typeof raw.position === "object" && raw.position !== null
      ? (raw.position as Record<string, unknown>)
      : null;
  const newLine = position ? Number(position.new_line ?? 0) || null : null;
  const oldLine = position ? Number(position.old_line ?? 0) || null : null;
  const path = position
    ? String(position.new_path ?? position.old_path ?? "")
    : (fallback?.path ?? "");
  const id = Number(raw.id ?? 0);
  return {
    id,
    discussionId,
    path,
    body: String(raw.body ?? ""),
    author: author?.username ?? author?.name ?? null,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? raw.created_at ?? ""),
    line: newLine ?? fallback?.line ?? null,
    originalLine: oldLine ?? fallback?.originalLine ?? null,
    side: newLine ? "RIGHT" : oldLine ? "LEFT" : (fallback?.side ?? null),
    startLine: null,
    startSide: null,
    inReplyToId: rootNoteId && rootNoteId !== id ? rootNoteId : null,
    commitId: position
      ? String(position.head_sha ?? "")
      : (fallback?.commitId ?? ""),
    originalCommitId: position
      ? String(position.base_sha ?? "")
      : (fallback?.originalCommitId ?? ""),
    url: mrUrl ? `${mrUrl}#note_${id}` : "",
  };
}

export async function getMergeRequestReview(
  cwd: string,
  number: number,
): Promise<MergeRequestReview> {
  assertPositiveInt(number, "merge request number");
  const [changesResponse, discussionRaws, mr] = await Promise.all([
    runGlabJson<Record<string, unknown>>(
      ["api", `projects/:id/merge_requests/${number}/changes`],
      cwd,
      30000,
    ),
    runGlabJson<Record<string, unknown>[]>(
      ["api", `projects/:id/merge_requests/${number}/discussions?per_page=100`],
      cwd,
      30000,
    ),
    runGlabJson<Record<string, unknown>>(
      ["api", `projects/:id/merge_requests/${number}`],
      cwd,
    ),
  ]);
  const diffRefs =
    typeof changesResponse.diff_refs === "object" &&
    changesResponse.diff_refs !== null
      ? (changesResponse.diff_refs as Record<string, unknown>)
      : {};
  const changes = Array.isArray(changesResponse.changes)
    ? (changesResponse.changes as Record<string, unknown>[])
    : [];
  const comments: MergeRequestReviewComment[] = [];
  for (const discussion of discussionRaws) {
    const discussionId = String(discussion.id ?? "");
    const notes = Array.isArray(discussion.notes)
      ? (discussion.notes as Record<string, unknown>[])
      : [];
    const rootRaw = notes[0];
    if (
      !rootRaw ||
      (String(rootRaw.type ?? "") !== "DiffNote" && !rootRaw.position)
    ) {
      continue;
    }
    const rootNoteId = notes.length > 0 ? Number(notes[0].id ?? 0) : null;
    const root = mapReviewNote(
      rootRaw,
      discussionId,
      rootNoteId,
      String(mr.web_url ?? ""),
    );
    if (!root) continue;
    comments.push(root);
    for (const note of notes.slice(1)) {
      const mapped = mapReviewNote(
        note,
        discussionId,
        rootNoteId,
        String(mr.web_url ?? ""),
        root,
      );
      if (mapped) comments.push(mapped);
    }
  }

  return {
    baseCommitOid: String(diffRefs.base_sha ?? ""),
    startCommitOid: String(diffRefs.start_sha ?? ""),
    headCommitOid: String(diffRefs.head_sha ?? ""),
    files: changes.map((change) => {
      const patch = String(change.diff ?? "");
      return {
        path: String(change.new_path ?? change.old_path ?? ""),
        previousPath:
          String(change.old_path ?? "") !== String(change.new_path ?? "")
            ? String(change.old_path ?? "") || null
            : null,
        status: reviewFileStatus(change),
        ...diffStats(patch),
        patch: patch || null,
      };
    }),
    comments,
  };
}

export async function createMergeRequestReviewComment(
  cwd: string,
  number: number,
  input: {
    body: string;
    baseSha: string;
    startSha: string;
    headSha: string;
    path: string;
    previousPath?: string;
    side: ReviewSide;
    line: number;
    oldLine?: number;
    newLine?: number;
  },
): Promise<MergeRequestReviewComment> {
  assertPositiveInt(number, "merge request number");
  assertPositiveInt(input.line, "line");
  if (!input.body.trim()) throw new GlabError("Comment body is required", "");
  const fields = [
    "api",
    `projects/:id/merge_requests/${number}/discussions`,
    "--method",
    "POST",
    "--raw-field",
    `body=${input.body}`,
    "--raw-field",
    "position[position_type]=text",
    "--raw-field",
    `position[base_sha]=${input.baseSha}`,
    "--raw-field",
    `position[start_sha]=${input.startSha}`,
    "--raw-field",
    `position[head_sha]=${input.headSha}`,
    "--raw-field",
    `position[old_path]=${input.previousPath ?? input.path}`,
    "--raw-field",
    `position[new_path]=${input.path}`,
  ];
  const oldLine = input.oldLine ?? (input.side === "LEFT" ? input.line : null);
  const newLine = input.newLine ?? (input.side === "RIGHT" ? input.line : null);
  if (oldLine) fields.push("--field", `position[old_line]=${oldLine}`);
  if (newLine) fields.push("--field", `position[new_line]=${newLine}`);
  const raw = await runGlabJson<Record<string, unknown>>(fields, cwd);
  const notes = Array.isArray(raw.notes)
    ? (raw.notes as Record<string, unknown>[])
    : [];
  const note = notes[0];
  const mapped = note
    ? mapReviewNote(note, String(raw.id ?? ""), null, "")
    : null;
  if (!mapped) throw new GlabError("GitLab did not return the comment", "");
  return mapped;
}

export async function replyToMergeRequestReviewComment(
  cwd: string,
  number: number,
  discussionId: string,
  body: string,
): Promise<MergeRequestReviewComment> {
  assertPositiveInt(number, "merge request number");
  if (!discussionId.trim())
    throw new GlabError("Discussion id is required", "");
  if (!body.trim()) throw new GlabError("Reply body is required", "");
  const raw = await runGlabJson<Record<string, unknown>>(
    [
      "api",
      `projects/:id/merge_requests/${number}/discussions/${discussionId}/notes`,
      "--method",
      "POST",
      "--raw-field",
      `body=${body}`,
    ],
    cwd,
  );
  const mapped = mapReviewNote(raw, discussionId, null, "");
  if (!mapped) {
    const author = raw.author as { username?: string; name?: string } | null;
    return {
      id: Number(raw.id ?? 0),
      discussionId,
      path: "",
      body: String(raw.body ?? body),
      author: author?.username ?? author?.name ?? null,
      createdAt: String(raw.created_at ?? ""),
      updatedAt: String(raw.updated_at ?? raw.created_at ?? ""),
      line: null,
      originalLine: null,
      side: null,
      startLine: null,
      startSide: null,
      inReplyToId: null,
      commitId: "",
      originalCommitId: "",
      url: "",
    };
  }
  return mapped;
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

export async function checkoutMergeRequest(
  cwd: string,
  number: number,
): Promise<void> {
  assertPositiveInt(number, "merge request number");
  await runGlab(["mr", "checkout", String(number)], cwd, 30000);
}

export async function mergeMergeRequest(
  cwd: string,
  number: number,
  squash = false,
): Promise<void> {
  assertPositiveInt(number, "merge request number");
  const args = ["mr", "merge", String(number), "--yes"];
  if (squash) args.push("--squash");
  await runGlab(args, cwd, 30000);
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
