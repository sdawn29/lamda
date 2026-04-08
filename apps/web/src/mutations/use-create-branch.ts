import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createBranch } from "@/api/sessions"
import { branchKey } from "@/queries/use-branch"
import { branchesKey } from "@/queries/use-branches"

export function useCreateBranch(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branch: string) => createBranch(sessionId, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKey(sessionId) })
      queryClient.invalidateQueries({ queryKey: branchesKey(sessionId) })
    },
  })
}
