import { useCallback, useState, useEffect } from "react"
import { File, ChevronRight, ChevronDown, Folder, RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { useDiffPanel } from "@/features/git"
import { useDirectoryEntries } from "../queries"
import type { DirectoryEntry } from "../queries"

interface TreeNode extends DirectoryEntry {
  children?: TreeNode[]
}

interface FileTreeProps {
  workspacePath: string
}

function TreeItem({
  node,
  depth = 0,
  onSelect,
}: {
  node: TreeNode
  depth?: number
  onSelect?: (path: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [children, setChildren] = useState<TreeNode[]>([])
  const isDirectory = node.type === "directory"

  const { data: childEntries } = useDirectoryEntries(
    isExpanded && isDirectory && children.length === 0 ? node.path : null
  )

  useEffect(() => {
    if (childEntries && childEntries.length > 0) {
      setChildren(childEntries)
    }
  }, [childEntries])

  const toggleExpand = useCallback(() => {
    if (isDirectory) {
      setIsExpanded((prev) => !prev)
    } else {
      onSelect?.(node.path)
    }
  }, [isDirectory, node.path, onSelect])

  return (
    <div>
      <button
        onClick={toggleExpand}
        className="flex w-full items-center gap-1 px-2 py-0.5 text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory ? (
          isExpanded ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {isDirectory ? (
          <Folder className="size-4 shrink-0" />
        ) : (
          <File className="size-4 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const SKELETON_ROWS = [
  { indent: 0, width: "w-24", isDir: true },
  { indent: 1, width: "w-20" },
  { indent: 1, width: "w-28" },
  { indent: 1, width: "w-16" },
  { indent: 0, width: "w-20", isDir: true },
  { indent: 1, width: "w-24" },
  { indent: 1, width: "w-32" },
  { indent: 0, width: "w-16" },
  { indent: 0, width: "w-28", isDir: true },
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
          style={{ paddingLeft: `${row.indent * 16 + 8}px` }}
        >
          <Skeleton className="size-3 shrink-0 rounded-sm" />
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className={`h-2.5 rounded-sm ${row.width}`} />
        </div>
      ))}
    </div>
  )
}

export function FileTree({ workspacePath }: FileTreeProps) {
  const { data: entries = [], isLoading, refetch, isFetching } = useDirectoryEntries(workspacePath)
  const diffPanelContext = useDiffPanel()

  function handleFileSelect(filePath: string) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath

    // Open diff panel if not already open
    if (!diffPanelContext.isOpen) {
      diffPanelContext.open()
    }

    // Add the file tab
    diffPanelContext.addTab({
      title: fileName,
      type: "file",
      filePath,
    })
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/60 px-2">
        <span className="text-[10px] font-medium text-muted-foreground">FILES</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {isLoading ? (
          <FileTreeSkeleton />
        ) : entries.length === 0 ? (
          <div className="p-2 text-[10px] text-muted-foreground">No files found</div>
        ) : (
          <div className="animate-in fade-in duration-150">
            {entries.map((node) => (
              <TreeItem key={node.path} node={node} onSelect={handleFileSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
