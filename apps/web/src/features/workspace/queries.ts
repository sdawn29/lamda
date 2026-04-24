import { useQuery } from "@tanstack/react-query"
import { listWorkspaces, listWorkspaceIndexFiles, type WorkspaceDto, type WorkspaceFileEntry } from "./api"

export const workspaceKeys = {
  all: ["workspaces"] as const,
  files: (workspaceId: string) => ["workspace-files", workspaceId] as const,
}

export const workspacesQueryKey = workspaceKeys.all

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

export { type WorkspaceFileEntry }

export function useWorkspaceIndex(workspaceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.files(workspaceId) : workspaceKeys.all,
    queryFn: async (): Promise<WorkspaceFileEntry[]> => {
      const { files } = await listWorkspaceIndexFiles(workspaceId!)
      return files
    },
    enabled: enabled && !!workspaceId,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  })
}
