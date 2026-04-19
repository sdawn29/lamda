import {
  queryOptions,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import {
  getElectronPlatform,
  getFullscreen,
  getOpenWithAppIcon,
  getServerPort,
  getServerStatus,
  getUpdateStatus,
  listOpenWithApps,
  subscribeToFullscreen,
  subscribeToServerStatus,
  subscribeToUpdateStatus,
  type OpenWithApp,
} from "./api"

const electronRootKey = ["electron"] as const

export const electronKeys = {
  all: electronRootKey,
  platform: [...electronRootKey, "platform"] as const,
  serverPort: [...electronRootKey, "server-port"] as const,
  serverStatus: [...electronRootKey, "server-status"] as const,
  fullscreen: [...electronRootKey, "fullscreen"] as const,
  openWithApps: [...electronRootKey, "open-with-apps"] as const,
  openWithAppIcon: (appId: string) =>
    [...electronRootKey, "open-with-app-icon", appId] as const,
  updateStatus: [...electronRootKey, "update-status"] as const,
}

export function electronPlatformQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.platform,
    queryFn: getElectronPlatform,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    initialData: getElectronPlatform,
  })
}

export function electronServerPortQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.serverPort,
    queryFn: getServerPort,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
}

export function electronServerStatusQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.serverStatus,
    queryFn: getServerStatus,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
}

function electronFullscreenQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.fullscreen,
    queryFn: getFullscreen,
    staleTime: Number.POSITIVE_INFINITY,
    initialData: false,
  })
}

function openWithAppsQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.openWithApps,
    queryFn: listOpenWithApps,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

function openWithAppIconQueryOptions(appId: string) {
  return queryOptions({
    queryKey: electronKeys.openWithAppIcon(appId),
    queryFn: () => getOpenWithAppIcon(appId),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: !!appId,
  })
}

export function useElectronPlatform() {
  return useQuery(electronPlatformQueryOptions())
}

export function useElectronServerPort() {
  return useQuery(electronServerPortQueryOptions())
}

export function useElectronServerStatus() {
  const queryClient = useQueryClient()
  const query = useQuery(electronServerStatusQueryOptions())

  useEffect(() => {
    return subscribeToServerStatus((status) => {
      queryClient.setQueryData(electronKeys.serverStatus, status)
      queryClient.setQueryData(electronKeys.serverPort, status.port)
    })
  }, [queryClient])

  return query
}

export function useElectronFullscreen() {
  const queryClient = useQueryClient()
  const query = useQuery(electronFullscreenQueryOptions())

  useEffect(() => {
    return subscribeToFullscreen((isFullscreen) => {
      queryClient.setQueryData(electronKeys.fullscreen, isFullscreen)
    })
  }, [queryClient])

  return query
}

export function useOpenWithApps(enabled = true) {
  return useQuery({
    ...openWithAppsQueryOptions(),
    enabled,
  })
}

export function useOpenWithAppIcons(appIds: string[], enabled = true) {
  return useQueries({
    queries: appIds.map((appId) => ({
      ...openWithAppIconQueryOptions(appId),
      enabled: enabled && !!appId,
    })),
    combine: (results) => {
      const iconsByAppId: Record<string, string | null | undefined> = {}

      for (const [index, result] of results.entries()) {
        const appId = appIds[index]
        if (!appId) continue
        iconsByAppId[appId] = result.data
      }

      return {
        data: iconsByAppId,
        isLoading: results.some((result) => result.isLoading),
        isFetching: results.some((result) => result.isFetching),
      }
    },
  })
}

export function electronUpdateStatusQueryOptions() {
  return queryOptions({
    queryKey: electronKeys.updateStatus,
    queryFn: getUpdateStatus,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
}

export function useElectronUpdateStatus() {
  const queryClient = useQueryClient()
  const query = useQuery(electronUpdateStatusQueryOptions())

  useEffect(() => {
    return subscribeToUpdateStatus((status) => {
      queryClient.setQueryData(electronKeys.updateStatus, status)
    })
  }, [queryClient])

  return query
}

export type { OpenWithApp }
