import { useQuery } from "@tanstack/react-query"
import {
  listWorkspaces,
  listWorkspaceIndexFiles,
  listWorkspaceDir,
  type WorkspaceDto,
  type WorkspaceFileEntry,
} from "./api"

export const workspaceKeys = {
  all: ["workspaces"] as const,
  files: (workspaceId: string) => ["workspace-files", workspaceId] as const,
  // Keyed by the effective root directory (workspace path, or a worktree path
  // when the active thread runs in one) rather than the workspace id, so the
  // tree's worktree and workspace views of the same relative path stay distinct
  // and the `workspace_dir_changed` event (which carries `root`) matches.
  dir: (root: string, relPath: string) =>
    ["workspace-dir", root, relPath] as const,
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
    queryKey: workspaceId ? workspaceKeys.files(workspaceId) : (["workspace-files-none"] as const),
    queryFn: async (): Promise<WorkspaceFileEntry[]> => {
      const { files } = await listWorkspaceIndexFiles(workspaceId!)
      return files
    },
    enabled: enabled && !!workspaceId,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Lazily loads the immediate children of one directory for the file tree.
 * Each expanded directory has its own query; the server invalidates a single
 * directory via the `workspace_dir_changed` WebSocket event.
 */
export function useWorkspaceDir(
  workspaceId: string | undefined,
  relPath: string,
  enabled = true
) {
  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.dir(workspaceId, relPath)
      : (["workspace-dir-none"] as const),
    queryFn: async (): Promise<WorkspaceFileEntry[]> => {
      const { entries } = await listWorkspaceDir(workspaceId!, relPath)
      return entries
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  })
}
