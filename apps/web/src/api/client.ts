const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  "http://localhost:3001"

export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
