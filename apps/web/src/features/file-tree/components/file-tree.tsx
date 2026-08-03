import {
  createElement,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import { useQueries } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  Locate,
  MessageSquarePlus,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { SidebarHeader } from "@/shared/ui/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu"
import { getFileIcon } from "@/shared/ui/file-icon"
import { openFileTab, useDockStore, activeScope } from "@/features/dock"
import { useOpenPath } from "@/features/electron"
// Deep import (not the chat barrel) to avoid a feature-cycle through chat.
import { useChatActions } from "@/features/chat/contexts/chat-actions-context"
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
  /**
   * Effective root directory of the tree: the workspace path, or the active
   * thread's worktree path when it runs in one. File reads, the open-file path,
   * and the dir cache key all derive from this so the tree follows the thread
   * into its worktree.
   */
  workspacePath: string
  /** Active thread id — sent so the server reads the thread's worktree dir. */
  threadId?: string | null
  /**
   * Git status by repo-relative path (matches entry.relativePath). Files get a
   * coloured status letter; folders containing changes get a dot. Optional so
   * the tree works outside a git context.
   */
  gitStatus?: Map<string, { label: string; className: string }>
}

const ROW_HEIGHT = 24

interface FlatRow {
  entry: WorkspaceFileEntry
  depth: number
}

/** Walks the loaded directory map from the root, emitting one flat row per visible node. */
function flattenTree(
  dirMap: Map<string, WorkspaceFileEntry[]>,
  expanded: Set<string>
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

/** DOM id for a row, referenced by the tree container's aria-activedescendant. */
function rowDomId(relativePath: string): string {
  return `file-tree-row-${relativePath}`
}

const TreeRow = memo(function TreeRow({
  entry,
  depth,
  isExpanded,
  isActive,
  isFocused,
  showFullPath,
  status,
  dirHasChange,
  onToggleDir,
  onSelectFile,
}: {
  entry: WorkspaceFileEntry
  depth: number
  isExpanded: boolean
  /** The file currently shown in the dock's active file tab. */
  isActive: boolean
  /** The keyboard-navigation cursor (aria-activedescendant target). */
  isFocused: boolean
  showFullPath: boolean
  status?: { label: string; className: string }
  dirHasChange?: boolean
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
      id={rowDomId(entry.relativePath)}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isFocused}
      aria-current={isActive ? "true" : undefined}
      tabIndex={-1}
      onClick={handleClick}
      title={entry.relativePath}
      aria-expanded={entry.isDirectory ? isExpanded : undefined}
      className={cn(
        "group relative flex h-6 w-full items-center gap-1 rounded-md pr-1.5 text-left text-xs text-sidebar-foreground/80 transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:outline-none",
        isFocused && "bg-sidebar-accent/60 text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
    >
      {depth > 0 &&
        Array.from({ length: depth }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-sidebar-foreground/10"
            style={{ left: `${i * 12 + 11.5}px` }}
          />
        ))}
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
          entry.isDirectory && "font-medium text-sidebar-foreground/85",
          dirHasChange && "text-amber-600 dark:text-amber-400",
          status?.className
        )}
      >
        {showFullPath ? entry.relativePath : entry.name}
      </span>
      {status ? (
        <span
          className={cn(
            "ml-auto shrink-0 font-mono text-3xs leading-none font-semibold",
            status.className
          )}
        >
          {status.label}
        </span>
      ) : (
        dirHasChange && (
          <span
            aria-hidden
            className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500/80"
          />
        )
      )}
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
    <div className="animate-in space-y-0 p-1 duration-200 fade-in">
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

export function FileTree({
  workspaceId,
  workspacePath,
  threadId,
  gitStatus,
}: FileTreeProps) {
  const expanded = useFileTree((s) => s.expanded)
  const toggleDir = useFileTree((s) => s.toggleDir)
  const collapseAll = useFileTree((s) => s.collapseAll)
  const reveal = useFileTree((s) => s.reveal)
  const revealTarget = useFileTree((s) => s.revealTarget)
  const clearRevealTarget = useFileTree((s) => s.clearRevealTarget)

  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState("")
  const deferredFilter = useDeferredValue(filter)
  const isFiltering = deferredFilter.trim().length > 0

  const scrollParentRef = useRef<HTMLDivElement>(null)

  // The file shown in the dock's active file tab, if it lives under this
  // tree's root. Chat attachments (sourceUrl) live outside any workspace.
  const activeFilePath = useDockStore((s) => {
    const scope = activeScope(s)
    return (
      scope.filePreviews.find(
        (file) => file.id === scope.activeFilePreviewId && !file.sourceUrl
      )?.filePath ?? null
    )
  })
  const activeRelativePath = useMemo(
    () =>
      activeFilePath?.startsWith(`${workspacePath}/`)
        ? activeFilePath.slice(workspacePath.length + 1)
        : null,
    [activeFilePath, workspacePath]
  )

  // Reset expansion when the tree root changes — switching workspaces or moving
  // the active thread between its worktree and the workspace (paths are relative
  // to the root, so a stale expansion set would point at the wrong directories).
  // A pending reveal target from the old root is dropped for the same reason.
  useEffect(() => {
    collapseAll()
    clearRevealTarget()
  }, [workspacePath, collapseAll, clearRevealTarget])

  // ── Lazy tree: one query per visible directory (root + expanded) ────────────
  const dirsToFetch = useMemo(() => ["", ...expanded], [expanded])
  const dirQueries = useQueries({
    queries: dirsToFetch.map((relPath) => ({
      // Keyed by the effective root path so worktree and workspace listings of
      // the same relative directory don't share a cache entry.
      queryKey: workspaceKeys.dir(workspacePath, relPath),
      queryFn: async () =>
        (await listWorkspaceDir(workspaceId, relPath, threadId)).entries,
      enabled: !!workspaceId && !!workspacePath,
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

  // Directories that (transitively) contain a changed file, so collapsed
  // folders can surface a change indicator. Built from the git status paths.
  const changedDirs = useMemo(() => {
    const dirs = new Set<string>()
    if (!gitStatus) return dirs
    for (const path of gitStatus.keys()) {
      const parts = path.split("/")
      let acc = ""
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]
        dirs.add(acc)
      }
    }
    return dirs
  }, [gitStatus])

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

  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual returns a mutable object by design; not memoizable
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

  // ── Keyboard navigation: index-based cursor over the flat rows array ────────
  // Real DOM focus stays on the always-mounted scroll container (virtualization
  // unmounts off-screen rows, which would drop a roving-tabindex focus); the
  // cursor row is exposed via aria-activedescendant.
  const [focusedIndex, setFocusedIndex] = useState(-1)
  useEffect(() => {
    setFocusedIndex(-1)
  }, [isFiltering, workspacePath])

  // Path → row index, kept in a ref so the row click handlers stay
  // identity-stable (TreeRow is memoized on them).
  const rowIndexByPath = useRef(new Map<string, number>())
  useEffect(() => {
    const map = rowIndexByPath.current
    map.clear()
    rows.forEach((row, index) => map.set(row.entry.relativePath, index))
  }, [rows])

  const handleToggleDir = useCallback(
    (relativePath: string) => {
      const index = rowIndexByPath.current.get(relativePath)
      if (index !== undefined) setFocusedIndex(index)
      toggleDir(relativePath)
    },
    [toggleDir]
  )

  const handleSelectFile = useCallback(
    (relativePath: string) => {
      const index = rowIndexByPath.current.get(relativePath)
      if (index !== undefined) setFocusedIndex(index)
      const filePath = `${workspacePath}/${relativePath}`
      const name = relativePath.split("/").pop() || relativePath
      openFileTab({ filePath, title: name, workspacePath })
    },
    [workspacePath]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) return
      const current = Math.min(focusedIndex, rows.length - 1)
      const row = current >= 0 ? rows[current] : undefined
      const focusRow = (index: number) => {
        setFocusedIndex(index)
        virtualizer.scrollToIndex(index)
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          focusRow(current < 0 ? 0 : Math.min(current + 1, rows.length - 1))
          break
        case "ArrowUp":
          event.preventDefault()
          focusRow(current < 0 ? 0 : Math.max(current - 1, 0))
          break
        case "ArrowRight": {
          if (isFiltering || !row?.entry.isDirectory) break
          event.preventDefault()
          if (!expanded.has(row.entry.relativePath)) {
            toggleDir(row.entry.relativePath)
          } else if (rows[current + 1]?.depth === row.depth + 1) {
            focusRow(current + 1)
          }
          break
        }
        case "ArrowLeft": {
          if (isFiltering || !row) break
          event.preventDefault()
          if (row.entry.isDirectory && expanded.has(row.entry.relativePath)) {
            toggleDir(row.entry.relativePath)
            break
          }
          for (let i = current - 1; i >= 0; i--) {
            if (rows[i].depth === row.depth - 1) {
              focusRow(i)
              break
            }
          }
          break
        }
        case "Enter":
        case " ": {
          if (!row) break
          event.preventDefault()
          if (row.entry.isDirectory) toggleDir(row.entry.relativePath)
          else handleSelectFile(row.entry.relativePath)
          break
        }
        case "Home":
          event.preventDefault()
          focusRow(0)
          break
        case "End":
          event.preventDefault()
          focusRow(rows.length - 1)
          break
      }
    },
    [
      rows,
      focusedIndex,
      isFiltering,
      expanded,
      toggleDir,
      handleSelectFile,
      virtualizer,
    ]
  )

  // ArrowDown in the filter input hands the cursor to the list; Enter opens
  // the top match directly.
  const handleFilterKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" && rows.length > 0) {
        event.preventDefault()
        scrollParentRef.current?.focus()
        setFocusedIndex(0)
        virtualizer.scrollToIndex(0)
      } else if (event.key === "Enter") {
        const first = rows[0]
        if (isFiltering && first && !first.entry.isDirectory) {
          handleSelectFile(first.entry.relativePath)
        }
      }
    },
    [rows, isFiltering, handleSelectFile, virtualizer]
  )

  // ── Reveal the active file: expand its ancestors and scroll it into view ────
  const handleReveal = useCallback(() => {
    if (!activeRelativePath) return
    // The reveal-scroll effect skips while filtering, so drop the filter first.
    setFilter("")
    reveal(activeRelativePath)
  }, [activeRelativePath, reveal])

  // ── Context menu: one menu for the whole tree, row resolved via data-index ──
  const [menuTarget, setMenuTarget] = useState<{
    relativePath: string
    isDirectory: boolean
  } | null>(null)
  const openPathMutation = useOpenPath()
  const chatActions = useChatActions()
  const isElectron = !!window.electronAPI

  const handleTreeContextMenu = useCallback(
    (event: MouseEvent) => {
      const wrapper = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-index]"
      )
      const index = wrapper ? Number(wrapper.dataset.index) : NaN
      const target = Number.isNaN(index) ? undefined : rows[index]
      if (!target) {
        // No row under the cursor — suppress the menu instead of opening an
        // empty popup. Capture phase runs before Base UI's open handler.
        event.preventDefault()
        event.stopPropagation()
        setMenuTarget(null)
        return
      }
      setFocusedIndex(index)
      setMenuTarget({
        relativePath: target.entry.relativePath,
        isDirectory: target.entry.isDirectory,
      })
    },
    [rows]
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
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder="Filter files"
              aria-label="Filter files"
              className="h-7 border-sidebar-border/70 bg-sidebar-accent/35 pr-7 pl-7 text-xs text-sidebar-foreground shadow-none placeholder:text-sidebar-foreground/40 focus-visible:border-sidebar-border focus-visible:ring-0"
            />
            {filter && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setFilter("")}
                aria-label="Clear file filter"
                className="absolute top-1/2 right-1 size-5 -translate-y-1/2 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReveal}
            disabled={!activeRelativePath}
            className="size-7 shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Locate className="size-3.5" />
            <span className="sr-only">Reveal active file</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            disabled={showSpinner}
            className="size-7 shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <RefreshCw
              className={`size-3.5 ${showSpinner ? "animate-spin" : ""}`}
            />
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

      <div
        ref={scrollParentRef}
        role="tree"
        aria-label="Workspace files"
        tabIndex={0}
        aria-activedescendant={
          focusedIndex >= 0 && rows[focusedIndex]
            ? rowDomId(rows[focusedIndex].entry.relativePath)
            : undefined
        }
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-auto p-1 focus-visible:ring-1 focus-visible:ring-sidebar-ring focus-visible:outline-none focus-visible:ring-inset"
      >
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
          <ContextMenu>
            <ContextMenuTrigger
              onContextMenuCapture={handleTreeContextMenu}
              className="relative block w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]!
                return (
                  <div
                    key={row.entry.relativePath}
                    role="none"
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <TreeRow
                      entry={row.entry}
                      depth={row.depth}
                      isExpanded={
                        row.entry.isDirectory &&
                        expanded.has(row.entry.relativePath)
                      }
                      isActive={
                        !row.entry.isDirectory &&
                        row.entry.relativePath === activeRelativePath
                      }
                      isFocused={virtualRow.index === focusedIndex}
                      showFullPath={isFiltering}
                      status={
                        row.entry.isDirectory
                          ? undefined
                          : gitStatus?.get(row.entry.relativePath)
                      }
                      dirHasChange={
                        row.entry.isDirectory &&
                        changedDirs.has(row.entry.relativePath)
                      }
                      onToggleDir={handleToggleDir}
                      onSelectFile={handleSelectFile}
                    />
                  </div>
                )
              })}
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
              {menuTarget && (
                <>
                  <ContextMenuItem
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${workspacePath}/${menuTarget.relativePath}`
                      )
                    }
                  >
                    <Copy />
                    Copy path
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() =>
                      navigator.clipboard.writeText(menuTarget.relativePath)
                    }
                  >
                    <Copy />
                    Copy relative path
                  </ContextMenuItem>
                  {isElectron && (
                    <ContextMenuItem
                      onClick={() =>
                        openPathMutation.mutate(
                          `${workspacePath}/${menuTarget.relativePath}`
                        )
                      }
                    >
                      <FolderOpen />
                      Reveal in Finder
                    </ContextMenuItem>
                  )}
                  {chatActions && !menuTarget.isDirectory && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() =>
                          chatActions.addFileMention(menuTarget.relativePath)
                        }
                      >
                        <MessageSquarePlus />
                        Add to chat
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>
    </div>
  )
}
