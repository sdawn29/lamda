import { useQuery } from "@tanstack/react-query"
import {
  fetchGitlabRepoInfo,
  fetchGitlabRepositories,
  fetchGlabStatus,
  fetchIssues,
  fetchGitlabPipeline,
  fetchMergeRequest,
  fetchMergeRequestReview,
  fetchMergeRequests,
} from "./api"
import type { IssueState, MergeRequestState, RepoContext } from "./types"

const root = ["gitlab"] as const

/**
 * Polling cadence for the GitLab panel — mirrors the GitHub side. React Query
 * pauses `refetchInterval` while the document is hidden, and the panel
 * unmounts when it isn't the active dock tab (`keepAlive: false`), so neither
 * tier costs anything when nobody is looking. Config-shaped queries (status,
 * repo info, repositories) are deliberately left un-polled.
 */
const DETAIL_POLL_MS = 30 * 1000
const LIST_POLL_MS = 60 * 1000

function ctxKey(ctx: RepoContext): string {
  return ctx.id ?? ctx.ws ?? ctx.path ?? ""
}

export const gitlabKeys = {
  all: root,
  status: (ctx: RepoContext = {}) => {
    const key = ctxKey(ctx)
    return key
      ? ([...root, "status", key] as const)
      : ([...root, "status"] as const)
  },
  repositories: () => [...root, "repositories"] as const,
  repo: (ctx: RepoContext) => [...root, "repo", ctxKey(ctx)] as const,
  mrs: (ctx: RepoContext, state: MergeRequestState) =>
    [...root, "mrs", ctxKey(ctx), state] as const,
  mr: (ctx: RepoContext, number: number) =>
    [...root, "mr", ctxKey(ctx), number] as const,
  review: (ctx: RepoContext, number: number) =>
    [...root, "review", ctxKey(ctx), number] as const,
  pipeline: (ctx: RepoContext, ref?: string) =>
    [...root, "pipeline", ctxKey(ctx), ref ?? "current"] as const,
  issues: (ctx: RepoContext, state: IssueState) =>
    [...root, "issues", ctxKey(ctx), state] as const,
}

export function useGlabStatus(ctx: RepoContext = {}) {
  return useQuery({
    queryKey: gitlabKeys.status(ctx),
    queryFn: ({ signal }) => fetchGlabStatus(ctx, signal),
    staleTime: 30 * 1000,
  })
}

export function useGitlabConnected(ctx: RepoContext = {}) {
  const { data } = useGlabStatus(ctx)
  return Boolean(data?.installed && data?.authenticated)
}

export function useGitlabRepositories(enabled = true) {
  return useQuery({
    queryKey: gitlabKeys.repositories(),
    queryFn: ({ signal }) => fetchGitlabRepositories(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useGitlabRepoInfo(ctx: RepoContext, enabled = true) {
  return useQuery({
    queryKey: gitlabKeys.repo(ctx),
    queryFn: ({ signal }) => fetchGitlabRepoInfo(ctx, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 5 * 60 * 1000,
  })
}

export function useMergeRequests(
  ctx: RepoContext,
  state: MergeRequestState = "opened",
  enabled = true
) {
  return useQuery({
    queryKey: gitlabKeys.mrs(ctx, state),
    queryFn: ({ signal }) => fetchMergeRequests(ctx, state, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
    refetchInterval: LIST_POLL_MS,
  })
}

export function useGitlabPipeline(
  ctx: RepoContext,
  ref?: string,
  enabled = true
) {
  return useQuery({
    queryKey: gitlabKeys.pipeline(ctx, ref),
    queryFn: ({ signal }) => fetchGitlabPipeline(ctx, ref, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
    refetchInterval: LIST_POLL_MS,
  })
}

export function useMergeRequest(ctx: RepoContext, number: number | null) {
  return useQuery({
    queryKey: gitlabKeys.mr(ctx, number ?? 0),
    queryFn: ({ signal }) => fetchMergeRequest(ctx, number as number, signal),
    enabled: Boolean(ctxKey(ctx)) && number != null,
    staleTime: 30 * 1000,
    refetchInterval: DETAIL_POLL_MS,
  })
}

export function useMergeRequestReview(
  ctx: RepoContext,
  number: number,
  enabled = true
) {
  return useQuery({
    queryKey: gitlabKeys.review(ctx, number),
    queryFn: ({ signal }) => fetchMergeRequestReview(ctx, number, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
    refetchInterval: DETAIL_POLL_MS,
  })
}

export function useGitlabIssues(
  ctx: RepoContext,
  state: IssueState = "opened",
  enabled = true
) {
  return useQuery({
    queryKey: gitlabKeys.issues(ctx, state),
    queryFn: ({ signal }) => fetchIssues(ctx, state, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
    refetchInterval: LIST_POLL_MS,
  })
}
