import { apiFetch } from "@/shared/lib/client"
import type {
  GlabStatus,
  GitlabRepoInfo,
  IssueState,
  IssueSummary,
  MergeRequestState,
  MergeRequestSummary,
  PublishRepositoryInput,
  RepoContext,
} from "./types"

function ctxQuery(ctx: RepoContext): string {
  const params = new URLSearchParams()
  if (ctx.id) params.set("id", ctx.id)
  else if (ctx.ws) params.set("ws", ctx.ws)
  else if (ctx.path) params.set("path", ctx.path)
  return params.toString()
}

const jsonInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export async function fetchGlabStatus(
  ctx: RepoContext = {},
  signal?: AbortSignal
): Promise<GlabStatus> {
  const q = ctxQuery(ctx)
  return apiFetch<GlabStatus>(`/gitlab/status${q ? `?${q}` : ""}`, { signal })
}

export async function fetchGitlabRepoInfo(
  ctx: RepoContext,
  signal?: AbortSignal
): Promise<GitlabRepoInfo | null> {
  const res = await apiFetch<{ repo: GitlabRepoInfo | null }>(
    `/gitlab/repo?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.repo
}

export async function publishGitlabRepository(
  input: PublishRepositoryInput
): Promise<GitlabRepoInfo> {
  const res = await apiFetch<{ repo: GitlabRepoInfo }>(
    "/gitlab/repo/publish",
    jsonInit(input)
  )
  return res.repo
}

export async function fetchMergeRequests(
  ctx: RepoContext,
  state: MergeRequestState,
  signal?: AbortSignal
): Promise<MergeRequestSummary[]> {
  const params = new URLSearchParams(ctxQuery(ctx))
  params.set("state", state)
  const res = await apiFetch<{ mrs: MergeRequestSummary[] }>(
    `/gitlab/mrs?${params.toString()}`,
    { signal }
  )
  return res.mrs
}

export async function fetchIssues(
  ctx: RepoContext,
  state: IssueState,
  signal?: AbortSignal
): Promise<IssueSummary[]> {
  const params = new URLSearchParams(ctxQuery(ctx))
  params.set("state", state)
  const res = await apiFetch<{ issues: IssueSummary[] }>(
    `/gitlab/issues?${params.toString()}`,
    { signal }
  )
  return res.issues
}
