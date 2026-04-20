import { memo, useCallback, useMemo, useState } from "react"
import { Archive, ChevronRight, Loader2 } from "lucide-react"
import { StashEntryRow, parseStashList } from "./stash-entry-row"
import { useGitStashList, useGitStashMutations } from "../queries"
import { cn } from "@/shared/lib/utils"

export const StashSection = memo(function StashSection({
  sessionId,
}: {
  sessionId: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  const { data: stashRaw, isLoading } = useGitStashList(sessionId)
  const { apply, pop, drop } = useGitStashMutations(sessionId)

  const stashes = useMemo(() => parseStashList(stashRaw ?? ""), [stashRaw])

  const handleApply = useCallback(
    (ref: string) => apply.mutateAsync(ref),
    [apply]
  )
  const handlePop = useCallback(
    (ref: string) => pop.mutateAsync(ref),
    [pop]
  )
  const handleDrop = useCallback(
    (ref: string) => drop.mutateAsync(ref),
    [drop]
  )

  return (
    <div className="shrink-0 border-t border-border/50">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
            !collapsed && "rotate-90"
          )}
        />
        <Archive className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className="flex-1 text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
          Stashes
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
        )}
        {!isLoading && stashes.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground">
            {stashes.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {!isLoading && stashes.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground/40">
              No stashes
            </p>
          )}
          {stashes.map((s) => (
            <StashEntryRow
              key={s.ref}
              entry={s}
              onApply={handleApply}
              onPop={handlePop}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
})