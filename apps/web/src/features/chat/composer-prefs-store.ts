/**
 * Composer Preferences Store
 *
 * Durable, cross-thread chat composer state: the last-picked thinking level,
 * a shell-style history of sent messages (recalled with ArrowUp/ArrowDown),
 * and unsent drafts keyed by thread.
 * Persisted to localStorage via zustand's `persist` middleware.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { ThinkingLevel } from "./components/thinking-combobox"

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
]
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium"
export const MAX_MESSAGE_HISTORY = 100
const MAX_THREAD_DRAFTS = 100

interface ComposerPrefsState {
  thinkingLevel: ThinkingLevel
  /** Sent messages, newest last, capped at MAX_MESSAGE_HISTORY. */
  messageHistory: string[]
  /** Unsent composer text keyed by thread id. */
  threadDrafts: Record<string, string>
  setThinkingLevel: (level: ThinkingLevel) => void
  setMessageHistory: (history: string[]) => void
  setThreadDraft: (threadId: string, draft: string) => void
  clearThreadDraft: (threadId: string) => void
}

export const useComposerPrefsStore = create<ComposerPrefsState>()(
  persist(
    (set) => ({
      thinkingLevel: DEFAULT_THINKING_LEVEL,
      messageHistory: [],
      threadDrafts: {},
      setThinkingLevel: (level) => set({ thinkingLevel: level }),
      setMessageHistory: (history) =>
        set({ messageHistory: history.slice(-MAX_MESSAGE_HISTORY) }),
      setThreadDraft: (threadId, draft) =>
        set((state) => {
          const next = { ...state.threadDrafts }
          if (draft) {
            next[threadId] = draft
            const entries = Object.entries(next)
            if (entries.length > MAX_THREAD_DRAFTS) {
              return {
                threadDrafts: Object.fromEntries(
                  entries.slice(entries.length - MAX_THREAD_DRAFTS)
                ),
              }
            }
          } else {
            delete next[threadId]
          }
          return { threadDrafts: next }
        }),
      clearThreadDraft: (threadId) =>
        set((state) => {
          if (!(threadId in state.threadDrafts)) return state
          const next = { ...state.threadDrafts }
          delete next[threadId]
          return { threadDrafts: next }
        }),
    }),
    {
      name: "chat:composer-prefs",
      storage: createJSONStorage(() => localStorage),
      // Guard against corrupt/old persisted values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ComposerPrefsState>
        const thinkingLevel = THINKING_LEVELS.includes(
          p.thinkingLevel as ThinkingLevel
        )
          ? (p.thinkingLevel as ThinkingLevel)
          : DEFAULT_THINKING_LEVEL
        const messageHistory = Array.isArray(p.messageHistory)
          ? p.messageHistory.filter((v): v is string => typeof v === "string")
          : []
        const threadDrafts =
          p.threadDrafts && typeof p.threadDrafts === "object"
            ? Object.fromEntries(
                Object.entries(p.threadDrafts)
                  .filter(
                    (entry): entry is [string, string] =>
                      typeof entry[0] === "string" &&
                      typeof entry[1] === "string"
                  )
                  .slice(-MAX_THREAD_DRAFTS)
              )
            : {}
        return { ...current, thinkingLevel, messageHistory, threadDrafts }
      },
    }
  )
)

export function readThreadDraft(threadId: string): string {
  return useComposerPrefsStore.getState().threadDrafts[threadId] ?? ""
}

export function writeThreadDraft(threadId: string, draft: string): void {
  useComposerPrefsStore.getState().setThreadDraft(threadId, draft)
}

export function clearThreadDraft(threadId: string): void {
  useComposerPrefsStore.getState().clearThreadDraft(threadId)
}
