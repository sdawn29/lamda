import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  abortOAuthLogin,
  oauthLogout,
  openOAuthWebSocket,
  respondToOAuthPrompt,
  startOAuthLogin,
  updateProviders,
  updateAppSetting,
  saveLocalProvider,
  deleteLocalProvider,
  updateMemoryApi,
  deleteMemoryApi,
  type ProviderKeys,
  type LocalProviderConfig,
} from "./api"
import {
  appSettingsQueryKey,
  oauthProvidersQueryKey,
  providersQueryKey,
  localProvidersQueryKey,
  memoriesQueryKey,
} from "./queries"
import { modelsQueryKey } from "@/features/chat/queries"

export function useUpdateAppSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateAppSetting(key, value),
    onMutate: async ({ key, value }) => {
      const prev = queryClient.getQueryData<Record<string, string>>(appSettingsQueryKey)
      queryClient.setQueryData<Record<string, string>>(appSettingsQueryKey, (current) => ({
        ...(current ?? {}),
        [key]: value,
      }))
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(appSettingsQueryKey, context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: appSettingsQueryKey })
    },
  })
}

export function useUpdateProviders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (providers: ProviderKeys) => updateProviders(providers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersQueryKey })
      queryClient.invalidateQueries({ queryKey: modelsQueryKey })
    },
  })
}

export function useSaveLocalProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: LocalProviderConfig }) =>
      saveLocalProvider(id, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localProvidersQueryKey })
      queryClient.invalidateQueries({ queryKey: modelsQueryKey })
    },
  })
}

export function useDeleteLocalProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteLocalProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localProvidersQueryKey })
      queryClient.invalidateQueries({ queryKey: modelsQueryKey })
    },
  })
}

export function useUpdateMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      fields,
    }: {
      id: string
      fields: { title?: string; content?: string; category?: string | null; pinned?: boolean }
    }) => updateMemoryApi(id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    },
  })
}

export function useDeleteMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMemoryApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    },
  })
}

export function useStartOAuthLogin() {
  return useMutation({
    mutationFn: (providerId: string) => startOAuthLogin(providerId),
  })
}

export function useOpenOAuthWebSocket() {
  return useMutation({
    mutationFn: (loginId: string) => openOAuthWebSocket(loginId),
  })
}

export function useRespondToOAuthPrompt() {
  return useMutation({
    mutationFn: ({
      loginId,
      promptId,
      value,
    }: {
      loginId: string
      promptId: string
      value: string
    }) => respondToOAuthPrompt(loginId, promptId, value),
  })
}

export function useAbortOAuthLogin() {
  return useMutation({
    mutationFn: (loginId: string) => abortOAuthLogin(loginId),
  })
}

export function useOAuthLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (providerId: string) => oauthLogout(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthProvidersQueryKey })
      queryClient.invalidateQueries({ queryKey: modelsQueryKey })
    },
  })
}
