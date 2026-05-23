export { ChatView } from "./components/chat-view"
export { NewThreadView } from "./components/new-thread-view"
export { useChatStream } from "./use-chat-stream"
export {
  useThreadStatus,
  useSetThreadStatus,
  useSetActiveThreadId,
  initThreadStatusWebSocket,
} from "./thread-status-store"
export type { ThreadStatus } from "./thread-status-store"
export { ErrorToastProvider, useErrorToast } from "./contexts/error-toast-context"
export { useApiErrorToasts } from "./hooks/use-api-error-toasts"
// Queries
export { chatKeys, messagesQueryKey, type WorkspaceEntry } from "./queries"
// Core hooks
export {
  useSessionStream,
  useVisibleMessages,
  useScrollMeta,
} from "./hooks"
export type { PendingError } from "./hooks/use-scroll-meta"
export type {
  UseSessionStreamOptions,
} from "./hooks/use-session-stream"
export type { UseVisibleMessagesOptions } from "./hooks/use-visible-messages"
// Sync engine
export {
  getChatSyncEngine,
  useChatSyncEngine,
  loadThreadFromStorage,
  clearThreadFromStorage,
  getAllStoredThreadIds,
} from "./hooks/use-chat-sync-engine"
export type {
  AssistantMessage,
  Message,
  ToolMessage,
  ErrorMessage,
} from "./types"
