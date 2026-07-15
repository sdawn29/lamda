import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  checkoutMergeRequest,
  commentMergeRequest,
  createMergeRequest,
  mergeMergeRequest,
  publishGitlabRepository,
} from "./api"
import { gitlabKeys } from "./queries"
import type {
  CreateMergeRequestInput,
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
    mutationFn: ({ number, squash }: { number: number; squash: boolean }) =>
      mergeMergeRequest(ctx, number, squash),
    onSuccess: (_data, { number }) => {
      qc.invalidateQueries({ queryKey: [...gitlabKeys.all, "mrs"] })
      qc.invalidateQueries({ queryKey: gitlabKeys.mr(ctx, number) })
    },
  })
}
