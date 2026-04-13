import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { SparklesIcon, StopCircleIcon } from "lucide-react"

import { ChatTextbox, type ChatTextboxHandle } from "./chat-textbox"
import { MessageRow, estimateMessageSize, getMessageKey } from "./message-row"
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
  createAssistantMessage,
  type Message,
  type ToolMessage,
} from "../types"

// Persists scroll positions across thread switches (survives remounts, cleared on page reload)
const threadScrollPositions = new Map<string, number>()
const VIRTUAL_OVERSCAN_PX = 600

function MeasuredMessageRow({
  messageKey,
  onHeightChange,
  children,
}: {
  messageKey: string
  onHeightChange: (messageKey: string, height: number) => void
  children: ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = rowRef.current
    if (!row) return

    const measure = () => {
      onHeightChange(messageKey, Math.ceil(row.getBoundingClientRect().height))
    }

    measure()

    const observer = new ResizeObserver(() => {
      measure()
    })

    observer.observe(row)

    return () => observer.disconnect()
  }, [messageKey, onHeightChange])

  return (
    <div ref={rowRef} className="pb-3">
      {children}
    </div>
  )
}

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

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
}

export function ChatView({ sessionId, workspaceId, threadId }: ChatViewProps) {
  const queryClient = useQueryClient()
  const showThinkingSetting = useShowThinkingSetting()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const stoppedKey = `lambda-code:stopped:${threadId}`
  const [isStopped, setIsStopped] = useState(
    () => localStorage.getItem(stoppedKey) === "1"
  )
  const [isCompacting, setIsCompacting] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    localStorage.getItem(`lambda-code:threadModel:${threadId}`)
  )
  const [scrollTop, setScrollTop] = useState(
    () => threadScrollPositions.get(threadId) ?? 0
  )
  const [viewportHeight, setViewportHeight] = useState(0)
  const [measuredRowHeights, setMeasuredRowHeights] = useState<
    Record<string, number>
  >({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const hasTitledRef = useRef(false)
  const initialMessagesRef = useRef<Message[]>([])
  const latestVisibleMessagesRef = useRef<Message[]>([])
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)

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
  }, [messagesData])

  useEffect(() => {
    if (messages !== null) return
    latestVisibleMessagesRef.current = messagesData ?? []
  }, [messages, messagesData])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight)
    }

    updateViewportHeight()

    const observer = new ResizeObserver(() => {
      updateViewportHeight()
    })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

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
  const {
    startIndex: visibleStartIndex,
    endIndex: visibleEndIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  } = useMemo(() => {
    const count = visibleMessages.length
    if (count === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    const rowHeights = visibleMessages.map((message, index) => {
      const messageKey = messageKeys[index]
      return messageKey
        ? (measuredRowHeights[messageKey] ?? estimateMessageSize(message))
        : estimateMessageSize(message)
    })

    const rowOffsets: number[] = []
    let totalHeight = 0
    for (const rowHeight of rowHeights) {
      rowOffsets.push(totalHeight)
      totalHeight += rowHeight
    }

    const minVisibleY = Math.max(scrollTop - VIRTUAL_OVERSCAN_PX, 0)
    const maxVisibleY =
      scrollTop + Math.max(viewportHeight, 1) + VIRTUAL_OVERSCAN_PX

    let startIndex = 0
    while (
      startIndex < count &&
      rowOffsets[startIndex] + rowHeights[startIndex] < minVisibleY
    ) {
      startIndex += 1
    }

    let endIndex = startIndex
    while (endIndex < count && rowOffsets[endIndex] < maxVisibleY) {
      endIndex += 1
    }

    if (endIndex === startIndex) {
      endIndex = Math.min(count, startIndex + 1)
    }

    const topSpacerHeight = startIndex > 0 ? rowOffsets[startIndex] : 0
    const bottomSpacerHeight =
      endIndex < count ? Math.max(totalHeight - rowOffsets[endIndex], 0) : 0

    return {
      startIndex,
      endIndex,
      topSpacerHeight,
      bottomSpacerHeight,
    }
  }, [
    messageKeys,
    measuredRowHeights,
    scrollTop,
    viewportHeight,
    visibleMessages,
  ])

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
        setScrollTop(saved)
      } else {
        // First visit to this thread — start pinned at the bottom
        el.scrollTop = el.scrollHeight
        setScrollTop(el.scrollTop)
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
        setScrollTop(el.scrollTop)
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [isLoading, visibleMessages])

  const handleMeasuredRow = useCallback(
    (messageKey: string, height: number) => {
      setMeasuredRowHeights((current) => {
        if (current[messageKey] === height) return current

        return {
          ...current,
          [messageKey]: height,
        }
      })
    },
    []
  )

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 80
    threadScrollPositions.set(threadId, el.scrollTop)
    setScrollTop((current) =>
      current === el.scrollTop ? current : el.scrollTop
    )
  }, [threadId])

  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModelId(id)
      localStorage.setItem(`lambda-code:threadModel:${threadId}`, id)
    },
    [threadId]
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
    localStorage.setItem(stoppedKey, "1")
  }, [abortSessionMutation, stoppedKey])

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
      localStorage.removeItem(stoppedKey)
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
      stoppedKey,
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
              {topSpacerHeight > 0 && (
                <div style={{ height: `${topSpacerHeight}px` }} />
              )}

              {visibleMessages
                .slice(visibleStartIndex, visibleEndIndex)
                .map((message, offsetIndex) => {
                  const index = visibleStartIndex + offsetIndex
                  const messageKey = messageKeys[index]
                  if (!messageKey) return null

                  return (
                    <MeasuredMessageRow
                      key={messageKey}
                      messageKey={messageKey}
                      onHeightChange={handleMeasuredRow}
                    >
                      <MessageRow
                        message={message}
                        commandsByName={commandsByName}
                        showThinking={showThinkingSetting}
                      />
                    </MeasuredMessageRow>
                  )
                })}

              {bottomSpacerHeight > 0 && (
                <div style={{ height: `${bottomSpacerHeight}px` }} />
              )}
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
