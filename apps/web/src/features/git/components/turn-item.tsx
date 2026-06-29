import { useMemo, memo } from "react"
import { ChevronRight, Loader2, Undo2 } from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useTurnDiffStat, type TurnSummary } from "../queries"
import { type ChangedFile, parseStatusLine } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { FileListItem } from "./file-list-item"
import { cn } from "@/shared/lib/utils"

function formatTurnTime(ts: number): string {
  if (!ts) return "In progress"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export const TurnItem = memo(function TurnItem({
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
