import { useCallback, useEffect, useMemo, useState, memo } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  AlignLeft,
  FolderGit2,
  GitCommit,
  GitCompare,
  History,
  Loader2,
  GitBranch,
  PackageMinus,
  PackagePlus,
  Undo2,
  X,
  Maximize2,
  Minimize2,
  CloudDownload,
  RefreshCw,
} from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useReviewPanel } from "../store"
import { useMainTabs, useMainTabsStore } from "@/features/main-tabs"
import {
  useGitDiffStat,
  useGitStatus,
  useTurns,
  useTurnDiffStat,
  useRevertToTurn,
  type TurnSummary,
} from "../queries"
import {
  useGitStage,
  useGitStageAll,
  useGitRevertFile,
  useGitFetch,
  useGitPull,
  useInitializeGitRepository,
} from "../mutations"
import { type ChangedFile, parseStatusLine } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { CommitInputSection } from "./commit-dialog"
import { FilesSection } from "./files-section"
import { HistoryView } from "./history-view"
import { FileListItem } from "./file-list-item"
import { FileHeader } from "./file-header"
import { SORT_OPTIONS, type SortMode, applySortMode } from "./sort-utils"
import { cn } from "@/shared/lib/utils"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { getServerUrl } from "@/shared/lib/client"
import { LANGUAGE_MAP } from "@/shared/lib/language-map"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
import { useChatActions } from "@/features/chat/contexts/chat-actions-context"
import {
  LspCodeViewer,
  ProblemsStrip,
  OutlinePanel,
  useFileDiagnostics,
  useLspConnection,
  useOpenDocument,
  useResolveWorkspaceId,
  useDocumentSymbols,
} from "@/features/lsp"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface ReviewPanelProps {
  sessionId: string
  workspaceSessionId?: string
  openWithAppId?: string | null
  isEmbedded?: boolean
  onClose?: () => void
}

// ─── Turn History View ────────────────────────────────────────────────────────

type ContentView = "turn" | "all" | "history"

function formatTurnTime(ts: number): string {
  if (!ts) return "In progress"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

const TurnItem = memo(function TurnItem({
  turn,
  turnNumber,
  sessionId,
  mode,
  isExpanded,
  onToggle,
  onRevert,
  isReverting,
}: {
  turn: TurnSummary
  turnNumber: number
  sessionId: string
  mode: DiffMode
  isExpanded: boolean
  onToggle: (id: number) => void
  onRevert: (id: number) => void
  isReverting: boolean
}) {
  const files: ChangedFile[] = useMemo(
    () =>
      turn.files
        .map((f) => parseStatusLine(`${f.postStatusCode} ${f.filePath}`))
        .filter(Boolean),
    [turn.files]
  )

  return (
    <div className="mx-2 mt-1.5 overflow-hidden rounded-lg border border-border/50">
      <button
        type="button"
        onClick={() => onToggle(turn.id)}
        className="flex h-7 w-full items-center gap-1.5 bg-muted/30 px-2.5 transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
            isExpanded && "rotate-90"
          )}
        />
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
          Turn {turnNumber}
        </span>
        {turn.checkpointSha && (
          <span
            className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60"
            title={`Checkpoint: ${turn.checkpointSha}`}
          >
            checkpoint
          </span>
        )}
        {files.length > 0 && (
          <Badge
            variant="secondary"
            className="h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums"
          >
            {files.length}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
          {formatTurnTime(turn.inProgress ? turn.startedAt : turn.endedAt)}
        </span>
        {!turn.inProgress && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isReverting}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRevert(turn.id)
                  }}
                  className="shrink-0 text-muted-foreground/50 hover:text-destructive"
                >
                  {isReverting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="h-3 w-3" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="left">
              Revert to before this turn
            </TooltipContent>
          </Tooltip>
        )}
      </button>

      {isExpanded && files.length > 0 && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          <div className="divide-y divide-border/20">
            {files.map((file) => (
              <FileListItem
                key={file.filePath}
                file={file}
                sessionId={sessionId}
                mode={mode}
                showActions={false}
              />
            ))}
          </div>
        </div>
      )}

      {isExpanded && files.length === 0 && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          <p className="px-3 py-1.5 text-[11px] text-muted-foreground/40">
            No file changes recorded
          </p>
        </div>
      )}
    </div>
  )
})

const TurnHistoryView = memo(function TurnHistoryView({
  sessionId,
  mode,
  turns: allTurns,
  isLoading,
  clearedAt,
}: {
  sessionId: string
  mode: DiffMode
  turns: TurnSummary[]
  isLoading: boolean
  clearedAt?: number
}) {
  const turns = clearedAt
    ? allTurns.filter((t) => t.inProgress || t.startedAt > clearedAt)
    : allTurns

  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(turns[0] ? [turns[0].id] : [])
  )
  const [prevTopId, setPrevTopId] = useState<number | undefined>(turns[0]?.id)

  // Auto-expand newest turn — derived state during render (React-recommended pattern)
  const topId = turns[0]?.id
  if (topId !== undefined && topId !== prevTopId) {
    setPrevTopId(topId)
    setExpandedIds((prev) => new Set([...prev, topId]))
  }

  const revertMutation = useRevertToTurn(sessionId)
  const revertingId = revertMutation.isPending
    ? revertMutation.variables
    : undefined
  const revertTurn = revertMutation.mutate

  const toggleTurn = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <History className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground/60">
            No turns yet
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground/40">
            Each agent turn creates a checkpoint you can revert to
          </p>
        </div>
      </div>
    )
  }

  const totalTurns = turns.filter((t) => !t.inProgress).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      {turns.map((turn, index) => {
        // Turn number: most recent completed turn = totalTurns, going down
        const turnNumber = turn.inProgress
          ? totalTurns + 1
          : totalTurns - (index - (turns[0]?.inProgress ? 1 : 0))
        return (
          <TurnItem
            key={turn.id}
            turn={turn}
            turnNumber={turnNumber}
            sessionId={sessionId}
            mode={mode}
            isExpanded={expandedIds.has(turn.id)}
            onToggle={toggleTurn}
            onRevert={revertTurn}
            isReverting={revertingId === turn.id}
          />
        )
      })}
    </div>
  )
})

// ─── Source Control Toolbar ───────────────────────────────────────────────────

const SourceControlToolbarSection = memo(function SourceControlToolbarSection({
  workspaceSessionId,
  view,
  mode,
  setMode,
  sortMode,
  setSortMode,
}: {
  workspaceSessionId: string
  view: ContentView
  mode: DiffMode
  setMode: (m: DiffMode) => void
  sortMode: SortMode
  setSortMode: (s: SortMode) => void
}) {
  const { data: statusData } = useGitStatus(workspaceSessionId)
  const { hasStaged, hasUnstaged } = useMemo(() => {
    const all = (statusData?.raw ?? "")
      .split("\n")
      .map((l: string) => l.trimEnd())
      .filter(Boolean)
      .map(parseStatusLine)
    return {
      hasStaged: all.some((f: ChangedFile) => f.isStaged),
      hasUnstaged: all.some((f: ChangedFile) => !f.isStaged),
    }
  }, [statusData])

  const { stageAll, unstageAll } = useGitStageAll(workspaceSessionId)
  const bulkWorking = stageAll.isPending || unstageAll.isPending
  const fetch = useGitFetch(workspaceSessionId)
  const pull = useGitPull(workspaceSessionId)
  const remoteWorking = fetch.isPending || pull.isPending

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <div className="mx-1 h-4 w-px bg-border/50" />

      {/* Git actions dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground/70 hover:text-foreground"
                  >
                    <GitBranch />
                    <span className="sr-only">Git actions</span>
                  </Button>
                }
              />
            }
          />
          <TooltipContent>Git actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => fetch.mutate()}
            disabled={remoteWorking}
            className="flex items-center gap-2"
          >
            {fetch.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Fetch
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => pull.mutate()}
            disabled={remoteWorking}
            className="flex items-center gap-2"
          >
            {pull.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudDownload className="h-3.5 w-3.5" />
            )}
            Pull
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => stageAll.mutateAsync()}
            disabled={bulkWorking || !hasUnstaged || view === "turn"}
            className="flex items-center gap-2"
          >
            {stageAll.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackagePlus className="h-3.5 w-3.5" />
            )}
            Stage all
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => unstageAll.mutateAsync()}
            disabled={bulkWorking || !hasStaged || view === "turn"}
            className="flex items-center gap-2"
          >
            {unstageAll.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackageMinus className="h-3.5 w-3.5" />
            )}
            Unstage all
          </DropdownMenuItem>
          {view !== "turn" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium tracking-wider text-muted-foreground/60 uppercase">
                  Sort by
                </DropdownMenuLabel>
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
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-0.5 h-4 w-px bg-border/50" />

      {/* Diff mode */}
      <div className="inline-flex h-7 items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode("inline")}
          data-active={mode === "inline"}
          className="h-6 rounded-sm px-1.5 text-muted-foreground/75 hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-xs"
        >
          <AlignLeft className="h-3.5 w-3.5" />
          <span className="sr-only">Inline</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode("side-by-side")}
          data-active={mode === "side-by-side"}
          className="h-6 rounded-sm px-1.5 text-muted-foreground/75 hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-xs"
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span className="sr-only">Side-by-side</span>
        </Button>
      </div>
    </div>
  )
})

// ─── Source Control Content ───────────────────────────────────────────────────

const SourceControlContent = memo(function SourceControlContent({
  sessionId,
  workspaceSessionId,
  view,
  mode,
  sortMode,
  onCommitSuccess,
  turnsClearedAt,
}: {
  sessionId: string
  workspaceSessionId: string
  view: ContentView
  mode: DiffMode
  sortMode: SortMode
  onCommitSuccess?: () => void
  turnsClearedAt?: number
}) {
  const { data: turnsData = [], isLoading: turnsLoading } = useTurns(sessionId)

  const {
    data: statusData,
    isLoading: loading,
    error: statusError,
  } = useGitStatus(workspaceSessionId)

  const isGitRepo = statusData?.isGitRepo !== false
  const statusRaw = statusData?.raw ?? ""

  const { staged, unstaged } = useMemo(() => {
    const all = statusRaw
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

  const error = statusError instanceof Error ? statusError.message : null

  const initRepo = useInitializeGitRepository(workspaceSessionId)

  const { stage, unstage } = useGitStage(workspaceSessionId)
  const revertFile = useGitRevertFile(workspaceSessionId)

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

  const handleRevert = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {view === "turn" ? (
          <TurnHistoryView
            sessionId={sessionId}
            mode={mode}
            turns={turnsData}
            isLoading={turnsLoading}
            clearedAt={turnsClearedAt}
          />
        ) : view === "history" ? (
          <HistoryView sessionId={workspaceSessionId} />
        ) : (
          <>
            <CommitInputSection sessionId={workspaceSessionId} onCommitSuccess={onCommitSuccess} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!loading && !isGitRepo && (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <FolderGit2 className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground/60">
                      Not a git repository
                    </p>
                    <p className="text-[10px] leading-relaxed text-muted-foreground/40">
                      This folder is not tracked by git
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => initRepo.mutate()}
                    disabled={initRepo.isPending}
                  >
                    {initRepo.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderGit2 className="h-3 w-3" />
                    )}
                    Initialize Repository
                  </Button>
                </div>
              )}

              {isGitRepo && (
                <>
                  {loading && staged.length === 0 && unstaged.length === 0 && (
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

                  {!loading &&
                    !error &&
                    staged.length === 0 &&
                    unstaged.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <GitCompare className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground/60">
                            No changes
                          </p>
                          <p className="text-[10px] text-muted-foreground/40">
                            Your working tree is clean
                          </p>
                        </div>
                      </div>
                    )}

                  {!loading &&
                    !error &&
                    (staged.length > 0 || unstaged.length > 0) && (
                      <FilesSection
                        label="Staged"
                        files={staged}
                        sessionId={workspaceSessionId}
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
                      sessionId={workspaceSessionId}
                      mode={mode}
                      onStageToggle={handleStageToggle}
                      onRevert={handleRevert}
                    />
                  )}
                </>
              )}
            </div>

          </>
        )}
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
  const { addFileTab } = useMainTabs()
  const chatActions = useChatActions()
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState(true)
  const [scrollToLine, setScrollToLine] = useState<number | null>(null)

  const workspaceId = useResolveWorkspaceId(workspacePath)
  const lsp = useLspConnection(workspaceId)

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

  const isCodeView =
    !isImage && !isPdf && !markdownPreview && !(isHtml && htmlPreview)
  const lspFilePath = isCodeView ? filePath : null
  useOpenDocument(lsp, lspFilePath, isCodeView ? content : null)
  const diagnostics = useFileDiagnostics(lsp, lspFilePath)
  const symbols = useDocumentSymbols(lsp, lspFilePath, isCodeView)

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
              addFileTab({
                title: linkFileName,
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
    [filePath, serverUrl, addFileTab]
  )

  // Enable rich text preview by default for markdown/html files
  useEffect(() => {
    setMarkdownPreview(isMarkdown)
    setHtmlPreview(isHtml)
  }, [filePath, isMarkdown, isHtml])
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
        <div className="bg-transparent">
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
        <div className="bg-transparent">
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
      <div className="bg-transparent">
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
          htmlPreview={htmlPreview}
          onToggleHtmlPreview={
            isHtml ? () => setHtmlPreview(!htmlPreview) : undefined
          }
          isPdf={isPdf}
        />
      </div>
      {isCodeView && (
        <>
          <ProblemsStrip
            diagnostics={diagnostics}
            onJumpToLine={(line) => setScrollToLine(line)}
          />
          <OutlinePanel
            symbols={symbols}
            onJumpToLine={(line) => setScrollToLine(line)}
          />
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-lg border border-border/50 [--code-gutter-bg:var(--sidebar)]",
            isImage && "flex items-center justify-center p-4",
            isHtml && htmlPreview && "overflow-hidden",
            !isImage &&
              markdownPreview &&
              "prose prose-sm max-w-none p-4 dark:prose-invert",
            !isImage &&
              !markdownPreview &&
              !(isHtml && htmlPreview) &&
              "file-viewer-code pl-4"
          )}
          style={
            markdownPreview || (isHtml && htmlPreview)
              ? undefined
              : { userSelect: "text" }
          }
        >
          {isImage ? (
            <img
              src={`${serverUrl}/file?path=${encodeURIComponent(filePath)}`}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
            />
          ) : isHtml && htmlPreview ? (
            <iframe
              src={`${serverUrl}/file?path=${encodeURIComponent(filePath)}`}
              title={fileName}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : markdownPreview ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownLinkComponents}
            >
              {content ?? ""}
            </ReactMarkdown>
          ) : (
            <LspCodeViewer
              code={content ?? ""}
              language={language}
              fontSize="0.75rem"
              diagnostics={diagnostics}
              connection={lsp}
              filePath={lspFilePath}
              onOpenFile={(target, title) =>
                addFileTab({ title, filePath: target, workspacePath })
              }
              onAddCommentContext={(context) => {
                const contextPath =
                  workspacePath && context.filePath.startsWith(workspacePath)
                    ? context.filePath
                        .slice(workspacePath.length)
                        .replace(/^[/\\]+/, "")
                    : context.filePath
                chatActions?.addFileCommentContext({
                  path: contextPath,
                  line: context.line,
                  comment: context.comment,
                  code: context.code,
                })
              }}
              scrollToLine={scrollToLine}
            />
          )}
        </div>
      </div>
    </div>
  )
})

// ─── Main ReviewPanel ──────────────────────────────────────────────────────────

export const ReviewPanel = memo(function ReviewPanel({
  sessionId,
  workspaceSessionId: workspaceSessionIdProp,
  openWithAppId,
  isEmbedded = false,
  onClose,
}: ReviewPanelProps) {
  const workspaceSessionId = workspaceSessionIdProp ?? sessionId

  const {
    close: closeDiffPanel,
    toggleFullscreen,
    isFullscreen,
    currentWorkspacePath,
  } = useReviewPanel()

  const activeFileTab = useMainTabsStore((s) => {
    if (!s.activeTabId) return null
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.type === "file" ? tab : null
  })
  const clearActiveTab = useMainTabsStore((s) => s.clearActiveTab)

  const close = onClose ?? closeDiffPanel

  const { data: diffStat } = useGitDiffStat(workspaceSessionId)
  const { data: turnsData = [] } = useTurns(sessionId)

  // Source-control tab state (lifted so toolbar and content share it)
  const [scView, setScView] = useState<ContentView>("turn")
  const [scMode, setScMode] = useState<DiffMode>("inline")
  const [scSortMode, setScSortMode] = useState<SortMode>("name")
  const [turnsClearedAt, setTurnsClearedAt] = useState(0)
  const activeTurnId = turnsData[0]?.id
  const { data: turnDiffStat } = useTurnDiffStat(
    sessionId,
    activeTurnId,
    scView === "turn" && activeTurnId !== undefined
  )
  const visibleDiffStat =
    scView === "all" ? diffStat : scView === "turn" ? turnDiffStat : undefined

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF, toggleFullscreen)
  const fullscreenBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF
  )

  const selectScView = useCallback(
    (view: ContentView) => {
      clearActiveTab()
      setScView(view)
    },
    [clearActiveTab]
  )

  const handleCommitSuccess = useCallback(() => setTurnsClearedAt(Date.now()), [])

  return (
    <>
      <div className="flex h-full w-full flex-col bg-transparent">
        {/* Tab bar — only shown when viewing source control */}
        {!activeFileTab && (
          <div className="flex h-11 shrink-0 items-center gap-0.5 bg-transparent px-1">
            {/* View selector for source-control content */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs font-medium text-muted-foreground/80 hover:text-foreground"
                  >
                    {scView === "turn" ? (
                      <History className="h-3 w-3" />
                    ) : scView === "history" ? (
                      <GitCommit className="h-3 w-3" />
                    ) : (
                      <GitCompare className="h-3 w-3" />
                    )}
                    {scView === "turn"
                      ? "This Turn"
                      : scView === "history"
                        ? "History"
                        : "All Changes"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem
                  onClick={() => selectScView("turn")}
                  className="flex items-center gap-2"
                >
                  <History className="h-3.5 w-3.5" />
                  This Turn
                  {scView === "turn" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectScView("all")}
                  className="flex items-center gap-2"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  All Changes
                  {scView === "all" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectScView("history")}
                  className="flex items-center gap-2"
                >
                  <GitCommit className="h-3.5 w-3.5" />
                  History
                  {scView === "history" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {visibleDiffStat &&
              (visibleDiffStat.additions > 0 ||
                visibleDiffStat.deletions > 0) && (
                <span className="flex animate-in items-center gap-1 font-mono text-[11px] leading-none duration-200 fade-in-0 zoom-in-90">
                  <span className="text-emerald-500">
                    +{visibleDiffStat.additions}
                  </span>
                  <span className="text-rose-500">
                    -{visibleDiffStat.deletions}
                  </span>
                </span>
              )}

            <div className="flex-1" />

            {/* Git actions + diff mode — not in history view */}
            {scView !== "history" && (
              <SourceControlToolbarSection
                workspaceSessionId={workspaceSessionId}
                view={scView}
                mode={scMode}
                setMode={setScMode}
                sortMode={scSortMode}
                setSortMode={setScSortMode}
              />
            )}

            {/* Right side buttons */}
            <div className="flex shrink-0 items-center gap-0.5 px-0.5">
              {!isEmbedded && (
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
              )}
              {!isEmbedded && (
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
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeFileTab ? (
            <FileContent
              filePath={activeFileTab.filePath}
              openWithAppId={openWithAppId}
              workspacePath={
                currentWorkspacePath ?? activeFileTab.workspacePath
              }
            />
          ) : (
            <SourceControlContent
              sessionId={sessionId}
              workspaceSessionId={workspaceSessionId}
              view={scView}
              mode={scMode}
              sortMode={scSortMode}
              onCommitSuccess={handleCommitSuccess}
              turnsClearedAt={turnsClearedAt}
            />
          )}
        </div>
      </div>
    </>
  )
})
