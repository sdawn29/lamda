import { useQuery } from "@tanstack/react-query"
import {
  fetchChecks,
  fetchGhStatus,
  fetchIssue,
  fetchIssues,
  fetchPullRequest,
  fetchPullRequests,
  fetchRepoInfo,
} from "./api"
import type { IssueState, PrState, RepoContext } from "./types"

const root = ["github"] as const

/** Stable cache discriminator for a repo context. */
function ctxKey(ctx: RepoContext): string {
  return ctx.id ?? ctx.ws ?? ctx.path ?? ""
}

export const githubKeys = {
  all: root,
  status: () => [...root, "status"] as const,
  repo: (ctx: RepoContext) => [...root, "repo", ctxKey(ctx)] as const,
  prs: (ctx: RepoContext, state: PrState) =>
    [...root, "prs", ctxKey(ctx), state] as const,
  pr: (ctx: RepoContext, number: number) =>
    [...root, "pr", ctxKey(ctx), number] as const,
  issues: (ctx: RepoContext, state: IssueState, search?: string) =>
    [...root, "issues", ctxKey(ctx), state, search ?? ""] as const,
  issue: (ctx: RepoContext, number: number) =>
    [...root, "issue", ctxKey(ctx), number] as const,
  checks: (ctx: RepoContext, ref?: string, pr?: number) =>
    [...root, "checks", ctxKey(ctx), ref ?? "", pr ?? 0] as const,
}

export function useGhStatus(ctx: RepoContext = {}) {
  return useQuery({
    queryKey: githubKeys.status(),
    queryFn: ({ signal }) => fetchGhStatus(ctx, signal),
    staleTime: 30 * 1000,
  })
}

/** Whether github features should be shown for a context — gh connected. */
export function useGithubConnected(ctx: RepoContext = {}) {
  const { data } = useGhStatus(ctx)
  return Boolean(data?.installed && data?.authenticated)
}

export function useRepoInfo(ctx: RepoContext, enabled = true) {
  return useQuery({
    queryKey: githubKeys.repo(ctx),
    queryFn: ({ signal }) => fetchRepoInfo(ctx, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePullRequests(
  ctx: RepoContext,
  state: PrState = "open",
  enabled = true,
) {
  return useQuery({
    queryKey: githubKeys.prs(ctx, state),
    queryFn: ({ signal }) => fetchPullRequests(ctx, state, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
  })
}

export function usePullRequest(ctx: RepoContext, number: number | null) {
  return useQuery({
    queryKey: githubKeys.pr(ctx, number ?? 0),
    queryFn: ({ signal }) => fetchPullRequest(ctx, number as number, signal),
    enabled: Boolean(ctxKey(ctx)) && number != null,
    staleTime: 30 * 1000,
  })
}

export function useIssues(
  ctx: RepoContext,
  state: IssueState = "open",
  search?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: githubKeys.issues(ctx, state, search),
    queryFn: ({ signal }) => fetchIssues(ctx, state, search, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 30 * 1000,
  })
}

export function useIssue(ctx: RepoContext, number: number | null) {
  return useQuery({
    queryKey: githubKeys.issue(ctx, number ?? 0),
    queryFn: ({ signal }) => fetchIssue(ctx, number as number, signal),
    enabled: Boolean(ctxKey(ctx)) && number != null,
    staleTime: 30 * 1000,
  })
}

export function useChecks(
  ctx: RepoContext,
  opts: { pr?: number; ref?: string } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: githubKeys.checks(ctx, opts.ref, opts.pr),
    queryFn: ({ signal }) => fetchChecks(ctx, opts, signal),
    enabled: enabled && Boolean(ctxKey(ctx)),
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
  })
}
