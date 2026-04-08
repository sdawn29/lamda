import { useMutation, useQueryClient } from "@tanstack/react-query"
import { checkoutBranch } from "@/api/sessions"
import { branchKey } from "@/queries/use-branch"

export function useCheckoutBranch(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branch: string) => checkoutBranch(sessionId, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKey(sessionId) })
    },
  })
}
