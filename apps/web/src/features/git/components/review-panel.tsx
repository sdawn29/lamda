import { useCallback, useState, memo } from "react"
import {
  Check,
  ChevronDown,
  GitCommit,
  GitCompare,
  History,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  useGitDiffStat,
  useTurns,
  useTurnDiffStat,
  useLastCommitAt,
} from "../queries"
import { type DiffMode } from "./diff-view"
import { type SortMode } from "./sort-utils"
import { type ContentView } from "./review-panel-types"
import { SourceControlToolbarSection } from "./source-control-toolbar-section"
import { SourceControlContent } from "./source-control-content"
import { FocusedFileDiff } from "./focused-file-diff"
import { useReviewPanelStore } from "../store"

interface ReviewPanelProps {
  sessionId: string
  workspaceSessionId?: string
}

export const ReviewPanel = memo(function ReviewPanel({
  sessionId,
  workspaceSessionId: workspaceSessionIdProp,
}: ReviewPanelProps) {
  const workspaceSessionId = workspaceSessionIdProp ?? sessionId

  const { data: diffStat } = useGitDiffStat(workspaceSessionId)
  const { data: turnsData = [] } = useTurns(sessionId)

  // Source-control tab state (lifted so toolbar and content share it)
  const [scView, setScView] = useState<ContentView>("turn")
  const [scMode, setScMode] = useState<DiffMode>("inline")
  const [scSortMode, setScSortMode] = useState<SortMode>("name")
  const [turnsClearedAt, setTurnsClearedAt] = useState(0)
  const selectedFile = useReviewPanelStore((state) => state.selectedFile)
  const clearSelectedFile = useReviewPanelStore(
    (state) => state.clearSelectedFile
  )

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

  const handleCommitSuccess = useCallback(
    () => setTurnsClearedAt(Date.now()),
    []
  )

  return (
    <div className="flex h-full w-full flex-col bg-transparent">
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
              onClick={() => setScView("turn")}
              className="flex items-center gap-2"
            >
              <History className="h-3.5 w-3.5" />
              Turns
              {scView === "turn" && (
                <Check className="ml-auto h-3 w-3 text-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setScView("all")}
              className="flex items-center gap-2"
            >
              <GitCompare className="h-3.5 w-3.5" />
              All Changes
              {scView === "all" && (
                <Check className="ml-auto h-3 w-3 text-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setScView("history")}
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
          (visibleDiffStat.additions > 0 || visibleDiffStat.deletions > 0) && (
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

        {/* Git actions + diff mode — not in the history view */}
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
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedFile ? (
          <FocusedFileDiff
            sessionId={workspaceSessionId}
            file={selectedFile}
            mode={scMode}
            onClose={clearSelectedFile}
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
  )
})
