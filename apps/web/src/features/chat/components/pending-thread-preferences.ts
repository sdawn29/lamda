import type { ThinkingLevel } from "./thinking-combobox"

export interface PendingThreadPreferences {
  modelId?: string | null
  thinkingLevel?: ThinkingLevel
}

const pendingThreadPreferences = new Map<string, PendingThreadPreferences>()

export function getPendingThreadPreferences(threadId: string) {
  return pendingThreadPreferences.get(threadId)
}

export function setPendingThreadPreferences(
  threadId: string,
  preferences: PendingThreadPreferences
) {
  pendingThreadPreferences.set(threadId, preferences)
}

export function clearPendingThreadPreferences(threadId: string) {
  pendingThreadPreferences.delete(threadId)
}
