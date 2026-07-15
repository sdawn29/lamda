import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  checkoutPullRequest,
  commentIssue,
  createReviewComment,
  createIssue,
  createPullRequest,
  mergePullRequest,
  publishRepository,
  replyToReviewComment,
} from "./api"
import { githubKeys } from "./queries"
import type {
  CreateReviewCommentInput,
  CreatePrInput,
  MergeMethod,
  PublishRepositoryInput,
  RepoContext,
} from "./types"

export function useCreatePullRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePrInput) => createPullRequest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...githubKeys.all, "prs"] })
    },
  })
}

export function usePublishRepository(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<PublishRepositoryInput, keyof RepoContext>) =>
      publishRepository({ ...ctx, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.repo(ctx) })
      qc.invalidateQueries({ queryKey: githubKeys.repositories() })
    },
  })
}

export function useMergePullRequest(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      number,
      method = "squash",
    }: {
      number: number
      method?: MergeMethod
    }) => mergePullRequest(ctx, number, method),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: [...githubKeys.all, "prs"] })
      qc.invalidateQueries({ queryKey: githubKeys.pr(ctx, number) })
    },
  })
}

export function useCheckoutPullRequest(ctx: RepoContext) {
  return useMutation({
    mutationFn: (number: number) => checkoutPullRequest(ctx, number),
  })
}

export function useCreateIssue(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; body?: string }) =>
      createIssue(ctx, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...githubKeys.all, "issues"] })
    },
  })
}

export function useCommentIssue(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, body }: { number: number; body: string }) =>
      commentIssue(ctx, number, body),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: githubKeys.issue(ctx, number) })
    },
  })
}

/** GitHub exposes PR conversation comments through the issue-comment API. */
export function useCommentPullRequest(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, body }: { number: number; body: string }) =>
      commentIssue(ctx, number, body),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: githubKeys.pr(ctx, number) })
    },
  })
}

export function useCreateReviewComment(ctx: RepoContext, number: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReviewCommentInput) =>
      createReviewComment(ctx, number, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.review(ctx, number) })
    },
  })
}

export function useReplyToReviewComment(ctx: RepoContext, number: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: number; body: string }) =>
      replyToReviewComment(ctx, number, commentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.review(ctx, number) })
    },
  })
}
