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
import {
  Archive,
  Check,
  Columns2,
  AlignLeft,
  GitCompare,
  Loader2,
  PackageMinus,
  PackagePlus,
  Plus,
  X,
  ArrowUpDown,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { FileSearchModal } from "@/features/file-tree"
import { useDiffPanel, type DiffPanelTab } from "../context"
import { useWorkspace } from "@/features/workspace"
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
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { getServerUrl } from "@/shared/lib/client"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
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

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mjsx: "jsx",
  cjsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  yml: "yaml",
  md: "markdown",
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
                className="text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                {stageAll.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PackagePlus />
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
                className="text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                {unstageAll.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PackageMinus />
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
                className="text-muted-foreground/70 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <AlignLeft />
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
                className="text-muted-foreground/70 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <Columns2 />
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
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      data-active={sortMode !== "name"}
                      className="text-muted-foreground/70 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                    />
                  }
                >
                  <ArrowUpDown />
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
                className="text-muted-foreground/70 hover:text-foreground disabled:opacity-35"
              >
                <Archive />
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
            <Alert variant="destructive" className="mx-3 mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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

function resolveFilePath(currentFilePath: string, href: string): string {
  const dir = currentFilePath.split(/[/\\]/).slice(0, -1).join("/")
  const parts = `${dir}/${href}`.split("/")
  const resolved: string[] = []
  for (const part of parts) {
    if (part === "..") resolved.pop()
    else if (part !== ".") resolved.push(part)
  }
  return resolved.join("/")
}

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
  const [serverUrl, setServerUrl] = useState<string>("")
  const { addTab, open: openPanel } = useDiffPanel()
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Get available apps for default editor selection
  const { data: platform } = useElectronPlatform()
  const isMac = platform === "darwin"
  const { data: apps = [] } = useOpenWithApps(isMac)

  // Determine the effective editor to use (same logic as OpenWithButton)
  const effectiveAppId = useMemo(() => {
    if (!isMac || apps.length === 0) return undefined
    // Use user-selected app, or fall back to first app (default)
    return openWithAppId ?? apps[0].id
  }, [isMac, apps, openWithAppId])

  // Extract relative path from workspace
  const relativePath = workspacePath
    ? filePath.startsWith(workspacePath)
      ? filePath.slice(workspacePath.length).replace(/^[/\\]+/, "")
      : filePath
    : filePath
  const pathParts = relativePath.split(/[/\\]/).filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? ""
  const fileExtension = fileName.split(".").pop()?.toLowerCase() ?? ""
  const isMarkdown = fileExtension === "md" || fileExtension === "markdown"
  const isImage = /^(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|avif)$/.test(
    fileExtension
  )
  const isHtml = fileExtension === "html" || fileExtension === "htm"
  const isPdf = fileExtension === "pdf"

  const markdownLinkComponents = useMemo(
    () => ({
      a: ({ href, children }: React.ComponentProps<"a">) => {
        const isExternal = !href || /^(https?:|mailto:|#)/.test(href)
        if (isExternal) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              {children}
            </a>
          )
        }
        const resolvedPath = href.startsWith("/")
          ? href
          : resolveFilePath(filePath, href)
        const linkFileName = resolvedPath.split(/[/\\]/).pop() || resolvedPath
        return (
          <button
            type="button"
            onClick={() => {
              openPanel()
              addTab({
                title: linkFileName,
                type: "file",
                filePath: resolvedPath,
              })
            }}
            className="cursor-pointer underline underline-offset-4"
          >
            {children}
          </button>
        )
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (!src) return null
        const resolvedSrc = /^https?:/.test(src)
          ? src
          : `${serverUrl}/file?path=${encodeURIComponent(
              src.startsWith("/") ? src : resolveFilePath(filePath, src)
            )}`
        return (
          <img
            src={resolvedSrc}
            alt={alt ?? ""}
            className="max-w-full rounded"
          />
        )
      },
    }),
    [filePath, serverUrl, addTab, openPanel]
  )

  // Enable rich text preview by default for markdown files
  useEffect(() => {
    setMarkdownPreview(isMarkdown)
  }, [filePath])
  const language = LANGUAGE_MAP[fileExtension] ?? fileExtension

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)

    const loadFile = async () => {
      try {
        const url = await getServerUrl()
        if (!cancelled) setServerUrl(url)

        if (isImage) {
          if (!cancelled) setLoading(false)
          return
        }

        const response = await fetch(
          `${url}/file?path=${encodeURIComponent(filePath)}`
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
  }, [filePath, isImage])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/50">
          <FileHeader
            pathParts={pathParts}
            filePath={filePath}
            openWithAppId={effectiveAppId}
          />
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
          <FileHeader
            pathParts={pathParts}
            filePath={filePath}
            openWithAppId={effectiveAppId}
          />
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
          openWithAppId={effectiveAppId}
          isMarkdown={isMarkdown}
          markdownPreview={markdownPreview}
          onToggleMarkdownPreview={
            isMarkdown ? () => setMarkdownPreview(!markdownPreview) : undefined
          }
          isHtml={isHtml}
          isPdf={isPdf}
        />
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          isImage && "flex items-center justify-center p-4",
          !isImage &&
            markdownPreview &&
            "prose prose-sm max-w-none p-4 dark:prose-invert",
          !isImage && !markdownPreview && "file-viewer-code pl-4"
        )}
        style={markdownPreview ? undefined : { userSelect: "text" }}
      >
        {isImage ? (
          <img
            src={`${serverUrl}/file?path=${encodeURIComponent(filePath)}`}
            alt={fileName}
            className="max-h-full max-w-full object-contain"
          />
        ) : markdownPreview ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownLinkComponents}
          >
            {content ?? ""}
          </ReactMarkdown>
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
    return (
      <FileContent
        filePath={tab.filePath}
        openWithAppId={openWithAppId}
        workspacePath={workspacePath}
      />
    )
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
  const { workspaces } = useWorkspace()
  const currentWorkspaceId = workspaces.find(
    (ws) => ws.path === currentWorkspacePath
  )?.id
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map())

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF, toggleFullscreen)
  const fullscreenBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF
  )

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
    setShowAddMenu(false)
    setFileSearchOpen(true)
  }, [])

  const handleFileSelect = useCallback(
    (relativePath: string) => {
      const filePath = currentWorkspacePath
        ? `${currentWorkspacePath}/${relativePath}`
        : relativePath
      const fileName = relativePath.split(/[/\\]/).pop() || relativePath
      addTab({ title: fileName, type: "file", filePath })
    },
    [addTab, currentWorkspacePath]
  )

  return (
    <>
      {currentWorkspaceId && (
        <FileSearchModal
          open={fileSearchOpen}
          onOpenChange={setFileSearchOpen}
          workspaceId={currentWorkspaceId}
          onSelect={handleFileSelect}
        />
      )}
      <div className="flex h-full w-full flex-col bg-background">
        {/* Tab bar */}
        <div className="flex h-8 shrink-0 items-stretch border-b">
          <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  ref={(el) => {
                    if (el) {
                      tabRefs.current.set(tab.id, el)
                    } else {
                      tabRefs.current.delete(tab.id)
                    }
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "group relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-none border-r pr-1 pl-3 text-xs select-none",
                    isActive
                      ? "bg-background text-foreground after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:bg-primary"
                      : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {tab.type === "source-control" ? (
                    <GitCompare className="size-3.5 shrink-0" />
                  ) : (
                    <Icon
                      icon={`catppuccin:${getIconName(tab.title)}`}
                      className="size-3.5 shrink-0"
                      aria-hidden
                    />
                  )}
                  <span className="max-w-30 truncate">{tab.title}</span>
                  {tab.type !== "source-control" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Close ${tab.title}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tab.id)
                      }}
                      className={cn(
                        "ml-auto shrink-0",
                        isActive
                          ? "opacity-60 hover:opacity-100"
                          : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                      )}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              )
            })}

            {/* Add tab dropdown */}
            <DropdownMenu open={showAddMenu} onOpenChange={setShowAddMenu}>
              <DropdownMenuTrigger className="flex items-center px-2 text-muted-foreground hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={handleAddFileTab}>
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
                    className="text-muted-foreground/60 hover:text-foreground"
                  >
                    {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                    <span className="sr-only">
                      {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </span>
                  </Button>
                }
              />
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}{" "}
                <ShortcutKbd binding={fullscreenBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={close}
                    className="text-muted-foreground/60 hover:text-foreground"
                  >
                    <X />
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
            <TabContent
              tab={activeTab}
              sessionId={sessionId}
              openWithAppId={openWithAppId}
              workspacePath={currentWorkspacePath ?? undefined}
            />
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
    </>
  )
})
