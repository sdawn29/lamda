import { useCallback, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  SidebarContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/shared/ui/sidebar"
import { getFileIcon } from "@/shared/ui/file-icon"
import { useDiffPanel } from "@/features/git"
import {
  useWorkspaceIndex,
  type WorkspaceFileEntry,
} from "@/features/workspace/queries"
import { triggerWorkspaceReindex } from "@/features/workspace/api"

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

function TreeItem({
  node,
  depth,
  expanded,
  onToggleDir,
  onSelectFile,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggleDir: (relativePath: string) => void
  onSelectFile: (relativePath: string) => void
}) {
  const isExpanded = node.isDirectory && expanded.has(node.relativePath)

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
        className="flex w-full items-center gap-1 rounded-sm px-2 py-0.5 text-left text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isDirectory ? (
          isExpanded ? (
            <ChevronDown className="size-3 shrink-0 text-sidebar-foreground/50" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-sidebar-foreground/50" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {node.isDirectory ? (
          isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-sidebar-foreground/50" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-sidebar-foreground/50" />
          )
        ) : (
          <>{(() => {
            const Icon = getFileIcon(node.name)
            return <Icon className="size-3.5 shrink-0 text-sidebar-foreground/50" />
          })()}</>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

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
  const diffPanel = useDiffPanel()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  const tree = useMemo(() => buildTree(entries), [entries])

  const handleToggleDir = useCallback((relativePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return next
    })
  }, [])

  const handleSelectFile = useCallback(
    (relativePath: string) => {
      const filePath = `${workspacePath}/${relativePath}`
      const name = relativePath.split("/").pop() || relativePath
      if (!diffPanel.isOpen) diffPanel.open()
      diffPanel.addTab({ title: name, type: "file", filePath })
    },
    [diffPanel, workspacePath]
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
    <div className="flex h-full w-full flex-col bg-background text-sidebar-foreground">
      <SidebarHeader className="h-8 flex-row items-center justify-between border-b border-sidebar-border px-2 py-0">
        <SidebarGroupLabel className="h-8 px-0 text-[10px] font-medium tracking-wider text-sidebar-foreground/60">
          FILES
        </SidebarGroupLabel>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={showSpinner}
          className="text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <RefreshCw className={`size-3 ${showSpinner ? "animate-spin" : ""}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </SidebarHeader>
      <SidebarContent className="p-1">
        {showSkeleton ? (
          <FileTreeSkeleton />
        ) : isEmpty ? (
          <div className="p-2 text-[10px] text-sidebar-foreground/50">No files indexed</div>
        ) : (
          <div className="animate-in fade-in duration-150">
            {tree.map((node) => (
              <TreeItem
                key={node.relativePath}
                node={node}
                depth={0}
                expanded={expanded}
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
