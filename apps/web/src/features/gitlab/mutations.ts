import { useMutation, useQueryClient } from "@tanstack/react-query"
import { publishGitlabRepository } from "./api"
import { gitlabKeys } from "./queries"
import type { PublishRepositoryInput, RepoContext } from "./types"

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
