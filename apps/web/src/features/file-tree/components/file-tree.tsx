import { useCallback, useState, useEffect } from "react"
import { File, ChevronRight, ChevronDown, Folder, RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
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

export function FileTree({ workspacePath }: FileTreeProps) {
  const { data: entries = [], isLoading, refetch, isFetching } = useDirectoryEntries(workspacePath)
  const { addTab, open: openDiffPanel } = useDiffPanel()

  const handleFileSelect = useCallback((filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath
    addTab({
      title: fileName,
      type: "file",
      filePath,
    })
    openDiffPanel()
  }, [addTab, openDiffPanel])

  return (
    <div className="flex h-full flex-col">
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
          <div className="flex items-center justify-center p-4 text-[10px] text-muted-foreground">
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-2 text-[10px] text-muted-foreground">No files found</div>
        ) : (
          entries.map((node) => (
            <TreeItem key={node.path} node={node} onSelect={handleFileSelect} />
          ))
        )}
      </div>
    </div>
  )
}