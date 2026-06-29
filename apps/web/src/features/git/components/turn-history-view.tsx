import { useCallback, useState, memo } from "react"
import { History, Loader2 } from "lucide-react"
import {
  useLastCommitAt,
  useRevertToTurn,
  type TurnSummary,
} from "../queries"
import { type DiffMode } from "./diff-view"
import { TurnItem } from "./turn-item"

export const TurnHistoryView = memo(function TurnHistoryView({
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
