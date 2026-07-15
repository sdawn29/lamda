import { memo, useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import {
  ChevronDown,
  ChevronRight,
  FileStack,
  Folder,
  FolderOpen,
  FolderTree,
  List,
  Loader2,
} from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { getIconName } from "@/shared/ui/file-icon"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { cn } from "@/shared/lib/utils"
import { useGitStatus } from "../queries"
import {
  parseStatusLines,
  statusLabel,
  statusTextClass,
  type ChangedFile,
} from "./status-badge"

type NavigatorView = "files" | "tree"

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  file?: ChangedFile
}

interface MutableTreeNode {
  name: string
  path: string
  children: Map<string, MutableTreeNode>
  file?: ChangedFile
}

function buildTree(files: ChangedFile[]): TreeNode[] {
  const root = new Map<string, MutableTreeNode>()

  for (const file of files) {
    const parts = file.filePath.split("/").filter(Boolean)
    let children = root
    let path = ""
    parts.forEach((name, index) => {
      path = path ? `${path}/${name}` : name
      let node = children.get(name)
      if (!node) {
        node = { name, path, children: new Map() }
        children.set(name, node)
      }
      if (index === parts.length - 1) node.file = file
      children = node.children
    })
  }

  const finalize = (nodes: Map<string, MutableTreeNode>): TreeNode[] =>
    [...nodes.values()]
      .map((node) => ({
        name: node.name,
        path: node.path,
        file: node.file,
        children: finalize(node.children),
      }))
      .sort((a, b) => {
        const aFolder = a.children.length > 0
        const bFolder = b.children.length > 0
        if (aFolder !== bFolder) return aFolder ? -1 : 1
        return a.name.localeCompare(b.name)
      })

  return finalize(root)
}

function ChangedFileButton({
  file,
  onSelectFile,
  depth = 0,
}: {
  file: ChangedFile
  onSelectFile: (file: ChangedFile) => void
  depth?: number
}) {
  const name = file.filePath.split("/").pop() ?? file.filePath
  const label = statusLabel(file)

  return (
    <button
      type="button"
      onClick={() => onSelectFile(file)}
      className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <Icon
        icon={`catppuccin:${getIconName(name)}`}
        className="size-3.5 shrink-0"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate" title={file.filePath}>
        {depth > 0 ? name : file.filePath}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-3xs font-semibold",
          statusTextClass(label)
        )}
      >
        {label}
      </span>
    </button>
  )
}

function ChangedTreeNodes({
  nodes,
  onSelectFile,
  collapsed,
  onToggleFolder,
  depth = 0,
}: {
  nodes: TreeNode[]
  onSelectFile: (file: ChangedFile) => void
  collapsed: Set<string>
  onToggleFolder: (path: string) => void
  depth?: number
}) {
  return nodes.map((node) => {
    const isFolder = node.children.length > 0
    if (!isFolder && node.file) {
      return (
        <ChangedFileButton
          key={node.path}
          file={node.file}
          onSelectFile={onSelectFile}
          depth={depth}
        />
      )
    }

    const isCollapsed = collapsed.has(node.path)
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {isCollapsed ? (
            <ChevronRight className="size-3 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="size-3 shrink-0" aria-hidden />
          )}
          {isCollapsed ? (
            <Folder className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <FolderOpen className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {!isCollapsed && (
          <ChangedTreeNodes
            nodes={node.children}
            onSelectFile={onSelectFile}
            collapsed={collapsed}
            onToggleFolder={onToggleFolder}
            depth={depth + 1}
          />
        )}
      </div>
    )
  })
}

export const ModifiedFilesNavigator = memo(function ModifiedFilesNavigator({
  sessionId,
  onSelectFile,
}: {
  sessionId: string
  onSelectFile: (file: ChangedFile) => void
}) {
  const [view, setView] = useState<NavigatorView>("files")
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const { data, isLoading, error } = useGitStatus(sessionId)
  const files = useMemo(() => parseStatusLines(data?.raw ?? ""), [data?.raw])
  const tree = useMemo(() => buildTree(files), [files])

  const toggleFolder = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-sidebar-border/80 bg-sidebar text-sidebar-foreground shadow-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border/80 px-2">
        <FileStack
          className="size-3.5 text-sidebar-foreground/60"
          aria-hidden
        />
        <span className="text-xs font-medium">Modified files</span>
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-3xs">
          {files.length}
        </Badge>
        <div className="flex-1" />
        <ToggleGroup
          value={[view]}
          variant="outline"
          size="sm"
          onValueChange={(values) => {
            const next = values.find((value) => value !== view)
            if (next === "files" || next === "tree") setView(next)
          }}
          aria-label="Modified files view"
        >
          <ToggleGroupItem value="files" aria-label="File view">
            <List data-icon="inline-start" />
            Files
          </ToggleGroupItem>
          <ToggleGroupItem value="tree" aria-label="Tree view">
            <FolderTree data-icon="inline-start" />
            Tree
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading changes
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load changes"}
            </AlertDescription>
          </Alert>
        ) : files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <FileStack className="size-6 opacity-50" aria-hidden />
            <p className="text-xs font-medium">No modified files</p>
            <p className="text-3xs opacity-70">Your working tree is clean.</p>
          </div>
        ) : view === "files" ? (
          files.map((file) => (
            <ChangedFileButton
              key={`${file.raw}:${file.filePath}`}
              file={file}
              onSelectFile={onSelectFile}
            />
          ))
        ) : (
          <ChangedTreeNodes
            nodes={tree}
            onSelectFile={onSelectFile}
            collapsed={collapsed}
            onToggleFolder={toggleFolder}
          />
        )}
      </div>
    </div>
  )
})
