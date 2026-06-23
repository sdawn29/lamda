import { useCallback, useMemo, useState, memo } from "react"
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
import { SectionLabel } from "@/shared/ui/section-label"
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
import {
  useMainTabs,
  useMainTabsStore,
  FileContentView,
} from "@/features/main-tabs"
import {
  useGitDiffStat,
  useGitStatus,
  useTurns,
  useTurnDiffStat,
  useRevertToTurn,
  useLastCommitAt,
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
import { type ChangedFile, parseStatusLine, parseStatusLines } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { CommitInputSection } from "./commit-dialog"
import { FilesSection } from "./files-section"
import { HistoryView } from "./history-view"
import { FileListItem } from "./file-list-item"
import { SORT_OPTIONS, type SortMode, applySortMode } from "./sort-utils"
import { cn } from "@/shared/lib/utils"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"

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

  const { data: diffStat } = useTurnDiffStat(
    sessionId,
    turn.id,
    isExpanded && files.length > 0
  )
  const fileCounts = useMemo(() => {
    const map = new Map<string, { added: number; removed: number }>()
    for (const f of diffStat?.files ?? []) {
      map.set(f.filePath, { added: f.additions, removed: f.deletions })
    }
    return map
  }, [diffStat])

  return (
    <div className="mx-2 mt-1.5 overflow-hidden rounded-lg border border-border/50">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(turn.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggle(turn.id)
          }
        }}
        className="flex h-7 w-full cursor-pointer items-center gap-1.5 bg-muted/30 px-2.5 transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
            isExpanded && "rotate-90"
          )}
        />
        <SectionLabel>Turn {turnNumber}</SectionLabel>
        {turn.checkpointSha && (
          <span
            className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-3xs text-muted-foreground/60"
            title={`Checkpoint: ${turn.checkpointSha}`}
          >
            checkpoint
          </span>
        )}
        {files.length > 0 && (
          <Badge
            variant="secondary"
            className="h-4 min-w-4 rounded-full px-1 text-3xs tabular-nums"
          >
            {files.length}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-3xs text-muted-foreground/40">
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
      </div>

      {isExpanded && files.length > 0 && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          <div className="divide-y divide-border/20">
            {files.map((file) => (
              <FileListItem
                key={file.filePath}
                file={file}
                sessionId={sessionId}
                mode={mode}
                turnId={turn.id}
                counts={fileCounts.get(file.filePath)}
                showActions={false}
              />
            ))}
          </div>
        </div>
      )}

      {isExpanded && files.length === 0 && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          <p className="px-3 py-1.5 text-2xs text-muted-foreground/40">
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
  // Reset the history at whichever is later: a manual clear (the commit button
  // here) or the latest commit on HEAD — so agent-driven commits also clear
  // banked turns, and the boundary survives a remount (the manual flag doesn't).
  const lastCommitAt = useLastCommitAt(sessionId)
  const cutoff = Math.max(clearedAt ?? 0, lastCommitAt)
  const turns = cutoff
    ? allTurns.filter((t) => t.inProgress || t.startedAt > cutoff)
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
          <p className="text-3xs leading-relaxed text-muted-foreground/40">
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
    const all = parseStatusLines(statusData?.raw ?? "")
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
                <DropdownMenuLabel className="px-2 py-1 text-3xs font-semibold tracking-wider text-muted-foreground uppercase">
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
    const all = parseStatusLines(statusRaw)
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
                    <p className="text-3xs leading-relaxed text-muted-foreground/40">
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
                          <p className="text-3xs text-muted-foreground/40">
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
                      className="mb-2"
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

const FileContent = memo(function FileContent({
  filePath,
  openWithAppId,
  workspacePath,
  initialScrollToLine,
  sourceUrl,
}: {
  filePath: string
  openWithAppId?: string | null
  workspacePath?: string
  initialScrollToLine?: number
  sourceUrl?: string
}) {
  const { addFileTab } = useMainTabs()
  return (
    <FileContentView
      variant="panel"
      filePath={filePath}
      openWithAppId={openWithAppId}
      workspacePath={workspacePath}
      initialScrollToLine={initialScrollToLine}
      sourceUrl={sourceUrl}
      onOpenFile={(target, title, line) =>
        addFileTab({
          title,
          filePath: target,
          workspacePath,
          scrollToLine: line,
        })
      }
    />
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

  // Mirror TurnHistoryView's cutoff so the header diff stat resets after a
  // commit (manual or agent-driven) — otherwise it keeps showing the last
  // turn's +/- numbers even though the turn list below has been cleared.
  const lastCommitAt = useLastCommitAt(sessionId)
  const turnsCutoff = Math.max(turnsClearedAt, lastCommitAt)
  const activeTurnId = turnsData.find(
    (t) => t.inProgress || !turnsCutoff || t.startedAt > turnsCutoff
  )?.id
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
                      ? "Turns"
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
                  Turns
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
                <span className="flex animate-in items-center gap-1 font-mono text-2xs leading-none duration-200 fade-in-0 zoom-in-90">
                  <span className="text-diff-add">
                    +{visibleDiffStat.additions}
                  </span>
                  <span className="text-diff-remove">
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
                activeFileTab.sourceUrl
                  ? activeFileTab.workspacePath
                  : currentWorkspacePath ?? activeFileTab.workspacePath
              }
              initialScrollToLine={activeFileTab.scrollToLine}
              sourceUrl={activeFileTab.sourceUrl}
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
