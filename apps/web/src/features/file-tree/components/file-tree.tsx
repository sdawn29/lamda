import { useCallback, useEffect, useState } from "react"
import { Folder, ChevronRight, ChevronDown, File, RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"

interface TreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: TreeNode[]
}

interface FileTreeProps {
  workspacePath: string
}

async function fetchDirectory(path: string): Promise<TreeNode[]> {
  try {
    const response = await fetch(`/api/directory?path=${encodeURIComponent(path)}`)
    if (!response.ok) return []
    return response.json()
  } catch {
    return []
  }
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

  useEffect(() => {
    if (isExpanded && isDirectory && children.length === 0) {
      fetchDirectory(node.path).then(setChildren)
    }
  }, [isExpanded, isDirectory, node.path, children.length])

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
        className="flex w-full items-center gap-1 rounded-md px-2 py-0.5 text-sm hover:bg-muted/50"
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
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <File className="size-4 shrink-0 text-muted-foreground/70" />
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
  const [entries, setEntries] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDirectory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDirectory(workspacePath)
      setEntries(data)
    } catch {
      setError("Failed to load directory")
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  useEffect(() => {
    loadDirectory()
  }, [loadDirectory])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Files</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={loadDirectory}
          disabled={loading}
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
            Loading...
          </div>
        ) : error ? (
          <div className="p-2 text-xs text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No files found</div>
        ) : (
          entries.map((node) => (
            <TreeItem key={node.path} node={node} />
          ))
        )}
      </div>
    </div>
  )
}
