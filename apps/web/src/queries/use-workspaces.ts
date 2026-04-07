import { useQuery } from "@tanstack/react-query"
import { listWorkspaces, type WorkspaceDto } from "@/api/workspaces"

export const workspacesQueryKey = ["workspaces"] as const

export function useWorkspaces() {
  return useQuery({
    queryKey: workspacesQueryKey,
    queryFn: async (): Promise<WorkspaceDto[]> => {
      const { workspaces } = await listWorkspaces()
      return workspaces
    },
    staleTime: 5 * 60 * 1000,
  })
}
