import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/shared/lib/client"

export interface DirectoryEntry {
  name: string
  path: string
  type: "file" | "directory"
}

export const fileTreeKeys = {
  directory: (path: string) => ["file-tree", "directory", path] as const,
}

export async function fetchDirectory(
  path: string
): Promise<DirectoryEntry[]> {
  try {
    return await apiFetch<DirectoryEntry[]>(
      `/directory?path=${encodeURIComponent(path)}`
    )
  } catch {
    return []
  }
}

export function useDirectoryEntries(path: string | null) {
  return useQuery({
    queryKey: fileTreeKeys.directory(path ?? ""),
    queryFn: () => {
      if (!path) return []
      return fetchDirectory(path)
    },
    enabled: !!path,
    staleTime: 0,
  })
}