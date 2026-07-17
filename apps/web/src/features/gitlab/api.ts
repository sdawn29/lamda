import { apiFetch } from "@/shared/lib/client"
import type {
  CommitDiffFile,
  CreateMergeRequestInput,
  GlabStatus,
  GitlabRepoInfo,
  GitlabRepositorySummary,
  IssueState,
  IssueSummary,
  MergeRequestState,
  MergeRequestDetail,
  MergeRequestReview,
  MergeRequestReviewComment,
  MergeRequestSummary,
  PipelineDetail,
  PublishRepositoryInput,
  RepoContext,
  CreateReviewCommentInput,
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

export async function fetchGitlabRepositories(
  signal?: AbortSignal
): Promise<GitlabRepositorySummary[]> {
  const res = await apiFetch<{ repositories: GitlabRepositorySummary[] }>(
    "/gitlab/repositories",
    { signal }
  )
  return res.repositories
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

export async function fetchGitlabPipeline(
  ctx: RepoContext,
  ref?: string,
  signal?: AbortSignal
): Promise<PipelineDetail | null> {
  const params = new URLSearchParams(ctxQuery(ctx))
  if (ref) params.set("ref", ref)
  const res = await apiFetch<{ pipeline: PipelineDetail | null }>(
    `/gitlab/pipeline?${params.toString()}`,
    { signal }
  )
  return res.pipeline
}

export async function createMergeRequest(
  input: CreateMergeRequestInput
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/gitlab/mrs", jsonInit(input))
}

export async function fetchMergeRequest(
  ctx: RepoContext,
  number: number,
  signal?: AbortSignal
): Promise<MergeRequestDetail> {
  const res = await apiFetch<{ mr: MergeRequestDetail }>(
    `/gitlab/mrs/${number}?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.mr
}

export async function fetchCommitDiff(
  ctx: RepoContext,
  oid: string,
  signal?: AbortSignal
): Promise<CommitDiffFile[]> {
  const res = await apiFetch<{ files: CommitDiffFile[] }>(
    `/gitlab/commits/${oid}/diff?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.files
}

export async function fetchMergeRequestReview(
  ctx: RepoContext,
  number: number,
  signal?: AbortSignal
): Promise<MergeRequestReview> {
  const res = await apiFetch<{ review: MergeRequestReview }>(
    `/gitlab/mrs/${number}/review?${ctxQuery(ctx)}`,
    { signal }
  )
  return res.review
}

export async function createMergeRequestReviewComment(
  ctx: RepoContext,
  number: number,
  input: CreateReviewCommentInput
): Promise<MergeRequestReviewComment> {
  const res = await apiFetch<{ comment: MergeRequestReviewComment }>(
    `/gitlab/mrs/${number}/review-comments`,
    jsonInit({ ...ctx, ...input })
  )
  return res.comment
}

export async function replyToMergeRequestReviewComment(
  ctx: RepoContext,
  number: number,
  discussionId: string,
  body: string
): Promise<MergeRequestReviewComment> {
  const res = await apiFetch<{ comment: MergeRequestReviewComment }>(
    `/gitlab/mrs/${number}/discussions/${encodeURIComponent(discussionId)}/replies`,
    jsonInit({ ...ctx, body })
  )
  return res.comment
}

export async function commentMergeRequest(
  ctx: RepoContext,
  number: number,
  body: string
): Promise<void> {
  await apiFetch(`/gitlab/mrs/${number}/comment`, jsonInit({ ...ctx, body }))
}

export async function checkoutMergeRequest(
  ctx: RepoContext,
  number: number
): Promise<void> {
  await apiFetch(`/gitlab/mrs/${number}/checkout`, jsonInit(ctx))
}

export async function mergeMergeRequest(
  ctx: RepoContext,
  number: number,
  squash: boolean,
  auto = false
): Promise<void> {
  await apiFetch(
    `/gitlab/mrs/${number}/merge`,
    jsonInit({ ...ctx, squash, auto })
  )
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
