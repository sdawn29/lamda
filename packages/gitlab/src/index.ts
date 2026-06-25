import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = 20000;

export class GlabError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GlabError";
  }
}

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

function isExecError(
  err: unknown,
): err is { stdout?: string; stderr?: string; code?: number } {
  return typeof err === "object" && err !== null;
}

async function runGlab(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("glab", args, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 16,
      env: { ...process.env, NO_PROMPT: "1" },
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    if (isExecError(err)) {
      const stderr = typeof err.stderr === "string" ? err.stderr : "";
      const message =
        stderr.trim() || (err as Error).message || "glab command failed";
      throw new GlabError(message, stderr);
    }
    throw new GlabError("glab command failed", "");
  }
}

async function runGlabJson<T>(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const { stdout } = await runGlab(args, cwd, timeout);
  return JSON.parse(stdout) as T;
}

async function runGit(
  args: string[],
  cwd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout });
  return { stdout, stderr };
}

export interface GlabStatus {
  installed: boolean;
  authenticated: boolean;
  login: string | null;
}

export async function getGlabStatus(cwd: string): Promise<GlabStatus> {
  try {
    await execFileAsync("glab", ["--version"], { cwd, timeout: 5000 });
  } catch {
    return { installed: false, authenticated: false, login: null };
  }

  try {
    await execFileAsync("glab", ["auth", "status"], { cwd, timeout: 8000 });
  } catch {
    return { installed: true, authenticated: false, login: null };
  }

  let login: string | null = null;
  try {
    const { stdout } = await execFileAsync(
      "glab",
      ["api", "user", "--jq", ".username"],
      { cwd, timeout: 8000 },
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

export type GitlabRepositoryVisibility = "private" | "public";

function parseGitlabRemote(
  url: string,
): { nameWithOwner: string; url: string } | null {
  const trimmed = url.trim();
  const https = trimmed.match(
    /^https?:\/\/([^/]*gitlab[^/]*)\/(.+?)(?:\.git)?$/i,
  );
  const ssh = trimmed.match(/^git@([^:]*gitlab[^:]*):(.+?)(?:\.git)?$/i);
  const match = https ?? ssh;
  if (!match) return null;
  const host = match[1];
  const path = match[2].replace(/\.git$/, "");
  return { nameWithOwner: path, url: `https://${host}/${path}` };
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

export async function listMergeRequests(
  cwd: string,
  opts: { state?: MergeRequestState; limit?: number } = {},
): Promise<MergeRequestSummary[]> {
  const state = opts.state ?? "opened";
  const limit = opts.limit ?? 30;
  assertPositiveInt(limit, "limit");
  const args = ["mr", "list", "--output", "json", "--per-page", String(limit)];
  if (state !== "all") args.push("--state", state);
  const raws = await runGlabJson<Record<string, unknown>[]>(args, cwd);
  return raws.map(mapMergeRequest);
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
  opts: { state?: IssueState; limit?: number } = {},
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
  if (state !== "all") args.push("--state", state);
  const raws = await runGlabJson<Record<string, unknown>[]>(args, cwd);
  return raws.map(mapIssue);
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
  const projectName = parts.pop() ?? rawName;
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
    if (id) args.push("--field", `namespace_id=${id}`);
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
