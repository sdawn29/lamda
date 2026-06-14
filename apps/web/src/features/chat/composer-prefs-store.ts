/**
 * Composer Preferences Store
 *
 * Durable, cross-thread chat composer state: the last-picked thinking level and
 * a shell-style history of sent messages (recalled with ArrowUp/ArrowDown).
 * Persisted to localStorage via zustand's `persist` middleware.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { ThinkingLevel } from "./components/thinking-combobox"

const THINKING_LEVELS: readonly ThinkingLevel[] = ["low", "medium", "high", "xhigh"]
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium"
export const MAX_MESSAGE_HISTORY = 100

interface ComposerPrefsState {
  thinkingLevel: ThinkingLevel
  /** Sent messages, newest last, capped at MAX_MESSAGE_HISTORY. */
  messageHistory: string[]
  setThinkingLevel: (level: ThinkingLevel) => void
  setMessageHistory: (history: string[]) => void
}

export const useComposerPrefsStore = create<ComposerPrefsState>()(
  persist(
    (set) => ({
      thinkingLevel: DEFAULT_THINKING_LEVEL,
      messageHistory: [],
      setThinkingLevel: (level) => set({ thinkingLevel: level }),
      setMessageHistory: (history) =>
        set({ messageHistory: history.slice(-MAX_MESSAGE_HISTORY) }),
    }),
    {
      name: "chat:composer-prefs",
      storage: createJSONStorage(() => localStorage),
      // Guard against corrupt/old persisted values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ComposerPrefsState>
        const thinkingLevel = THINKING_LEVELS.includes(p.thinkingLevel as ThinkingLevel)
          ? (p.thinkingLevel as ThinkingLevel)
          : DEFAULT_THINKING_LEVEL
        const messageHistory = Array.isArray(p.messageHistory)
          ? p.messageHistory.filter((v): v is string => typeof v === "string")
          : []
        return { ...current, thinkingLevel, messageHistory }
      },
    }
  )
)
