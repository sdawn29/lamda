import { useSyncExternalStore } from "react"

import { useDockStore } from "@/features/dock/store"
import type { ToolMessage } from "../types"

interface SubagentPanelSnapshot {
  runs: ToolMessage[]
  selectedId: string | null
}

const EMPTY_SNAPSHOT: SubagentPanelSnapshot = { runs: [], selectedId: null }
const snapshots = new Map<string, SubagentPanelSnapshot>()
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishSubagentRuns(
  sessionId: string,
  runs: ToolMessage[]
): void {
  const previous = snapshots.get(sessionId)
  // The selected run may come from the panel's full-history query and therefore
  // not exist in the chat's currently loaded message window.
  const selectedId = previous?.selectedId ?? null
  if (
    previous?.selectedId === selectedId &&
    previous.runs.length === runs.length &&
    previous.runs.every((run, index) => run === runs[index])
  ) {
    return
  }
  snapshots.set(sessionId, {
    runs,
    selectedId,
  })
  emitChange()
}

export function clearSubagentRuns(sessionId: string): void {
  if (snapshots.delete(sessionId)) emitChange()
}

export function selectSubagent(
  sessionId: string,
  toolCallId: string | null
): void {
  const snapshot = snapshots.get(sessionId) ?? EMPTY_SNAPSHOT
  if (snapshot.selectedId === toolCallId) return
  snapshots.set(sessionId, { ...snapshot, selectedId: toolCallId })
  emitChange()
}

export function openSubagentPanel(toolCallId: string): void {
  for (const [sessionId, snapshot] of snapshots) {
    if (!snapshot.runs.some((run) => run.toolCallId === toolCallId)) continue
    selectSubagent(sessionId, toolCallId)
    break
  }

  useDockStore.getState().openTab({
    type: "subagents",
    singleton: true,
    defaultDock: "right",
    title: "Subagents",
  })
}

export function useSubagentPanelSnapshot(
  sessionId: string
): SubagentPanelSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshots.get(sessionId) ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT
  )
}
