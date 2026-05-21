import { createContext, useContext, type ReactNode } from "react"

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
}

const ChatActionsContext = createContext<ChatActions | null>(null)

export function ChatActionsProvider({
  value,
  children,
}: {
  value: ChatActions
  children: ReactNode
}) {
  return (
    <ChatActionsContext.Provider value={value}>
      {children}
    </ChatActionsContext.Provider>
  )
}

export function useChatActions(): ChatActions | null {
  return useContext(ChatActionsContext)
}
