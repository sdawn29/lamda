import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { SparklesIcon, StopCircleIcon } from "lucide-react"

import { ChatTextbox, type ChatTextboxHandle } from "./chat-textbox"
import { MessageRow, getMessageKey } from "./message-row"
import { openSessionEventSource } from "../api"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"
import { useWorkspace } from "@/features/workspace"
import { messagesQueryKey, useMessages, useSlashCommands } from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import { useAbortSession, useGenerateTitle, useSendPrompt } from "../mutations"
import {
  subscribeToSessionEvents,
  type AgentEndMessage,
} from "../session-events"
import { ThinkingIndicator } from "./thinking-indicator"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadModel,
  useUpdateThreadStopped,
} from "@/features/workspace/mutations"
import {
  createAssistantMessage,
  type Message,
  type ToolMessage,
} from "../types"
import { useSetThreadStatus, useThreadStatus } from "../thread-status-context"

// Persists scroll positions across thread switches (survives remounts, cleared on page reload)
const threadScrollPositions = new Map<string, number>()

function upsertToolMessage(
  prev: Message[],
  toolCallId: string,
  updater: (existing?: ToolMessage) => ToolMessage
): Message[] {
  const index = prev.findIndex(
    (msg) => msg.role === "tool" && msg.toolCallId === toolCallId
  )

  if (index === -1) return [...prev, updater()]

  const next = [...prev]
  next[index] = updater(prev[index] as ToolMessage)
  return next
}

function finalizeRunningTools(
  prev: Message[],
  runMessages: AgentEndMessage[]
): Message[] {
  const toolResults = new Map(
    runMessages
      .filter(
        (
          message
        ): message is Extract<AgentEndMessage, { role: "toolResult" }> =>
          message.role === "toolResult"
      )
      .map((message) => [message.toolCallId, message] as const)
  )

  const assistantFailure = [...runMessages]
    .reverse()
    .find(
      (message): message is Extract<AgentEndMessage, { role: "assistant" }> =>
        message.role === "assistant" &&
        (message.stopReason === "aborted" || message.stopReason === "error")
    )

  const fallbackError = assistantFailure?.errorMessage
    ? assistantFailure.errorMessage
    : assistantFailure?.stopReason === "aborted"
      ? "Operation aborted"
      : "Tool execution ended without a final result."

  return prev.map((msg) => {
    if (msg.role !== "tool" || msg.status !== "running") return msg

    const toolResult = toolResults.get(msg.toolCallId)
    if (toolResult) {
      return {
        ...msg,
        toolName: toolResult.toolName || msg.toolName,
        status: toolResult.isError ? "error" : "done",
        result: {
          content: toolResult.content,
          details: toolResult.details,
        },
      }
    }

    return {
      ...msg,
      status: "error",
      result: msg.result ?? {
        content: [{ type: "text", text: fallbackError }],
      },
    }
  })
}

function resolveMessages(
  prev: Message[] | null,
  initialMessages: Message[]
): Message[] {
  return prev ?? initialMessages
}

function areMessagesEqual(left: Message, right: Message): boolean {
  if (left.role === "user" && right.role === "user") {
    return left.content === right.content
  }

  if (left.role === "assistant" && right.role === "assistant") {
    return (
      left.content === right.content &&
      left.thinking === right.thinking
    )
  }

  if (left.role === "tool" && right.role === "tool") {
    return (
    left.toolCallId === right.toolCallId &&
    left.toolName === right.toolName &&
    left.status === right.status &&
    JSON.stringify(left.args) === JSON.stringify(right.args) &&
    JSON.stringify(left.result) === JSON.stringify(right.result)
    )
  }

  return false
}

function haveSameMessages(left: Message[], right: Message[]): boolean {
  if (left.length !== right.length) return false

  return left.every((message, index) =>
    areMessagesEqual(message, right[index])
  )
}

function getMessageOverlapLength(
  persistedMessages: Message[],
  currentMessages: Message[]
): number {
  const maxOverlap = Math.min(
    persistedMessages.length,
    currentMessages.length
  )

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matches = true

    for (let index = 0; index < overlap; index += 1) {
      const persistedMessage =
        persistedMessages[persistedMessages.length - overlap + index]
      const currentMessage = currentMessages[index]

      if (!areMessagesEqual(persistedMessage, currentMessage)) {
        matches = false
        break
      }
    }

    if (matches) {
      return overlap
    }
  }

  return 0
}

function mergePersistedMessages(
  persistedMessages: Message[],
  currentMessages: Message[]
): Message[] {
  if (persistedMessages.length === 0) return currentMessages
  if (currentMessages.length === 0) return persistedMessages

  const overlap = getMessageOverlapLength(
    persistedMessages,
    currentMessages
  )

  return [
    ...persistedMessages,
    ...currentMessages.slice(overlap),
  ]
}

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
  initialModelId: string | null
  initialIsStopped: boolean
}

export function ChatView({ sessionId, workspaceId, threadId, initialModelId, initialIsStopped }: ChatViewProps) {
  const queryClient = useQueryClient()
  const showThinkingSetting = useShowThinkingSetting()
  const setThreadStatus = useSetThreadStatus()
  const persistedThreadStatus = useThreadStatus(threadId)
  const cachedMessages =
    queryClient.getQueryData<Message[]>(messagesQueryKey(sessionId)) ?? []
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [isLoading, setIsLoading] = useState(persistedThreadStatus === "running")
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(initialModelId)
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadStopped = useUpdateThreadStopped()
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const hasTitledRef = useRef(cachedMessages.length > 0)
  const initialMessagesRef = useRef<Message[]>(cachedMessages)
  const latestVisibleMessagesRef = useRef<Message[]>(cachedMessages)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)

  useEffect(() => {
    setThreadStatus(threadId, isLoading ? "running" : "idle")
  }, [threadId, isLoading, setThreadStatus])

  const { setThreadTitle } = useWorkspace()

  const applyLocalMessages = useCallback(
    (updater: (currentMessages: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = updater(resolveMessages(prev, initialMessagesRef.current))
        latestVisibleMessagesRef.current = next
        return next
      })
    },
    []
  )

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: messagesData } = useMessages(sessionId)
  const { data: commandsData } = useSlashCommands(sessionId)
  const { data: branchData } = useBranch(sessionId)
  const { data: branchesData } = useBranches(sessionId)

  const branch = branchData?.branch ?? null
  const branches = branchesData?.branches ?? []

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const checkoutBranchMutation = useCheckoutBranch(sessionId)
  const abortSessionMutation = useAbortSession(sessionId)
  const generateTitleMutation = useGenerateTitle()
  const sendPromptMutation = useSendPrompt(sessionId)

  // ── Track the latest persisted messages for local optimistic updates ──────────
  useEffect(() => {
    if (!messagesData) return

    initialMessagesRef.current = messagesData
    hasTitledRef.current = messagesData.length > 0

    setMessages((prev) => {
      if (prev === null) return prev

      const mergedMessages = mergePersistedMessages(messagesData, prev)
      latestVisibleMessagesRef.current = mergedMessages

      return haveSameMessages(prev, mergedMessages)
        ? prev
        : mergedMessages
    })
  }, [messagesData])

  useEffect(() => {
    if (messages !== null) return
    latestVisibleMessagesRef.current = messagesData ?? []
  }, [messages, messagesData])

  // ── SSE event stream ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    let es: EventSource | null = null
    let cleanupListeners: (() => void) | null = null

    openSessionEventSource(sessionId)
      .then((nextEventSource) => {
        if (!active) {
          nextEventSource.close()
          return
        }
        es = nextEventSource
        cleanupListeners = subscribeToSessionEvents(nextEventSource, {
          onMessageStart: (data) => {
            if (!active || data.message?.role !== "assistant") return
            setIsLoading(true)
            applyLocalMessages((prev) => [...prev, createAssistantMessage()])
          },
          onMessageUpdate: (data) => {
            if (!active) return
            const assistantEvent = data.assistantMessageEvent
            if (
              !assistantEvent ||
              typeof assistantEvent.delta !== "string" ||
              (assistantEvent.type !== "text_delta" &&
                assistantEvent.type !== "thinking_delta")
            ) {
              return
            }

            applyLocalMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]

              if (last?.role !== "assistant") {
                next.push(
                  assistantEvent.type === "thinking_delta"
                    ? createAssistantMessage({ thinking: assistantEvent.delta })
                    : createAssistantMessage({ content: assistantEvent.delta })
                )
                return next
              }

              next[next.length - 1] =
                assistantEvent.type === "thinking_delta"
                  ? {
                      ...last,
                      thinking: last.thinking + assistantEvent.delta,
                    }
                  : {
                      ...last,
                      content: last.content + assistantEvent.delta,
                    }

              return next
            })
          },
          onToolExecutionStart: (data) => {
            if (!active) return
            applyLocalMessages((prev) =>
              upsertToolMessage(prev, data.toolCallId, (existing) => ({
                role: "tool",
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
                status: "running",
                result: existing?.result,
              }))
            )
          },
          onToolExecutionUpdate: (data) => {
            if (!active) return
            applyLocalMessages((prev) =>
              upsertToolMessage(prev, data.toolCallId, (existing) => ({
                role: "tool",
                toolCallId: data.toolCallId,
                toolName: data.toolName || existing?.toolName || "tool",
                args: data.args ?? existing?.args ?? {},
                status: "running",
                result: data.partialResult,
              }))
            )
          },
          onToolExecutionEnd: (data) => {
            if (!active) return
            applyLocalMessages((prev) =>
              upsertToolMessage(prev, data.toolCallId, (existing) => ({
                role: "tool",
                toolCallId: data.toolCallId,
                toolName: data.toolName || existing?.toolName || "tool",
                args: existing?.args ?? {},
                status: data.isError ? "error" : "done",
                result: data.result,
              }))
            )
          },
          onAgentEnd: (data) => {
            if (!active) return
            const finalMessages = finalizeRunningTools(
              latestVisibleMessagesRef.current,
              data.messages ?? []
            )
            initialMessagesRef.current = finalMessages
            queryClient.setQueryData(messagesQueryKey(sessionId), finalMessages)
            setMessages(null)
            setIsLoading(false)
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(sessionId),
            })
          },
          onCompactionStart: () => {
            if (!active) return
            setIsCompacting(true)
          },
          onCompactionEnd: () => {
            if (!active) return
            setIsCompacting(false)
          },
          onSdkError: ({ message }) => {
            if (!active) return
            console.error("[session-events]", message)
            const finalMessages = finalizeRunningTools(
              latestVisibleMessagesRef.current,
              [
                {
                  role: "assistant",
                  stopReason: "error",
                  errorMessage: message,
                },
              ]
            )
            initialMessagesRef.current = finalMessages
            queryClient.setQueryData(messagesQueryKey(sessionId), finalMessages)
            setMessages(null)
            setIsLoading(false)
            setIsCompacting(false)
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(sessionId),
            })
          },
          onTransportError: () => {
            if (!active || nextEventSource.readyState !== EventSource.CLOSED) {
              return
            }
            console.error("[session-events] connection closed")
            setIsLoading(false)
            setIsCompacting(false)
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(sessionId),
            })
          },
        })
      })
      .catch((err: unknown) => {
        if (active) {
          console.error("[session-events]", err)
        }
      })

    return () => {
      active = false
      cleanupListeners?.()
      es?.close()
    }
  }, [applyLocalMessages, queryClient, sessionId])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  // During streaming, smooth scrolling is called on every delta and the browser
  // interrupts each animation before it finishes, causing the view to lag behind
  // the final content. Rapid smooth-scroll calls also fire onScroll mid-animation,
  // which can flip pinnedRef to false and stop further scrolls entirely.
  // Fix: use instant scrollTop assignment while loading so every update reliably
  // lands at the bottom; only use smooth scroll once the stream is stable.
  const visibleMessages = useMemo(
    () => messages ?? messagesData ?? [],
    [messages, messagesData]
  )
  const messageKeys = useMemo(
    () => visibleMessages.map(getMessageKey),
    [visibleMessages]
  )

  const commandsByName = useMemo(
    () =>
      new Map((commandsData ?? []).map((command) => [command.name, command])),
    [commandsData]
  )

  // ── Restore scroll position on mount ─────────────────────────────────────────
  // Wait for messages to be available before restoring so scroll heights are correct.
  useEffect(() => {
    if (initialScrollDoneRef.current) return
    if (!messagesData) return

    initialScrollDoneRef.current = true
    const saved = threadScrollPositions.get(threadId)

    const frame = requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (!el) return
      if (saved !== undefined) {
        el.scrollTop = saved
      } else {
        // First visit to this thread — start pinned at the bottom
        el.scrollTop = el.scrollHeight
        pinnedRef.current = true
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [messagesData, threadId])

  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      if (isLoading) {
        el.scrollTop = el.scrollHeight
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [isLoading, visibleMessages])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 80
    threadScrollPositions.set(threadId, el.scrollTop)
  }, [threadId])

  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModelId(id)
      updateThreadModel.mutate({ threadId, modelId: id })
    },
    [threadId, updateThreadModel]
  )

  const handleGitError = useCallback((message: string) => {
    setGitError(message)
  }, [])

  const handleBranchSelect = useCallback(
    (selectedBranch: string) => {
      checkoutBranchMutation.mutate(selectedBranch, {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          const stripped = msg.replace(/^API \d+:\s*/, "")
          try {
            const parsed = JSON.parse(stripped) as { error?: string }
            handleGitError(parsed.error ?? stripped)
          } catch {
            handleGitError(stripped)
          }
        },
      })
    },
    [checkoutBranchMutation, handleGitError]
  )

  const handleStop = useCallback(() => {
    abortSessionMutation.mutate(undefined, {
      onError: (err: unknown) => {
        console.error("[abort]", err)
      },
    })
    setIsLoading(false)
    setIsStopped(true)
    updateThreadStopped.mutate({ threadId, stopped: true })
  }, [abortSessionMutation, threadId, updateThreadStopped])

  const handleSend = useCallback(
    (
      text: string,
      modelId: string,
      provider: string,
      thinkingLevel?: string
    ) => {
      if (!hasTitledRef.current) {
        hasTitledRef.current = true
        generateTitleMutation.mutate(text, {
          onSuccess: ({ title }) =>
            setThreadTitle(workspaceId, threadId, title),
        })
      }
      pinnedRef.current = true
      setIsStopped(false)
      updateThreadStopped.mutate({ threadId, stopped: false })
      applyLocalMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      const model = modelId && provider ? { provider, modelId } : undefined
      sendPromptMutation.mutate(
        { text, model, thinkingLevel },
        { onError: () => setIsLoading(false) }
      )
    },
    [
      sendPromptMutation,
      generateTitleMutation,
      workspaceId,
      threadId,
      applyLocalMessages,
      setThreadTitle,
      updateThreadStopped,
    ]
  )

  return (
    <>
      <AlertDialog
        open={gitError !== null}
        onOpenChange={(open) => {
          if (!open) setGitError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Git Error</AlertDialogTitle>
            <AlertDialogDescription>{gitError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGitError(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-6 pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleMessages.length === 0 && !isLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center select-none">
              <span className="text-6xl font-light text-muted-foreground/20">
                λ
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Start a conversation
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Ask me to write, fix, or explain code
                </p>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {[
                  "Explain this codebase to me",
                  "Find and fix bugs in my code",
                  "Write tests for my functions",
                ].map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => chatTextboxRef.current?.setValue(prompt)}
                    className="h-auto"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {visibleMessages.length > 0 && (
            <div className="w-full">
              {visibleMessages.map((message, index) => {
                const messageKey = messageKeys[index]
                if (!messageKey) return null
                return (
                  <div key={messageKey} className="pb-3">
                    <MessageRow
                      message={message}
                      commandsByName={commandsByName}
                      showThinking={showThinkingSetting}
                    />
                  </div>
                )
              })}
            </div>
          )}
          {isLoading && <ThinkingIndicator className="py-0.5" />}
          {isCompacting && (
            <div className="flex animate-in items-center gap-1.5 self-start text-muted-foreground/60 duration-200 fade-in-0">
              <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">Compacting context…</span>
            </div>
          )}
          {isStopped && !isLoading && (
            <div className="flex animate-in items-center gap-1.5 self-start text-muted-foreground/60 duration-200 fade-in-0">
              <StopCircleIcon className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-xs">Interrupted</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mx-auto w-full max-w-2xl px-6 pb-6">
          <ChatTextbox
            ref={chatTextboxRef}
            onSend={handleSend}
            onStop={handleStop}
            isLoading={isLoading}
            branch={branch}
            branches={branches}
            onBranchSelect={handleBranchSelect}
            onBranchError={handleGitError}
            sessionId={sessionId}
            selectedModelId={selectedModelId}
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    </>
  )
}
