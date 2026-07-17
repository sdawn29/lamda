import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  checkoutMergeRequest,
  commentMergeRequest,
  createMergeRequest,
  createMergeRequestReviewComment,
  mergeMergeRequest,
  publishGitlabRepository,
  replyToMergeRequestReviewComment,
} from "./api"
import { gitlabKeys } from "./queries"
import type {
  CreateMergeRequestInput,
  CreateReviewCommentInput,
  PublishRepositoryInput,
  RepoContext,
} from "./types"

export function usePublishGitlabRepository(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<PublishRepositoryInput, keyof RepoContext>) =>
      publishGitlabRepository({ ...ctx, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitlabKeys.repo(ctx) })
    },
  })
}

export function useCreateMergeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMergeRequestInput) => createMergeRequest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...gitlabKeys.all, "mrs"] })
    },
  })
}

export function useCommentMergeRequest(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, body }: { number: number; body: string }) =>
      commentMergeRequest(ctx, number, body),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: gitlabKeys.mr(ctx, number) })
    },
  })
}

export function useCheckoutMergeRequest(ctx: RepoContext) {
  return useMutation({
    mutationFn: (number: number) => checkoutMergeRequest(ctx, number),
  })
}

export function useMergeMergeRequest(ctx: RepoContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      number,
      squash,
      auto = false,
    }: {
      number: number
      squash: boolean
      auto?: boolean
    }) => mergeMergeRequest(ctx, number, squash, auto),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: [...gitlabKeys.all, "mrs"] })
      qc.invalidateQueries({ queryKey: gitlabKeys.mr(ctx, number) })
    },
  })
}

export function useCreateMergeRequestReviewComment(
  ctx: RepoContext,
  number: number
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReviewCommentInput) =>
      createMergeRequestReviewComment(ctx, number, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitlabKeys.review(ctx, number) })
    },
  })
}

export function useReplyToMergeRequestReviewComment(
  ctx: RepoContext,
  number: number
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      discussionId,
      body,
    }: {
      discussionId: string
      body: string
    }) => replyToMergeRequestReviewComment(ctx, number, discussionId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitlabKeys.review(ctx, number) })
    },
  })
}
