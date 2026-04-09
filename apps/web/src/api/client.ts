let resolvedServerUrl: string | null = null

export async function getServerUrl(): Promise<string> {
  if (resolvedServerUrl) return resolvedServerUrl

  if (import.meta.env.VITE_SERVER_URL) {
    resolvedServerUrl = import.meta.env.VITE_SERVER_URL as string
    return resolvedServerUrl
  }

  if (typeof window !== "undefined" && window.electronAPI?.getServerPort) {
    const port = await window.electronAPI.getServerPort()
    resolvedServerUrl = `http://localhost:${port}`
    return resolvedServerUrl
  }

  resolvedServerUrl = "http://localhost:3001"
  return resolvedServerUrl
}

export function apiUrl(path: string): string {
  // Sync fallback used for non-Electron / dev environments where VITE_SERVER_URL is set
  const base =
    resolvedServerUrl ??
    (import.meta.env.VITE_SERVER_URL as string | undefined) ??
    "http://localhost:3001"
  return `${base}${path}`
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = await getServerUrl()
  const res = await fetch(`${base}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T
  }
  return res.json() as Promise<T>
}
