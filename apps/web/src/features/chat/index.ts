export { ChatView } from "./components/chat-view"
export { useChatStream } from "./use-chat-stream"
export { ThreadStatusProvider, useThreadStatus, useSetThreadStatus } from "./thread-status-context"
export type { ThreadStatus } from "./thread-status-context"
export { useGlobalThreadStatusWatcher } from "./use-global-thread-status-watcher"
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