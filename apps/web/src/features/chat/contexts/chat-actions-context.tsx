import { useEffect, type ReactNode } from "react"
import { create } from "zustand"
import type { FileCommentContext } from "../lib/file-context"

/**
 * Imperative chat-scope actions used by deep components (e.g. tool-call blocks,
 * plan cards) that can't easily receive these via props. Provided by chat-view
 * because it owns the textbox ref, mode state, and workspace path.
 */
export interface ChatActions {
  /** Open a file in the main-tabs viewer (focuses if already open). */
  openFile: (filePath: string, title?: string) => void
  /**
   * Switch the thread to Code mode and seed the chat input with an
   * "Implement the plan in <relativePath>" prompt. The user can edit or send.
   */
  implementPlan: (relativePath: string) => void
  /** Add a file-line comment token to the current chat textbox. */
  addFileCommentContext: (context: FileCommentContext) => void
}

interface ChatActionsStore {
  initialized: boolean
  actions: ChatActions | null
  setInitialized: (value: boolean) => void
  setActions: (value: ChatActions | null) => void
}

const useChatActionsStore = create<ChatActionsStore>((set) => ({
  initialized: false,
  actions: null,
  setInitialized: (value) => set({ initialized: value }),
  setActions: (value) => set({ actions: value }),
}))

export function ChatActionsProvider({
  value,
  children,
}: {
  value: ChatActions
  children: ReactNode
}) {
  const setInitialized = useChatActionsStore((state) => state.setInitialized)
  const setActions = useChatActionsStore((state) => state.setActions)

  useEffect(() => {
    setInitialized(true)
    return () => {
      setActions(null)
      setInitialized(false)
    }
  }, [setActions, setInitialized])

  useEffect(() => {
    setActions(value)
  }, [setActions, value])

  return <>{children}</>
}

export function useChatActions(): ChatActions | null {
  const initialized = useChatActionsStore((state) => state.initialized)
  const actions = useChatActionsStore((state) => state.actions)
  if (!initialized) return null
  return actions
}
