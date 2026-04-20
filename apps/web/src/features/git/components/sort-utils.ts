import { type ChangedFile } from "./status-badge"

export type SortMode = "name" | "name-desc" | "status" | "path"

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "name", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
  { value: "status", label: "Status" },
  { value: "path", label: "Path" },
]

const STATUS_ORDER: Record<string, number> = { A: 0, M: 1, R: 2, D: 3, U: 4 }

export function statusLabel(file: ChangedFile): string {
  if (file.isUntracked) return "U"
  const X = file.raw[0] ?? " "
  const Y = file.raw[1] ?? " "
  if (X !== " " && Y !== " ") return "M*"
  if (X !== " ") return X
  return Y
}

export function applySortMode(
  files: ChangedFile[],
  sort: SortMode
): ChangedFile[] {
  const sorted = [...files]
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => {
        const na = a.filePath.split("/").pop() ?? a.filePath
        const nb = b.filePath.split("/").pop() ?? b.filePath
        return na.localeCompare(nb)
      })
    case "name-desc":
      return sorted.sort((a, b) => {
        const na = a.filePath.split("/").pop() ?? a.filePath
        const nb = b.filePath.split("/").pop() ?? b.filePath
        return nb.localeCompare(na)
      })
    case "status":
      return sorted.sort((a, b) => {
        const la = statusLabel(a)
        const lb = statusLabel(b)
        return (
          (STATUS_ORDER[la] ?? 5) - (STATUS_ORDER[lb] ?? 5) ||
          a.filePath.localeCompare(b.filePath)
        )
      })
    case "path":
      return sorted.sort((a, b) => a.filePath.localeCompare(b.filePath))
  }
}