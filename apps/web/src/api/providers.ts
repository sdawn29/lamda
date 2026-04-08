import { apiFetch } from "./client"

export type ProviderKeys = Record<string, string>

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderKeys> {
  const res = await apiFetch<{ providers: ProviderKeys }>("/providers", { signal })
  return res.providers
}

export async function updateProviders(providers: ProviderKeys): Promise<void> {
  await apiFetch("/providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  })
}
