import { useQuery } from "@tanstack/react-query"
import {
  fetchGitlabRepoInfo,
  fetchGlabStatus,
  fetchIssues,
  fetchMergeRequests,
} from "./api"
import type { IssueState, MergeRequestState, RepoContext } from "./types"

const root = ["gitlab"] as const

function ctxKey(ctx: RepoContext): string {
  return ctx.id ?? ctx.ws ?? ctx.path ?? ""
}

export const gitlabKeys = {
  all: root,
  status: () => [...root, "status"] as const,
  repo: (ctx: RepoContext) => [...root, "repo", ctxKey(ctx)] as const,
  mrs: (ctx: RepoContext, state: MergeRequestState) =>
    [...root, "mrs", ctxKey(ctx), state] as const,
  issues: (ctx: RepoContext, state: IssueState) =>
    [...root, "issues", ctxKey(ctx), state] as const,
}

export function useGlabStatus(ctx: RepoContext = {}) {
  return useQuery({
    queryKey: gitlabKeys.status(),
    queryFn: ({ signal }) => fetchGlabStatus(ctx, signal),
    staleTime: 30 * 1000,
  })
}

export function useGitlabConnected(ctx: RepoContext = {}) {
  const { data } = useGlabStatus(ctx)
  return Boolean(data?.installed && data?.authenticated)
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
  })
}
