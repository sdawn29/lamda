import { memo, useCallback, useMemo } from "react"
import { StashEntryRow, parseStashList } from "./stash-entry-row"
import { useGitStashList } from "../queries"
import { useGitStashMutations } from "../mutations"
import { SectionCard } from "./section-card"

export const StashSection = memo(function StashSection({
  sessionId,
}: {
  sessionId: string
}) {
  const { data: stashRaw, isLoading } = useGitStashList(sessionId)
  const { apply, pop, drop } = useGitStashMutations(sessionId)

  const stashes = useMemo(() => parseStashList(stashRaw ?? ""), [stashRaw])

  const handleApply = useCallback(
    (ref: string) => apply.mutateAsync(ref),
    [apply]
  )
  const handlePop = useCallback((ref: string) => pop.mutateAsync(ref), [pop])
  const handleDrop = useCallback((ref: string) => drop.mutateAsync(ref), [drop])

  return (
    <SectionCard
      label="Stashes"
      count={stashes.length}
      isLoading={isLoading}
      className="mb-1.5"
    >
      {!isLoading && stashes.length === 0 && (
        <p className="px-4 py-2.5 text-xs text-muted-foreground/40">
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
    </SectionCard>
  )
})
