import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useSyncExternalStore } from "react"

/**
 * Newest `dataUpdatedAt` across every cached query under `rootKey`, or `null`
 * while nothing under it has resolved yet.
 *
 * Panels that poll use this to show how fresh what you're looking at actually
 * is — the max is the right reducer because a panel's queries refetch on
 * staggered intervals and any one of them landing means the view just moved.
 */
export function useQueryFreshness(rootKey: readonly unknown[]): number | null {
  const qc = useQueryClient()

  const subscribe = useCallback(
    (onChange: () => void) => qc.getQueryCache().subscribe(onChange),
    [qc]
  )

  // Callers build their root from a `*Keys` helper, so the array is a fresh
  // object every render even though its contents are stable. Serializing it
  // gives the memo a value-based dependency — query keys are JSON-serializable
  // by React Query's own contract.
  const keyHash = JSON.stringify(rootKey)

  const getSnapshot = useCallback(() => {
    const queryKey = JSON.parse(keyHash) as unknown[]
    let newest = 0
    for (const query of qc.getQueryCache().findAll({ queryKey })) {
      if (query.state.status !== "success") continue
      if (query.state.dataUpdatedAt > newest) newest = query.state.dataUpdatedAt
    }
    return newest === 0 ? null : newest
  }, [qc, keyHash])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
