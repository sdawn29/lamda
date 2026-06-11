import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  fetchProviders,
  fetchOAuthProviders,
  fetchAppSettings,
  fetchLocalProviders,
  fetchAiUsage,
  type AiUsageRange,
} from "./api"

const settingsRootKey = ["settings"] as const

export const settingsKeys = {
  all: settingsRootKey,
  app: [...settingsRootKey, "app"] as const,
  providers: [...settingsRootKey, "providers"] as const,
  oauthProviders: [...settingsRootKey, "oauth-providers"] as const,
  localProviders: [...settingsRootKey, "local-providers"] as const,
  aiUsage: (range: AiUsageRange) =>
    [...settingsRootKey, "ai-usage", range] as const,
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

export function useAiUsage(range: AiUsageRange) {
  return useQuery({
    queryKey: settingsKeys.aiUsage(range),
    queryFn: ({ signal }) => fetchAiUsage(range, signal),
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
    // Keep showing the previous range's data while the new one loads, so
    // switching ranges never flashes a loading state.
    placeholderData: keepPreviousData,
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
