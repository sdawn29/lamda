import { ApiError, apiFetch } from "@/shared/lib/client"
import type {
  CheckRun,
  CreatePrInput,
  GhRepoInfo,
  GhRepositorySummary,
  GhStatus,
  IssueDetail,
  IssueState,
  IssueSummary,
  MergeMethod,
  PublishRepositoryInput,
  PrState,
  PullRequestDetail,
  PullRequestSummary,
  RepoContext,
} from "./types"

/** Serializes a repo context into a query string (`?id=` / `?ws=` / `?path=`). */
function ctxQuery(ctx: RepoContext): string {
  const params = new URLSearchParams()
  if (ctx.id) params.set("id", ctx.id)
  else if (ctx.ws) params.set("ws", ctx.ws)
  else if (ctx.path) params.set("path", ctx.path)
  return params.toString()
}

const jsonInit = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
})

export async function fetchGhStatus(
  ctx: RepoContext = {},
  signal?: AbortSignal
): Promise<GhStatus> {
  const q = ctxQuery(ctx)
  return apiFetch<GhStatus>(`/github/status${q ? `?${q}` : ""}`, { signal })
}

export async function fetchRepoInfo(
  ctx: RepoContext,
  signal?: AbortSignal
): Promise<GhRepoInfo | null> {
  const res = await apiFetch<{ repo: GhRepoInfo | null }>(
    `/github/repo?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.repo
}

export async function fetchRepositories(
  signal?: AbortSignal
): Promise<GhRepositorySummary[]> {
  try {
    const res = await apiFetch<{ repositories: GhRepositorySummary[] }>(
      "/github/repositories",
      { signal }
    )
    return res.repositories
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export async function fetchPullRequests(
  ctx: RepoContext,
  state: PrState,
  signal?: AbortSignal
): Promise<PullRequestSummary[]> {
  const params = new URLSearchParams(ctxQuery(ctx))
  params.set("state", state)
  const res = await apiFetch<{ prs: PullRequestSummary[] }>(
    `/github/prs?${params.toString()}`,
    { signal }
  )
  return res.prs
}

export async function fetchPullRequest(
  ctx: RepoContext,
  number: number,
  signal?: AbortSignal
): Promise<PullRequestDetail> {
  const res = await apiFetch<{ pr: PullRequestDetail }>(
    `/github/prs/${number}?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.pr
}

export async function createPullRequest(
  input: CreatePrInput
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/github/prs", jsonInit(input))
}

export async function publishRepository(
  input: PublishRepositoryInput
): Promise<GhRepoInfo> {
  const res = await apiFetch<{ repo: GhRepoInfo }>(
    "/github/repo/publish",
    jsonInit(input)
  )
  return res.repo
}

export async function mergePullRequest(
  ctx: RepoContext,
  number: number,
  method: MergeMethod
): Promise<void> {
  await apiFetch(`/github/prs/${number}/merge`, jsonInit({ ...ctx, method }))
}

export async function checkoutPullRequest(
  ctx: RepoContext,
  number: number
): Promise<void> {
  await apiFetch(`/github/prs/${number}/checkout`, jsonInit(ctx))
}

export async function fetchIssues(
  ctx: RepoContext,
  state: IssueState,
  search: string | undefined,
  signal?: AbortSignal
): Promise<IssueSummary[]> {
  const params = new URLSearchParams(ctxQuery(ctx))
  params.set("state", state)
  if (search?.trim()) params.set("q", search.trim())
  const res = await apiFetch<{ issues: IssueSummary[] }>(
    `/github/issues?${params.toString()}`,
    { signal }
  )
  return res.issues
}

export async function fetchIssue(
  ctx: RepoContext,
  number: number,
  signal?: AbortSignal
): Promise<IssueDetail> {
  const res = await apiFetch<{ issue: IssueDetail }>(
    `/github/issues/${number}?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.issue
}

export async function createIssue(
  ctx: RepoContext,
  input: { title: string; body?: string }
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(
    "/github/issues",
    jsonInit({ ...ctx, ...input })
  )
}

export async function commentIssue(
  ctx: RepoContext,
  number: number,
  body: string
): Promise<void> {
  await apiFetch(`/github/issues/${number}/comment`, jsonInit({ ...ctx, body }))
}

export async function fetchChecks(
  ctx: RepoContext,
  opts: { pr?: number; ref?: string } = {},
  signal?: AbortSignal
): Promise<CheckRun[]> {
  const params = new URLSearchParams(ctxQuery(ctx))
  if (opts.pr != null) params.set("pr", String(opts.pr))
  if (opts.ref) params.set("ref", opts.ref)
  const res = await apiFetch<{ checks: CheckRun[] }>(
    `/github/checks?${params.toString()}`,
    { signal }
  )
  return res.checks
}
