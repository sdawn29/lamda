import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openExternal,
  openPath,
  openWorkspaceWithApp,
  selectFolder,
  type SelectFolderOptions,
} from "./api"
import { electronKeys } from "./queries"

export function useSelectFolder() {
  return useMutation({
    mutationFn: (options?: SelectFolderOptions) => selectFolder(options),
  })
}

export function useOpenPath() {
  return useMutation({
    mutationFn: (path: string) => openPath(path),
  })
}

export function useOpenWorkspaceWithApp() {
  return useMutation({
    mutationFn: ({
      workspacePath,
      appId,
    }: {
      workspacePath: string
      appId?: string
    }) => openWorkspaceWithApp(workspacePath, appId),
  })
}

export function useOpenExternal() {
  return useMutation({
    mutationFn: (url: string) => openExternal(url),
  })
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: checkForUpdates,
    onSuccess: (status) => {
      queryClient.setQueryData(electronKeys.updateStatus, status)
    },
  })
}

export function useDownloadUpdate() {
  return useMutation({
    mutationFn: downloadUpdate,
  })
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: installUpdate,
  })
}
