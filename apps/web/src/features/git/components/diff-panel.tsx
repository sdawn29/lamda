import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  memo,
  Suspense,
} from "react"
import { AlertCircle, Archive, Check, Columns2, AlignLeft, GitCompare, Loader2, PackageMinus, PackagePlus, Plus, X, ArrowUpDown, ExternalLink, Maximize2, Minimize2 } from "lucide-react"
import { getFileIcon } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useDiffPanel, type DiffPanelTab } from "../context"
import { useGitStatus } from "../queries"
import {
  useGitStage,
  useGitStageAll,
  useGitStashMutations,
  useGitRevertFile,
} from "../mutations"
import { type ChangedFile, parseStatusLine } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { StashInputBar } from "./stash-input-bar"
import { StashSection } from "./stash-section"
import { FilesSection } from "./files-section"
import { FileHeader } from "./file-header"
import { SORT_OPTIONS, type SortMode, applySortMode } from "./sort-utils"
import { cn } from "@/shared/lib/utils"
import { useTheme } from "@/shared/components/theme-provider"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { getServerUrl } from "@/shared/lib/client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const PrismCode = lazy(() =>
  import("@/features/chat/components/prism-code").then((m) => ({
    default: m.default,
  }))
)

interface DiffPanelProps {
  sessionId: string
  openWithAppId?: string | null
}

// ─── Source Control Content ───────────────────────────────────────────────────

const SourceControlContent = memo(function SourceControlContent({
  sessionId,
}: {
  sessionId: string
}) {
  const [mode, setMode] = useState<DiffMode>("inline")
  const [sortMode, setSortMode] = useState<SortMode>("name")
  const [stashInputOpen, setStashInputOpen] = useState(false)

  const {
    data: statusRaw,
    isLoading: loading,
    error: statusError,
  } = useGitStatus(sessionId)

  const { staged, unstaged } = useMemo(() => {
    const all = (statusRaw ?? "")
      .split("\n")
      .map((l: string) => l.trimEnd())
      .filter(Boolean)
      .map(parseStatusLine)
    return {
      staged: applySortMode(
        all.filter((f: ChangedFile) => f.isStaged),
        sortMode
      ),
      unstaged: applySortMode(
        all.filter((f: ChangedFile) => !f.isStaged),
        sortMode
      ),
    }
  }, [statusRaw, sortMode])

  const files = useMemo(() => [...staged, ...unstaged], [staged, unstaged])
  const error = statusError instanceof Error ? statusError.message : null

  const { stage, unstage } = useGitStage(sessionId)
  const { stageAll, unstageAll } = useGitStageAll(sessionId)
  const { stash } = useGitStashMutations(sessionId)
  const revertFile = useGitRevertFile(sessionId)

  const bulkWorking = stageAll.isPending || unstageAll.isPending

  const handleStageToggle = useCallback(
    async (file: ChangedFile) => {
      if (file.isStaged) {
        await unstage.mutateAsync(file.filePath)
      } else {
        await stage.mutateAsync(file.filePath)
      }
    },
    [stage, unstage]
  )

  const handleStageAll = useCallback(async () => {
    await stageAll.mutateAsync()
  }, [stageAll])

  const handleUnstageAll = useCallback(async () => {
    await unstageAll.mutateAsync()
  }, [unstageAll])

  const handleRevert = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

  const handleStashConfirm = useCallback(
    async (message: string) => {
      try {
        await stash.mutateAsync(message || undefined)
        setStashInputOpen(false)
      } catch {
        // keep input bar open on failure
      }
    },
    [stash]
  )

  const hasStaged = staged.length > 0
  const hasUnstaged = unstaged.length > 0
  const hasChanges = files.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-0.5 border-b border-border/50 bg-muted/20 px-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleStageAll}
                disabled={bulkWorking || !hasUnstaged}
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                {stageAll.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PackagePlus className="h-3 w-3" />
                )}
                <span className="sr-only">Stage all</span>
              </Button>
            }
          />
          <TooltipContent>Stage all changes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleUnstageAll}
                disabled={bulkWorking || !hasStaged}
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                {unstageAll.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PackageMinus className="h-3 w-3" />
                )}
                <span className="sr-only">Unstage all</span>
              </Button>
            }
          />
          <TooltipContent>Unstage all changes</TooltipContent>
        </Tooltip>

        <div className="mx-1.5 h-4 w-px bg-border/50" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMode("inline")}
                data-active={mode === "inline"}
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <AlignLeft className="h-3 w-3" />
                <span className="sr-only">Inline view</span>
              </Button>
            }
          />
          <TooltipContent>Inline diff</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMode("side-by-side")}
                data-active={mode === "side-by-side"}
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <Columns2 className="h-3 w-3" />
                <span className="sr-only">Side-by-side</span>
              </Button>
            }
          />
          <TooltipContent>Side-by-side diff</TooltipContent>
        </Tooltip>

        <div className="mx-1.5 h-4 w-px bg-border/50" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                    "text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground",
                    sortMode !== "name" && "bg-accent text-accent-foreground"
                  )}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  <span className="sr-only">Sort files</span>
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>Sort files</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setSortMode(opt.value)}
                className="flex items-center justify-between"
              >
                {opt.label}
                {sortMode === opt.value && (
                  <Check className="ml-2 h-3 w-3 text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1.5 h-4 w-px bg-border/50" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setStashInputOpen(true)}
                disabled={!hasChanges}
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                <Archive className="h-3 w-3" />
                <span className="sr-only">Stash changes</span>
              </Button>
            }
          />
          <TooltipContent>Stash all changes</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {stashInputOpen && (
            <StashInputBar
              onConfirm={handleStashConfirm}
              onCancel={() => setStashInputOpen(false)}
            />
          )}

          {loading && files.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading status…
            </div>
          )}

          {!loading && error && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <GitCompare className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground/50">No changes</p>
            </div>
          )}

          {!loading && !error && (staged.length > 0 || unstaged.length > 0) && (
            <FilesSection
              label="Staged"
              files={staged}
              sessionId={sessionId}
              mode={mode}
              onStageToggle={handleStageToggle}
              onRevert={handleRevert}
              emptyText="No staged changes"
            />
          )}

          {!loading && !error && unstaged.length > 0 && (
            <FilesSection
              label="Changes"
              files={unstaged}
              sessionId={sessionId}
              mode={mode}
              onStageToggle={handleStageToggle}
              onRevert={handleRevert}
            />
          )}
        </div>

        <StashSection sessionId={sessionId} />
      </div>
    </div>
  )
})

// ─── File Content ─────────────────────────────────────────────────────────────

const FileContent = memo(function FileContent({
  filePath,
  openWithAppId,
  workspacePath,
}: {
  filePath: string
  openWithAppId?: string | null
  workspacePath?: string
}) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Extract relative path from workspace
  const relativePath = workspacePath
    ? filePath.startsWith(workspacePath)
      ? filePath.slice(workspacePath.length).replace(/^[\/\\]+/, "")
      : filePath
    : filePath
  const pathParts = relativePath.split(/[/\\]/).filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? ""
  const fileExtension = fileName.split(".").pop()?.toLowerCase() ?? ""
  const isMarkdown = fileExtension === "md" || fileExtension === "markdown"

  // Enable rich text preview by default for markdown files
  useEffect(() => {
    setMarkdownPreview(isMarkdown)
  }, [isMarkdown, filePath])
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    yml: "yaml",
    md: "markdown",
  }
  const language = languageMap[fileExtension] ?? fileExtension

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)

    const loadFile = async () => {
      try {
        const serverUrl = await getServerUrl()
        const response = await fetch(
          `${serverUrl}/file?path=${encodeURIComponent(filePath)}`
        )
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
        }
        const text = await response.text()
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file")
          setLoading(false)
        }
      }
    }

    loadFile()
    return () => {
      cancelled = true
    }
  }, [filePath])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/50">
          <FileHeader pathParts={pathParts} filePath={filePath} openWithAppId={openWithAppId} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading file…
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/50">
          <FileHeader pathParts={pathParts} filePath={filePath} openWithAppId={openWithAppId} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="mx-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/50">
        <FileHeader
          pathParts={pathParts}
          filePath={filePath}
          openWithAppId={openWithAppId}
          isMarkdown={isMarkdown}
          markdownPreview={markdownPreview}
          onToggleMarkdownPreview={isMarkdown ? () => setMarkdownPreview(!markdownPreview) : undefined}
        />
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          markdownPreview ? "prose prose-sm max-w-none p-4 dark:prose-invert" : "file-viewer-code"
        )}
        style={markdownPreview ? undefined : { userSelect: "text" }}
      >
        {markdownPreview ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ""}</ReactMarkdown>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading…
              </div>
            }
          >
            <PrismCode
              code={content ?? ""}
              language={language}
              style={isDark ? jellybeansdark : jellybeanslight}
              showLineNumbers
              fontSize="0.75rem"
            />
          </Suspense>
        )}
      </div>
    </div>
  )
})

// ─── Tab Content Router ───────────────────────────────────────────────────────

function TabContent({
  tab,
  sessionId,
  openWithAppId,
  workspacePath,
}: {
  tab: DiffPanelTab
  sessionId: string
  openWithAppId?: string | null
  workspacePath?: string
}) {
  if (tab.type === "source-control") {
    return <SourceControlContent sessionId={sessionId} />
  }
  if (tab.type === "file" && tab.filePath) {
    return <FileContent filePath={tab.filePath} openWithAppId={openWithAppId} workspacePath={workspacePath} />
  }
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Unknown tab type
    </div>
  )
}

// ─── Main DiffPanel ────────────────────────────────────────────────────────────

export const DiffPanel = memo(function DiffPanel({
  sessionId,
  openWithAppId,
}: DiffPanelProps) {
  const {
    close,
    toggleFullscreen,
    isFullscreen,
    tabs,
    activeTabId,
    pendingTabId,
    addTab,
    closeTab,
    setActiveTab,
    clearPendingTab,
    currentWorkspacePath,
  } = useDiffPanel()
  const [showAddMenu, setShowAddMenu] = useState(false)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId),
    [tabs, activeTabId]
  )

  // Focus the active tab whenever activeTabId changes
  useEffect(() => {
    if (activeTabId) {
      // Focus the newly added or active tab
      const tabEl = tabRefs.current.get(activeTabId)
      if (tabEl) {
        tabEl.scrollIntoView({ block: "nearest", inline: "nearest" })
        tabEl.focus()
      }
      // Clear pending tab after focus
      if (pendingTabId === activeTabId) {
        clearPendingTab()
      }
    }
  }, [activeTabId, pendingTabId, clearPendingTab])

  const handleAddFileTab = useCallback(() => {
    const filePath = window.prompt("Enter file path to open:")
    if (filePath) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      addTab({
        title: fileName,
        type: "file",
        filePath,
      })
    }
    setShowAddMenu(false)
  }, [addTab])

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-stretch border-b">
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(tab.id, el)
                  } else {
                    tabRefs.current.delete(tab.id)
                  }
                }}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1.5 border-r px-3 text-xs transition-colors",
                  isActive
                    ? "bg-background text-foreground after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:bg-primary"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.type === "source-control" ? (
                  <GitCompare className="h-3 w-3 shrink-0" />
                ) : (
                  (() => {
                    const FileIcon = getFileIcon(tab.title)
                    return <FileIcon className="h-3 w-3 shrink-0" />
                  })()
                )}
                <span className="max-w-30 truncate">{tab.title}</span>
                {tab.type !== "source-control" && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Close ${tab.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation()
                        closeTab(tab.id)
                      }
                    }}
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted-foreground/20",
                      isActive
                        ? "opacity-60 hover:opacity-100"
                        : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                    )}
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            )
          })}

          {/* Add tab dropdown */}
          <DropdownMenu open={showAddMenu} onOpenChange={setShowAddMenu}>
            <DropdownMenuTrigger className="flex items-center px-2 text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onSelect={handleAddFileTab}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right side buttons */}
        <div className="flex shrink-0 items-center gap-0.5 border-l px-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleFullscreen}
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
                </Button>
              }
            />
            <TooltipContent>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={close}
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Close panel</span>
                </Button>
              }
            />
            <TooltipContent>Close panel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? (
          <TabContent tab={activeTab} sessionId={sessionId} openWithAppId={openWithAppId} workspacePath={currentWorkspacePath ?? undefined} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <GitCompare className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-xs">Select or add a tab to view content</p>
          </div>
        )}
      </div>
    </div>
  )
})
