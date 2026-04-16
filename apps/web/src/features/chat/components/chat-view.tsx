import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SparklesIcon, StopCircleIcon } from "lucide-react"

import { ChatTextbox, type ChatTextboxHandle } from "./chat-textbox"
import { MessageRow, getMessageKey } from "./message-row"
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
import { useSlashCommands } from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import { useAbortSession, useGenerateTitle, useSendPrompt } from "../mutations"
import { ThinkingIndicator } from "./thinking-indicator"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadModel,
  useUpdateThreadStopped,
} from "@/features/workspace/mutations"
import { useChatStream } from "../use-chat-stream"

// Persists scroll positions across thread switches (survives remounts, cleared on page reload)
const threadScrollPositions = new Map<string, number>()

interface ChatViewProps {
  sessionId: string
  workspaceId: string
  threadId: string
  initialModelId: string | null
  initialIsStopped: boolean
}

export function ChatView({
  sessionId,
  workspaceId,
  threadId,
  initialModelId,
  initialIsStopped,
}: ChatViewProps) {
  const showThinkingSetting = useShowThinkingSetting()
  const {
    visibleMessages,
    hasConversationHistory,
    hasLoadedMessages,
    isLoading,
    isStopped,
    isCompacting,
    startUserPrompt,
    markStopped,
    markSendFailed,
  } = useChatStream({
    sessionId,
    threadId,
    initialIsStopped,
  })
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialModelId
  )
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadStopped = useUpdateThreadStopped()
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)

  const { setThreadTitle } = useWorkspace()

  // ── Queries ───────────────────────────────────────────────────────────────────
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

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  // During streaming, smooth scrolling is called on every delta and the browser
  // interrupts each animation before it finishes, causing the view to lag behind
  // the final content. Rapid smooth-scroll calls also fire onScroll mid-animation,
  // which can flip pinnedRef to false and stop further scrolls entirely.
  // Fix: use instant scrollTop assignment while loading so every update reliably
  // lands at the bottom; only use smooth scroll once the stream is stable.
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
    if (!hasLoadedMessages && visibleMessages.length === 0) return

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
  }, [hasLoadedMessages, threadId, visibleMessages.length])

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
    markStopped()
    updateThreadStopped.mutate({ threadId, stopped: true })
  }, [abortSessionMutation, markStopped, threadId, updateThreadStopped])

  const handleSend = useCallback(
    (
      text: string,
      modelId: string,
      provider: string,
      thinkingLevel?: string
    ) => {
      if (!hasConversationHistory) {
        generateTitleMutation.mutate(text, {
          onSuccess: ({ title }) =>
            setThreadTitle(workspaceId, threadId, title),
        })
      }
      pinnedRef.current = true
      updateThreadStopped.mutate({ threadId, stopped: false })
      startUserPrompt(text)
      const model = modelId && provider ? { provider, modelId } : undefined
      sendPromptMutation.mutate(
        { text, model, thinkingLevel },
        { onError: markSendFailed }
      )
    },
    [
      hasConversationHistory,
      markSendFailed,
      sendPromptMutation,
      generateTitleMutation,
      startUserPrompt,
      workspaceId,
      threadId,
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
