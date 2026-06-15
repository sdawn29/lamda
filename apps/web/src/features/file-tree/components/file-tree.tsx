import {
  createElement,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useQueries } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { SidebarHeader } from "@/shared/ui/sidebar"
import { getFileIcon } from "@/shared/ui/file-icon"
import { useMainTabs } from "@/features/main-tabs"
import {
  useWorkspaceIndex,
  workspaceKeys,
  type WorkspaceFileEntry,
} from "@/features/workspace/queries"
import {
  listWorkspaceDir,
  triggerWorkspaceReindex,
} from "@/features/workspace/api"
import { cn } from "@/shared/lib/utils"
import { useFileTree } from "../store"

interface FileTreeProps {
  workspaceId: string
  workspacePath: string
}

const ROW_HEIGHT = 24

interface FlatRow {
  entry: WorkspaceFileEntry
  depth: number
}

/** Walks the loaded directory map from the root, emitting one flat row per visible node. */
function flattenTree(
  dirMap: Map<string, WorkspaceFileEntry[]>,
  expanded: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = []
  const walk = (relPath: string, depth: number) => {
    const entries = dirMap.get(relPath)
    if (!entries) return
    for (const entry of entries) {
      rows.push({ entry, depth })
      if (entry.isDirectory && expanded.has(entry.relativePath)) {
        walk(entry.relativePath, depth + 1)
      }
    }
  }
  walk("", 0)
  return rows
}

function fuzzyMatch(value: string, query: string): boolean {
  const target = value.toLowerCase()
  const needle = query.toLowerCase()
  let targetIndex = 0
  for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
    const char = needle[needleIndex]
    if (char === " ") continue
    targetIndex = target.indexOf(char, targetIndex)
    if (targetIndex === -1) return false
    targetIndex++
  }
  return true
}

const TreeRow = memo(function TreeRow({
  entry,
  depth,
  isExpanded,
  showFullPath,
  onToggleDir,
  onSelectFile,
}: {
  entry: WorkspaceFileEntry
  depth: number
  isExpanded: boolean
  showFullPath: boolean
  onToggleDir: (relativePath: string) => void
  onSelectFile: (relativePath: string) => void
}) {
  const handleClick = useCallback(() => {
    if (entry.isDirectory) onToggleDir(entry.relativePath)
    else onSelectFile(entry.relativePath)
  }, [entry.isDirectory, entry.relativePath, onToggleDir, onSelectFile])

  return (
    <button
      type="button"
      onClick={handleClick}
      title={entry.relativePath}
      aria-expanded={entry.isDirectory ? isExpanded : undefined}
      className={cn(
        "group flex h-6 w-full items-center gap-1 rounded-md pr-1.5 text-left text-xs text-sidebar-foreground/80 transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:outline-none"
      )}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
    >
      {entry.isDirectory ? (
        isExpanded ? (
          <ChevronDown className="size-3 shrink-0 text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/70" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/70" />
        )
      ) : (
        <span className="size-3 shrink-0" />
      )}
      {entry.isDirectory ? (
        isExpanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-colors group-hover:text-sidebar-foreground/80" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-colors group-hover:text-sidebar-foreground/80" />
        )
      ) : (
        createElement(getFileIcon(entry.name), {
          className:
            "size-3.5 shrink-0 text-sidebar-foreground/60 transition-colors group-hover:text-sidebar-foreground/85",
        })
      )}
      <span
        className={cn(
          "min-w-0 truncate",
          entry.isDirectory && "font-medium text-sidebar-foreground/85"
        )}
      >
        {showFullPath ? entry.relativePath : entry.name}
      </span>
    </button>
  )
})

const SKELETON_ROWS = [
  { indent: 0, width: "w-24" },
  { indent: 1, width: "w-20" },
  { indent: 1, width: "w-28" },
  { indent: 1, width: "w-16" },
  { indent: 0, width: "w-20" },
  { indent: 1, width: "w-24" },
  { indent: 1, width: "w-32" },
  { indent: 0, width: "w-16" },
]

function FileTreeSkeleton() {
  return (
    <div className="space-y-0 p-1 animate-in fade-in duration-200">
      {SKELETON_ROWS.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-1 py-0"
          style={{ paddingLeft: `${row.indent * 12 + 8}px` }}
        >
          <Skeleton className="size-3 shrink-0 rounded-sm" />
          <Skeleton className="size-3.5 shrink-0 rounded-sm" />
          <Skeleton className={`h-2.5 rounded-sm ${row.width}`} />
        </div>
      ))}
    </div>
  )
}

export function FileTree({ workspaceId, workspacePath }: FileTreeProps) {
  const { addFileTab } = useMainTabs()
  const expanded = useFileTree((s) => s.expanded)
  const toggleDir = useFileTree((s) => s.toggleDir)
  const collapseAll = useFileTree((s) => s.collapseAll)
  const revealTarget = useFileTree((s) => s.revealTarget)
  const clearRevealTarget = useFileTree((s) => s.clearRevealTarget)

  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState("")
  const deferredFilter = useDeferredValue(filter)
  const isFiltering = deferredFilter.trim().length > 0

  const scrollParentRef = useRef<HTMLDivElement>(null)

  // Reset expansion when switching workspaces (paths are workspace-relative).
  useEffect(() => {
    collapseAll()
  }, [workspaceId, collapseAll])

  // ── Lazy tree: one query per visible directory (root + expanded) ────────────
  const dirsToFetch = useMemo(() => ["", ...expanded], [expanded])
  const dirQueries = useQueries({
    queries: dirsToFetch.map((relPath) => ({
      queryKey: workspaceKeys.dir(workspaceId, relPath),
      queryFn: async () =>
        (await listWorkspaceDir(workspaceId, relPath)).entries,
      enabled: !!workspaceId,
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    })),
  })

  const dirMap = useMemo(() => {
    const map = new Map<string, WorkspaceFileEntry[]>()
    dirsToFetch.forEach((relPath, i) => {
      const data = dirQueries[i]?.data
      if (data) map.set(relPath, data)
    })
    return map
  }, [dirsToFetch, dirQueries])

  const treeRows = useMemo(
    () => flattenTree(dirMap, expanded),
    [dirMap, expanded]
  )

  // ── Filter mode: flat fuzzy search over the git-driven index (no node_modules) ─
  const { data: indexEntries = [] } = useWorkspaceIndex(workspaceId)
  const indexFileCount = useMemo(
    () => indexEntries.reduce((n, e) => (e.isDirectory ? n : n + 1), 0),
    [indexEntries]
  )

  const searchRows = useMemo<FlatRow[]>(() => {
    if (!isFiltering) return []
    const terms = deferredFilter.trim().split(/\s+/).filter(Boolean)
    const matched: FlatRow[] = []
    for (const entry of indexEntries) {
      if (entry.isDirectory) continue
      if (terms.every((term) => fuzzyMatch(entry.relativePath, term))) {
        matched.push({ entry, depth: 0 })
        if (matched.length >= 500) break
      }
    }
    return matched
  }, [isFiltering, deferredFilter, indexEntries])

  const rows = isFiltering ? searchRows : treeRows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Scroll a revealed directory into view once its row exists (its ancestors
  // have loaded). Filter mode hides the tree rows, so skip while filtering.
  useEffect(() => {
    if (!revealTarget || isFiltering) return
    const index = treeRows.findIndex(
      (row) => row.entry.relativePath === revealTarget
    )
    if (index === -1) return
    virtualizer.scrollToIndex(index, { align: "center" })
    clearRevealTarget()
  }, [revealTarget, isFiltering, treeRows, virtualizer, clearRevealTarget])

  const handleSelectFile = useCallback(
    (relativePath: string) => {
      const filePath = `${workspacePath}/${relativePath}`
      const name = relativePath.split("/").pop() || relativePath
      addFileTab({ filePath, title: name, workspacePath })
    },
    [addFileTab, workspacePath]
  )

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await triggerWorkspaceReindex(workspaceId)
    } catch {
      // The WebSocket will invalidate caches; nothing to surface here.
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, workspaceId])

  const rootQuery = dirQueries[0]
  const showSkeleton =
    !isFiltering && (rootQuery?.isLoading ?? true) && treeRows.length === 0
  const isEmpty = !isFiltering && !showSkeleton && treeRows.length === 0
  const showSpinner = refreshing || (rootQuery?.isFetching ?? false)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-sidebar-border/80 bg-sidebar text-sidebar-foreground shadow-sm">
      <SidebarHeader className="gap-1 border-b bg-sidebar/95 px-1.5 py-1.5">
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter files"
              aria-label="Filter files"
              className="h-7 border-sidebar-border/70 bg-sidebar-accent/35 pl-7 pr-7 text-xs text-sidebar-foreground shadow-none placeholder:text-sidebar-foreground/40 focus-visible:border-sidebar-border focus-visible:ring-0"
            />
            {filter && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setFilter("")}
                aria-label="Clear file filter"
                className="absolute right-1 top-1/2 size-5 -translate-y-1/2 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            disabled={showSpinner}
            className="size-7 shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <RefreshCw className={`size-3.5 ${showSpinner ? "animate-spin" : ""}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
        {!showSkeleton && (
          <div className="flex h-4 items-center justify-between px-0.5 text-3xs leading-none text-sidebar-foreground/45">
            <span>
              {isFiltering
                ? `${searchRows.length} matches`
                : `${indexFileCount} files`}
            </span>
            {showSpinner && <span>Indexing</span>}
          </div>
        )}
      </SidebarHeader>

      <div ref={scrollParentRef} className="min-h-0 flex-1 overflow-auto p-1">
        {showSkeleton ? (
          <FileTreeSkeleton />
        ) : isEmpty ? (
          <div className="p-2 text-3xs text-sidebar-foreground/50">
            No files indexed
          </div>
        ) : isFiltering && searchRows.length === 0 ? (
          <div className="p-2 text-3xs text-sidebar-foreground/50">
            No matching files
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]!
              return (
                <div
                  key={row.entry.relativePath}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TreeRow
                    entry={row.entry}
                    depth={row.depth}
                    isExpanded={
                      row.entry.isDirectory &&
                      expanded.has(row.entry.relativePath)
                    }
                    showFullPath={isFiltering}
                    onToggleDir={toggleDir}
                    onSelectFile={handleSelectFile}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
