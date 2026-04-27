import { useState, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ErrorMessage, Message } from "../types"
import {
  SparklesIcon,
  ArrowDownIcon,
  Code2Icon,
  BugIcon,
  TestTubeIcon,
  PlugZapIcon,
} from "lucide-react"

import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
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
import { Badge } from "@/shared/ui/badge"
import { useWorkspace } from "@/features/workspace"
import { useSlashCommands, useSessionStats, chatKeys } from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import { useAbortSession, useGenerateTitle, useSendPrompt } from "../mutations"
import { useModels } from "../queries"
import { useConfigureProvider } from "@/features/settings"
import { ThinkingIndicator } from "./thinking-indicator"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadModel,
  useUpdateThreadStopped,
} from "@/features/workspace/mutations"
import { useChatStream } from "../use-chat-stream"
import { useApiErrorToasts } from "../hooks/use-api-error-toasts"
import { getChatSyncEngine } from "../hooks/use-chat-sync-engine"
import { useFileChangeInvalidation } from "../hooks/use-file-change-invalidation"
import { FileChangesCard } from "./file-changes-card"

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
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()
  const showThinkingSetting = useShowThinkingSetting()
  const { data: models, isLoading: modelsLoading } = useModels()
  const { openConfigure } = useConfigureProvider()
  const noProvider = !modelsLoading && !models?.models?.length

  const {
    visibleMessages,
    hasConversationHistory,
    isLoading,
    isCompacting,
    startUserPrompt,
    markStopped,
    markSendFailed,
  } = useChatStream({
    sessionId,
    threadId,
    initialIsStopped,
  })

  // Separate error messages (show as toasts) from other messages
  const apiErrors: ErrorMessage[] = []
  const chatMessages: Message[] = []
  for (const msg of visibleMessages) {
    if (msg.role === "error") {
      apiErrors.push(msg as ErrorMessage)
    } else {
      chatMessages.push(msg)
    }
  }

  const apiErrorIds = new Set(apiErrors.map((e) => e.id))
  useApiErrorToasts({ visibleErrorIds: apiErrorIds, errors: apiErrors })

  const [gitError, setGitError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialModelId
  )
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadStopped = useUpdateThreadStopped()
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

  // ── Session stats ─────────────────────────────────────────────────────────────
  // Fetch detailed token stats from the server
  const { data: sessionStats } = useSessionStats(sessionId)

  // Watch for file-modifying tool completions and refresh UI
  useFileChangeInvalidation(sessionId)

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  // During streaming, smooth scrolling is called on every delta and the browser
  // interrupts each animation before it finishes, causing the view to lag behind
  // the final content. Rapid smooth-scroll calls also fire onScroll mid-animation,
  // which can flip pinnedRef to false and stop further scrolls entirely.
  // Fix: use instant scrollTop assignment while loading so every update reliably
  // lands at the bottom; only use smooth scroll once the stream is stable.
  const commandsByName = new Map((commandsData ?? []).map((command) => [command.name, command]))

  // ── Scroll position persistence via query cache & localStorage ──────────────────
  // Scroll positions are stored in both TanStack Query cache and localStorage.
  // localStorage persists across garbage collection and page reloads.
  const saveScrollPosition = useCallback(
    (scrollTop: number) => {
      const meta = {
        scrollTop,
        isPinned: pinnedRef.current,
        visited: true,
      }
      // Save to query cache
      queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
      // Also persist to localStorage for cross-session persistence
      syncEngine.saveScrollMeta(sessionId, meta)
    },
    [queryClient, sessionId, syncEngine]
  )

  // ── Restore scroll position or scroll to bottom on thread change ──────────────
  // If the thread has been visited before and has a saved position, restore it.
  // Otherwise, scroll to bottom (new thread behavior).
  useEffect(() => {
    initialScrollDoneRef.current = false
    pinnedRef.current = true

    const frame = requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (!el) return

      // Update scroll button visibility inside RAF callback to avoid sync setState in effect
      setShowScrollButton(false)

      // Check if this thread has been visited before
      // First check query cache, then localStorage
      let savedMeta = queryClient.getQueryData<{ scrollTop: number; isPinned: boolean; visited?: boolean }>(
        chatKeys.scroll(sessionId)
      )

      // If not in cache, check localStorage (persisted across sessions)
      if (!savedMeta?.visited) {
        const localMeta = syncEngine.getScrollMeta(sessionId)
        if (localMeta) {
          savedMeta = localMeta
        }
      }

      if (savedMeta?.visited) {
        // Restore previous scroll position
        el.scrollTop = savedMeta.scrollTop
        pinnedRef.current = savedMeta.isPinned
      } else {
        // New thread - scroll to bottom and mark as visited
        el.scrollTop = el.scrollHeight
        // Mark as visited so next time we restore this position
        const visitedMeta = {
          scrollTop: el.scrollTop,
          isPinned: pinnedRef.current,
          visited: true,
        }
        queryClient.setQueryData(chatKeys.scroll(sessionId), visitedMeta)
        syncEngine.saveScrollMeta(sessionId, visitedMeta)
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [threadId, sessionId, queryClient, syncEngine])

  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      // Always use instant scrollTop assignment for reliability.
      // scrollIntoView with smooth behavior can be interrupted by DOM
      // updates mid-animation, leaving the view short of the true bottom.
      el.scrollTop = el.scrollHeight
    })

    return () => cancelAnimationFrame(frame)
  }, [isLoading, visibleMessages])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 80
    setShowScrollButton(distanceFromBottom >= 80)
    saveScrollPosition(el.scrollTop)
  }, [saveScrollPosition])

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    pinnedRef.current = true
  }, [])

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

  useShortcutHandler(SHORTCUT_ACTIONS.FOCUS_CHAT, () => {
    chatTextboxRef.current?.focus()
  })
  useShortcutHandler(
    SHORTCUT_ACTIONS.STOP_GENERATION,
    isLoading ? handleStop : null
  )
  useShortcutHandler(SHORTCUT_ACTIONS.SCROLL_TO_BOTTOM, scrollToBottom)

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
      startUserPrompt(text, thinkingLevel)
      
      // Scroll immediately when sending
      const el = scrollContainerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
      
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

      <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
        {noProvider && (
          <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
            <PlugZapIcon className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="min-w-0 flex-1 text-xs text-amber-600 dark:text-amber-400">
              No model provider configured. Add an API key or sign in to start
              chatting.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-amber-500/30 text-xs hover:bg-amber-500/10"
              onClick={() => openConfigure("subscriptions")}
            >
              Configure provider
            </Button>
          </div>
        )}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex w-full flex-1 flex-col overflow-y-auto pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleMessages.length === 0 && !isLoading && (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 px-6 text-center select-none">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-border/40 bg-muted/50 shadow-sm">
                  <span className="text-3xl leading-none font-light text-muted-foreground/40 select-none">
                    λ
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-foreground/80">
                    How can I help?
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Use{" "}
                    <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
                      @
                    </kbd>{" "}
                    for files and{" "}
                    <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
                      /
                    </kbd>{" "}
                    for commands
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  { icon: Code2Icon, text: "Explain this codebase" },
                  { icon: BugIcon, text: "Find and fix bugs" },
                  { icon: TestTubeIcon, text: "Write tests" },
                ].map(({ icon: Icon, text: prompt }) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => chatTextboxRef.current?.setValue(prompt)}
                    className="h-auto gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {chatMessages.length > 0 && (
            <div className="mx-auto w-full max-w-3xl px-6">
              {chatMessages.map((message, index) => {
                if (
                  message.role === "assistant" &&
                  !message.content.trim() &&
                  !message.thinking.trim() &&
                  !message.errorMessage
                )
                  return null
                return (
                  <div key={getMessageKey(message, index)} className="pb-3">
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
          <div className="mx-auto w-full max-w-3xl px-6">
            {isLoading && <ThinkingIndicator className="py-0.5" />}
            {isCompacting && (
              <div className="flex animate-in duration-200 fade-in-0">
                <Badge variant="secondary" className="gap-1">
                  <SparklesIcon />
                  Compacting context…
                </Badge>
              </div>
            )}
          </div>

          {/* File changes card - shown after chat completion */}
          {!isLoading && chatMessages.length > 0 && (
            <FileChangesCard sessionId={sessionId} />
          )}
        </div>

        {showScrollButton && (
          <div className="pointer-events-none absolute inset-x-0 bottom-40 z-10 flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              onClick={scrollToBottom}
              className="pointer-events-auto rounded-full shadow-md"
            >
              <ArrowDownIcon className="h-4 w-4" /> Scroll to bottom
            </Button>
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl shrink-0 bg-background px-6 py-2">
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
            workspaceId={workspaceId}
            selectedModelId={selectedModelId}
            onModelChange={handleModelChange}
            sessionStats={sessionStats}
          />
        </div>
      </div>
    </>
  )
}