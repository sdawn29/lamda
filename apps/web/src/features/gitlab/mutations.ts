import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createMergeRequest, publishGitlabRepository } from "./api"
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
