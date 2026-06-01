import { useQuery } from "@tanstack/react-query"
import {
  fetchProviders,
  fetchOAuthProviders,
  fetchAppSettings,
  fetchLocalProviders,
} from "./api"

const settingsRootKey = ["settings"] as const

export const settingsKeys = {
  all: settingsRootKey,
  app: [...settingsRootKey, "app"] as const,
  providers: [...settingsRootKey, "providers"] as const,
  oauthProviders: [...settingsRootKey, "oauth-providers"] as const,
  localProviders: [...settingsRootKey, "local-providers"] as const,
}

export const appSettingsQueryKey = settingsKeys.app

export function useAppSettings() {
  return useQuery({
    queryKey: appSettingsQueryKey,
    queryFn: () => fetchAppSettings(),
    staleTime: Infinity,
  })
}

export const providersQueryKey = settingsKeys.providers

export function useProviders() {
  return useQuery({
    queryKey: providersQueryKey,
    queryFn: ({ signal }) => fetchProviders(signal),
    staleTime: 30 * 1000,
  })
}

export const oauthProvidersQueryKey = settingsKeys.oauthProviders

export function useOAuthProviders() {
  return useQuery({
    queryKey: oauthProvidersQueryKey,
    queryFn: ({ signal }) => fetchOAuthProviders(signal),
    staleTime: 10 * 1000,
  })
}

export const localProvidersQueryKey = settingsKeys.localProviders

export function useLocalProviders() {
  return useQuery({
    queryKey: localProvidersQueryKey,
    queryFn: ({ signal }) => fetchLocalProviders(signal),
    staleTime: 30 * 1000,
  })
}
