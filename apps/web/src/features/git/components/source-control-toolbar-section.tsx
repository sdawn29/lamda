import { useMemo, memo } from "react"
import {
  Check,
  GitBranch,
  Loader2,
  PackageMinus,
  PackagePlus,
  CloudDownload,
  RefreshCw,
} from "lucide-react"
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
import { useGitStatus } from "../queries"
import { useGitStageAll, useGitFetch, useGitPull } from "../mutations"
import { DiffModeToggle } from "./diff-mode-toggle"
import { type ChangedFile, parseStatusLines } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { SORT_OPTIONS, type SortMode } from "./sort-utils"
import { type ContentView } from "./review-panel-types"

export const SourceControlToolbarSection = memo(
  function SourceControlToolbarSection({
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
        <DiffModeToggle mode={mode} onModeChange={setMode} />
      </div>
    )
  }
)
