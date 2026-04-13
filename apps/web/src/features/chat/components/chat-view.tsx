import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { SparklesIcon, StopCircleIcon } from "lucide-react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox, type ChatTextboxHandle } from "./chat-textbox"
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
import { ToolCallBlock } from "./tool-call-block"
import { markdownComponents } from "./markdown-components"
import { CopyButton } from "@/shared/components/copy-button"
import { UserMessageContent } from "./user-message"
import { ThinkingIndicator } from "./thinking-indicator"
import { ThinkingBlock } from "./thinking-block"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  createAssistantMessage,
  type AssistantMessage,
  type Message,
  type ToolMessage,
} from "../types"

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

function assistantCopyText(
  message: AssistantMessage,
  includeThinking: boolean
): string {
  const sections: string[] = []

  if (includeThinking && message.thinking.trim()) {
    sections.push(
      message.content.trim()
        ? `Thinking\n${message.thinking.trim()}`
        : message.thinking.trim()
    )
  }

  if (message.content.trim()) {
    sections.push(message.content.trim())
  }

  return sections.join("\n\n")
}

function AssistantMessageBlock({
  message,
  showThinking,
}: {
  message: AssistantMessage
  showThinking: boolean
}) {
  const hasThinking = showThinking && message.thinking.trim().length > 0
  const hasContent = message.content.length > 0

  if (!hasThinking && !hasContent) return null

  return (
    <div className="group flex animate-in flex-col gap-2 duration-300 fade-in-0 slide-in-from-bottom-1">
      {hasThinking && <ThinkingBlock thinking={message.thinking} />}

      {hasContent && (
        <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </Markdown>
        </div>
      )}

      <div>
        <CopyButton text={assistantCopyText(message, showThinking)} />
      </div>
    </div>
  )
}

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
}

export const ChatView = memo(function ChatView({
  sessionId,
  workspaceId,
  threadId,
}: ChatViewProps) {
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

  // ── Restore scroll position on mount ─────────────────────────────────────────
  // Wait for messages to be available before restoring so scroll heights are correct.
  useEffect(() => {
    if (initialScrollDoneRef.current) return
    if (!messagesData) return

    initialScrollDoneRef.current = true
    const saved = threadScrollPositions.get(threadId)

    requestAnimationFrame(() => {
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
  }, [messagesData, threadId])

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

  const commandsByName = useMemo(
    () =>
      new Map((commandsData ?? []).map((command) => [command.name, command])),
    [commandsData]
  )

  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    if (isLoading) {
      el.scrollTop = el.scrollHeight
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [visibleMessages, isLoading])

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
          className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-6 pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          {visibleMessages.map((msg, i) => {
            const key =
              msg.role === "tool" ? msg.toolCallId : `${msg.role}-${i}`
            if (msg.role === "tool") {
              return <ToolCallBlock key={key} msg={msg} />
            }
            if (msg.role === "user") {
              return (
                <div
                  key={key}
                  className="group flex animate-in flex-col items-end gap-1.5 self-end duration-200 fade-in-0 slide-in-from-bottom-2"
                >
                  <div
                    className="rounded-xl bg-muted px-4 py-2 text-sm"
                    data-selectable
                  >
                    <UserMessageContent
                      content={msg.content}
                      commandsByName={commandsByName}
                    />
                  </div>
                  <CopyButton text={msg.content} />
                </div>
              )
            }
            return (
              <AssistantMessageBlock
                key={key}
                message={msg}
                showThinking={showThinkingSetting}
              />
            )
          })}
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
})
