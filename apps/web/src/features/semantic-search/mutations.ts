import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  triggerSemanticReindex,
  updateSemanticIndexConfig,
  type SemanticIndexConfigUpdate,
} from "./api"
import { semanticSearchKeys } from "./queries"

export function useTriggerSemanticReindex() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workspaceId: string) => triggerSemanticReindex(workspaceId),
    onSuccess: (_data, workspaceId) => {
      queryClient.invalidateQueries({
        queryKey: semanticSearchKeys.status(workspaceId),
      })
    },
  })
}

export function useUpdateSemanticIndexConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workspaceId,
      update,
    }: {
      workspaceId: string
      update: SemanticIndexConfigUpdate
    }) => updateSemanticIndexConfig(workspaceId, update),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: semanticSearchKeys.status(workspaceId),
      })
    },
  })
}
