import { useCallback, useMemo, useState, memo } from "react"
import {
  AlertCircle,
  Archive,
  Check,
  Columns2,
  AlignLeft,
  GitCompare,
  GitMerge,
  Loader2,
  Maximize2,
  Minimize2,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  X,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useDiffPanel } from "../context"
import {
  useGitStatus,
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
import { SORT_OPTIONS, type SortMode, applySortMode } from "./sort-utils"
import { cn } from "@/shared/lib/utils"

interface DiffPanelProps {
  sessionId: string
}

export const DiffPanel = memo(function DiffPanel({
  sessionId,
}: DiffPanelProps) {
  const { close, isFullscreen, setIsFullscreen } = useDiffPanel()
  const [mode, setMode] = useState<DiffMode>("inline")
  const [sortMode, setSortMode] = useState<SortMode>("name")
  const [stashInputOpen, setStashInputOpen] = useState(false)

  const {
    data: statusRaw,
    isLoading: loading,
    error: statusError,
    refetch,
  } = useGitStatus(sessionId)

  const { staged, unstaged } = useMemo(() => {
    const all = (statusRaw ?? "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .map(parseStatusLine)
    return {
      staged: applySortMode(
        all.filter((f) => f.isStaged),
        sortMode
      ),
      unstaged: applySortMode(
        all.filter((f) => !f.isStaged),
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
      await stash.mutateAsync(message || undefined)
      setStashInputOpen(false)
    },
    [stash]
  )

  const hasStaged = staged.length > 0
  const hasUnstaged = unstaged.length > 0
  const hasChanges = files.length > 0

  return (
    <div className="flex h-full shrink-0 flex-col border-l border-border/60 bg-background">
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border/50 pr-1.5 pl-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
            <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold">Source Control</span>
        </div>

        <div className="flex flex-1 items-center gap-1.5 overflow-hidden pl-1">
          {hasStaged && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              <GitMerge className="h-2.5 w-2.5" />
              {staged.length} staged
            </span>
          )}
          {hasUnstaged && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {unstaged.length} changed
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => refetch()}
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="sr-only">Refresh</span>
                </Button>
              }
            />
            <TooltipContent>Refresh status</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">
                    {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </span>
                </Button>
              }
            />
            <TooltipContent>
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </TooltipContent>
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
                {bulkWorking ? (
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
                <PackageMinus className="h-3 w-3" />
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
  )
})