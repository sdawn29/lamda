import { memo, useCallback, useEffect, useMemo, useState } from "react"
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
import { SidebarContent, SidebarHeader } from "@/shared/ui/sidebar"
import { getFileIcon } from "@/shared/ui/file-icon"
import { useMainTabs } from "@/features/main-tabs"
import {
  useWorkspaceIndex,
  type WorkspaceFileEntry,
} from "@/features/workspace/queries"
import { triggerWorkspaceReindex } from "@/features/workspace/api"
import { cn } from "@/shared/lib/utils"

interface FileTreeProps {
  workspaceId: string
  workspacePath: string
}

interface TreeNode {
  name: string
  relativePath: string
  isDirectory: boolean
  children: TreeNode[]
}

function buildTree(entries: WorkspaceFileEntry[]): TreeNode[] {
  const root: TreeNode = {
    name: "",
    relativePath: "",
    isDirectory: true,
    children: [],
  }
  const dirs = new Map<string, TreeNode>()
  dirs.set("", root)

  function ensureDir(relativePath: string): TreeNode {
    const cached = dirs.get(relativePath)
    if (cached) return cached
    const segments = relativePath.split("/")
    const name = segments[segments.length - 1] ?? relativePath
    const parent = ensureDir(segments.slice(0, -1).join("/"))
    const node: TreeNode = {
      name,
      relativePath,
      isDirectory: true,
      children: [],
    }
    parent.children.push(node)
    dirs.set(relativePath, node)
    return node
  }

  // Pre-create directory nodes so files can attach to them in any order.
  for (const entry of entries) {
    if (entry.isDirectory) ensureDir(entry.relativePath)
  }

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const segments = entry.relativePath.split("/")
    const parent = ensureDir(segments.slice(0, -1).join("/"))
    parent.children.push({
      name: entry.name,
      relativePath: entry.relativePath,
      isDirectory: false,
      children: [],
    })
  }

  function sort(node: TreeNode) {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const child of node.children) {
      if (child.isDirectory) sort(child)
    }
  }
  sort(root)

  return root.children
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

function matchesFilter(node: TreeNode, filter: string): boolean {
  const terms = filter.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  return terms.every((term) => fuzzyMatch(node.relativePath || node.name, term))
}

function filterTree(nodes: TreeNode[], filter: string): TreeNode[] {
  if (!filter.trim()) return nodes

  return nodes.flatMap((node) => {
    const childMatches = filterTree(node.children, filter)
    if (matchesFilter(node, filter)) {
      return [{ ...node, children: node.children }]
    }
    if (childMatches.length > 0) {
      return [{ ...node, children: childMatches }]
    }
    return []
  })
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.isDirectory ? countFiles(node.children) : 1),
    0
  )
}

const TreeItem = memo(function TreeItem({
  node,
  depth,
  expanded,
  forceExpanded,
  forceCollapsed,
  onToggleDir,
  onSelectFile,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  forceExpanded: boolean
  forceCollapsed: Set<string>
  onToggleDir: (relativePath: string) => void
  onSelectFile: (relativePath: string) => void
}) {
  const isExpanded =
    node.isDirectory &&
    !forceCollapsed.has(node.relativePath) &&
    (forceExpanded || expanded.has(node.relativePath))

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      onToggleDir(node.relativePath)
    } else {
      onSelectFile(node.relativePath)
    }
  }, [node.isDirectory, node.relativePath, onToggleDir, onSelectFile])

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        title={node.relativePath}
        aria-expanded={node.isDirectory ? isExpanded : undefined}
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs text-sidebar-foreground/80 transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:outline-none"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {node.isDirectory ? (
          isExpanded ? (
            <ChevronDown className="size-3 shrink-0 text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/70" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/70" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {node.isDirectory ? (
          isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-colors group-hover:text-sidebar-foreground/80" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-colors group-hover:text-sidebar-foreground/80" />
          )
        ) : (
          <>{(() => {
            const Icon = getFileIcon(node.name)
            return <Icon className="size-3.5 shrink-0 text-sidebar-foreground/60 transition-colors group-hover:text-sidebar-foreground/85" />
          })()}</>
        )}
        <span
          className={cn(
            "min-w-0 truncate",
            node.isDirectory && "font-medium text-sidebar-foreground/85"
          )}
        >
          {node.name}
        </span>
      </button>
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              forceExpanded={forceExpanded}
              forceCollapsed={forceCollapsed}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
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
  { indent: 0, width: "w-28" },
  { indent: 1, width: "w-20" },
  { indent: 1, width: "w-24" },
  { indent: 1, width: "w-16" },
]

function FileTreeSkeleton() {
  return (
    <div className="space-y-0.5 p-1 animate-in fade-in duration-200">
      {SKELETON_ROWS.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-1 py-0.5"
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
  const { data: entries = [], isLoading, isFetching } = useWorkspaceIndex(workspaceId)
  const { addFileTab } = useMainTabs()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [filterCollapsed, setFilterCollapsed] = useState<Set<string>>(
    () => new Set()
  )
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState("")

  const tree = useMemo(() => buildTree(entries), [entries])
  const filteredTree = useMemo(() => filterTree(tree, filter), [filter, tree])
  const isFiltering = filter.trim().length > 0
  const totalFiles = useMemo(() => countFiles(tree), [tree])
  const visibleFiles = useMemo(() => countFiles(filteredTree), [filteredTree])

  useEffect(() => {
    setFilterCollapsed(new Set())
  }, [filter])

  const handleToggleDir = useCallback(
    (relativePath: string) => {
      if (isFiltering) {
        setFilterCollapsed((prev) => {
          const next = new Set(prev)
          if (next.has(relativePath)) {
            next.delete(relativePath)
          } else {
            next.add(relativePath)
          }
          return next
        })
        return
      }

      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(relativePath)) {
          next.delete(relativePath)
        } else {
          next.add(relativePath)
        }
        return next
      })
    },
    [isFiltering]
  )

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
      // SSE will eventually invalidate the cache; nothing to surface here.
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, workspaceId])

  const showSkeleton = isLoading && entries.length === 0
  const isEmpty = !isLoading && entries.length === 0
  const showSpinner = refreshing || isFetching

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-sidebar-border/80 bg-sidebar text-sidebar-foreground shadow-sm">
      <SidebarHeader className="gap-1.5 border-b bg-sidebar/95 px-2 py-2">
        <div className="flex items-center gap-1.5">
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
        {!showSkeleton && !isEmpty && (
          <div className="flex h-4 items-center justify-between px-0.5 text-[10px] leading-none text-sidebar-foreground/45">
            <span>
              {isFiltering
                ? `${visibleFiles} of ${totalFiles} files`
                : `${totalFiles} files`}
            </span>
            {showSpinner && <span>Indexing</span>}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="p-1.5">
        {showSkeleton ? (
          <FileTreeSkeleton />
        ) : isEmpty ? (
          <div className="p-2 text-[10px] text-sidebar-foreground/50">No files indexed</div>
        ) : isFiltering && filteredTree.length === 0 ? (
          <div className="p-2 text-[10px] text-sidebar-foreground/50">No matching files</div>
        ) : (
          <div className="animate-in fade-in duration-150">
            {filteredTree.map((node) => (
              <TreeItem
                key={node.relativePath}
                node={node}
                depth={0}
                expanded={expanded}
                forceExpanded={isFiltering}
                forceCollapsed={filterCollapsed}
                onToggleDir={handleToggleDir}
                onSelectFile={handleSelectFile}
              />
            ))}
          </div>
        )}
      </SidebarContent>
    </div>
  )
}
