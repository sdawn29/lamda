import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/shared/ui/command"
import { getFileIcon } from "@/shared/ui/file-icon"
import { useWorkspaceIndex, useWorkspaces } from "@/features/workspace/queries"
import { getServerUrl } from "@/shared/lib/client"

interface FileSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Called with the relative path of the selected file (relative to workspace root) */
  onSelect: (relativePath: string) => void
}

export function FileSearchModal({
  open,
  onOpenChange,
  workspaceId,
  onSelect,
}: FileSearchModalProps) {
  const { data: workspaces = [] } = useWorkspaces()
  const { data: entries = [], isLoading } = useWorkspaceIndex(workspaceId)
  const [ignoredFolderPrefixes, setIgnoredFolderPrefixes] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  const workspacePath = useMemo(
    () => workspaces.find((w) => w.id === workspaceId)?.path,
    [workspaces, workspaceId]
  )

  useEffect(() => {
    let cancelled = false

    async function loadGitignoreFolders() {
      if (!workspacePath) {
        setIgnoredFolderPrefixes([])
        return
      }

      try {
        const base = await getServerUrl()
        const gitignorePath = `${workspacePath.replace(/\/$/, "")}/.gitignore`
        const res = await fetch(
          `${base}/file?path=${encodeURIComponent(gitignorePath)}`
        )
        if (!res.ok) {
          if (!cancelled) setIgnoredFolderPrefixes([])
          return
        }
        const text = await res.text()
        if (cancelled) return
        setIgnoredFolderPrefixes(extractIgnoredFolderPrefixes(text))
      } catch {
        if (!cancelled) setIgnoredFolderPrefixes([])
      }
    }

    void loadGitignoreFolders()
    return () => {
      cancelled = true
    }
  }, [workspacePath])

  const files = useMemo(
    () =>
      entries.filter((e) => {
        if (e.isDirectory) return false
        return !ignoredFolderPrefixes.some(
          (prefix) =>
            e.relativePath === prefix || e.relativePath.startsWith(`${prefix}/`)
        )
      }),
    [entries, ignoredFolderPrefixes]
  )

  const filteredFiles = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return files.slice(0, 300)

    const terms = q.split(/\s+/).filter(Boolean)
    const matched: typeof files = []
    for (const file of files) {
      const haystack = file.relativePath.toLowerCase()
      let ok = true
      for (const term of terms) {
        if (!haystack.includes(term)) {
          ok = false
          break
        }
      }
      if (!ok) continue
      matched.push(file)
      if (matched.length >= 300) break
    }
    return matched
  }, [files, deferredQuery])

  const handleSelect = useCallback(
    (relativePath: string) => {
      onSelect(relativePath)
      onOpenChange(false)
    },
    [onSelect, onOpenChange]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open File"
      description="Search for a file to open"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search files…"
          autoFocus
        />
        <CommandList className="max-h-96">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Indexing workspace…
            </div>
          )}
          {!isLoading && filteredFiles.length === 0 && <CommandEmpty>No files found.</CommandEmpty>}
          {!isLoading && filteredFiles.length > 0 && (
            <CommandGroup>
              {filteredFiles.map((file) => {
                const FileIcon = getFileIcon(file.name)
                const dir = file.relativePath
                  .split(/[/\\]/)
                  .slice(0, -1)
                  .join("/")
                return (
                  <CommandItem
                    key={file.relativePath}
                    value={file.relativePath}
                    onSelect={() => handleSelect(file.relativePath)}
                  >
                    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{file.name}</span>
                      {dir && (
                        <span className="text-muted-foreground/50">
                          {" "}
                          — {dir}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

function extractIgnoredFolderPrefixes(gitignoreText: string): string[] {
  const folders = new Set<string>()

  for (const rawLine of gitignoreText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || line.startsWith("!")) continue

    // Keep this intentionally conservative: only simple folder ignores.
    if (/[*?[\]]/.test(line)) continue

    const normalized = line.replace(/\\/g, "/").replace(/^\/+/, "")
    if (!normalized.endsWith("/")) continue
    const folder = normalized.replace(/\/+$/, "")
    if (!folder) continue
    folders.add(folder)
  }

  return Array.from(folders)
}
