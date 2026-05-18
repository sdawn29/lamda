import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { AssistantMessage, ErrorAction, ErrorMessage, Message, ToolMessage } from "../types"
import { WorkingBlock, type WorkingMessage } from "./working-block"
import {
  ArrowDownIcon,
  Code2Icon,
  BugIcon,
  TestTubeIcon,
  PlugZapIcon,
  Wand2Icon,
  FileSearchIcon,
  GitBranchIcon,
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
import { useSlashCommands, useSessionStats, chatKeys, messagesQueryKey } from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import { useAbortSession, useGenerateTitle, useSendPrompt } from "../mutations"
import { useModels } from "../queries"
import { useConfigureProvider } from "@/features/settings"
import { ThinkingIndicator } from "./thinking-indicator"
import { CompactingIndicator } from "./compacting-indicator"
import { ChatErrorAlert } from "./chat-error-alert"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadModel,
  useUpdateThreadStopped,
  useUpdateThreadTitle,
} from "@/features/workspace/mutations"
import { useWorkspace } from "@/features/workspace"
import { useChatStream } from "../use-chat-stream"
import { getChatSyncEngine } from "../hooks/use-chat-sync-engine"
import { FileChangesCard } from "./file-changes-card"
import { useMainTabs } from "@/features/main-tabs"
import { forkSession, listMessages } from "../api"
import { blocksToMessages, type MessageBlock } from "../types"
import { workspaceKeys } from "@/features/workspace/queries"

const PROMPT_SUGGESTIONS = [
  { icon: Code2Icon, text: "Explain this codebase", description: "Walk me through the project structure and key patterns" },
  { icon: BugIcon, text: "Debug an issue", description: "Describe a bug and let me investigate the root cause" },
  { icon: TestTubeIcon, text: "Write tests", description: "Add unit, integration, or end-to-end test coverage" },
  { icon: Wand2Icon, text: "Refactor code", description: "Improve readability, structure, or performance" },
  { icon: FileSearchIcon, text: "Find something", description: "Locate a function, component, or pattern" },
  { icon: GitBranchIcon, text: "Review changes", description: "Explain recent git changes in plain language" },
] as const

type MessageGroup =
  | { type: "regular"; message: Message; index: number; suppressThinking?: boolean }
  | { type: "working"; messages: WorkingMessage[]; startIndex: number; finalThinking?: string }

function groupChatMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let i = 0
  let suppressNextThinking = false

  const isWorkingEntry = (m: Message): boolean => {
    if (m.role === "tool") return true
    if (m.role === "assistant") {
      return !(m as AssistantMessage).content.trim() && !(m as AssistantMessage).errorMessage
    }
    return false
  }

  while (i < messages.length) {
    const msg = messages[i]
    if (isWorkingEntry(msg)) {
      suppressNextThinking = false
      const workingMsgs: WorkingMessage[] = []
      const startIndex = i
      while (i < messages.length && isWorkingEntry(messages[i])) {
        workingMsgs.push(messages[i] as WorkingMessage)
        i++
      }
      // Pull thinking from the following assistant response into this block
      const nextMsg = i < messages.length ? messages[i] : undefined
      let finalThinking: string | undefined
      if (
        nextMsg?.role === "assistant" &&
        (nextMsg as AssistantMessage).thinking.trim().length > 0
      ) {
        finalThinking = (nextMsg as AssistantMessage).thinking
        suppressNextThinking = true
      }
      groups.push({ type: "working", messages: workingMsgs, startIndex, finalThinking })
    } else {
      const suppress = suppressNextThinking && msg.role === "assistant"
      suppressNextThinking = false

      // If this assistant message has thinking that wasn't already pulled into a
      // preceding working block, create a synthetic working block for it now.
      if (
        !suppress &&
        msg.role === "assistant" &&
        (msg as AssistantMessage).thinking.trim().length > 0
      ) {
        groups.push({ type: "working", messages: [], startIndex: i, finalThinking: (msg as AssistantMessage).thinking })
        groups.push({ type: "regular", message: msg, index: i, suppressThinking: true })
      } else {
        groups.push({ type: "regular", message: msg, index: i, suppressThinking: suppress })
      }
      i++
    }
  }

  return groups
}

// Pending initial inputs keyed by threadId — used to pre-fill the textbox
// after a fork without threading state through route params.
const pendingInitialInputs = new Map<string, string>()

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
  const navigate = useNavigate()
  const syncEngine = getChatSyncEngine()
  const showThinkingSetting = useShowThinkingSetting()
  const { workspaces } = useWorkspace()
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId)
  const rootPath = activeWorkspace?.path
  const openWithAppId = activeWorkspace?.openWithAppId
  const { data: models, isLoading: modelsLoading } = useModels()
  const { openConfigure } = useConfigureProvider()
  const noProvider = !modelsLoading && !models?.models?.length

  const {
    visibleMessages,
    hasConversationHistory,
    isLoading,
    isCompacting,
    compactionReason,
    pendingError,
    startUserPrompt,
    markStopped,
    markSendFailed,
    dismissError,
  } = useChatStream({
    sessionId,
    threadId,
    initialIsStopped,
  })

  const [gitError, setGitError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialModelId
  )
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadStopped = useUpdateThreadStopped()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const isScrollingToBottomRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)
  // Messages present on the first non-empty render (from cache) skip entry animations.
  // Only messages that arrive after the initial snapshot get animate-in treatment.
  // State (not a ref) so it can be safely read during render.
  const [initialSnapshot, setInitialSnapshot] = useState<{ sessionId: string; keys: Set<string> } | null>(null)
  // Tracks the last-rendered session so we can detect switches during render.
  const [localSessionId, setLocalSessionId] = useState(sessionId)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTitleMutation = useUpdateThreadTitle()
  const { confirmThread, addThreadTab } = useMainTabs()

  // React's "adjusting state while rendering" pattern — reset all session-local
  // state in one batched pass when the active session changes, avoiding the
  // setState-inside-effect cascade that React 19 rejects.
  if (localSessionId !== sessionId) {
    setLocalSessionId(sessionId)
    setGitError(null)
    setShowScrollButton(false)
    setSelectedModelId(initialModelId)
  }

  // Capture initial keys for this session as soon as messages are available,
  // also during render so isNewMessage is correct on the very same frame.
  if (
    visibleMessages.length > 0 &&
    (initialSnapshot === null || initialSnapshot.sessionId !== sessionId)
  ) {
    setInitialSnapshot({
      sessionId,
      keys: new Set(visibleMessages.map((m, i) => getMessageKey(m, i))),
    })
  }

  // Focus textbox whenever the active session changes (imperative DOM op — effect is correct here).
  useEffect(() => {
    chatTextboxRef.current?.focus()
  }, [sessionId])

  // Pre-fill input with forked user message (set by handleFork before navigation).
  useEffect(() => {
    const pending = pendingInitialInputs.get(threadId)
    if (pending) {
      pendingInitialInputs.delete(threadId)
      chatTextboxRef.current?.setValue(pending)
    }
  }, [threadId])

  // Flush any pending scroll-to-localStorage write on unmount.
  useEffect(() => {
    return () => {
      if (scrollSaveTimeoutRef.current !== null) {
        clearTimeout(scrollSaveTimeoutRef.current)
      }
    }
  }, [])

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

  const handleErrorAction = useCallback(
    (action: ErrorAction, id: string) => {
      if (action.type === "dismiss") {
        dismissError(id)
      } else if (action.type === "retry" && action.prompt) {
        dismissError(id)
        startUserPrompt(action.prompt, action.thinkingLevel)
        sendPromptMutation.mutate(
          { text: action.prompt, thinkingLevel: action.thinkingLevel },
          { onError: markSendFailed }
        )
      }
    },
    [dismissError, startUserPrompt, sendPromptMutation, markSendFailed]
  )

  // ── Session stats ─────────────────────────────────────────────────────────────
  // Fetch detailed token stats from the server
  const { data: sessionStats } = useSessionStats(sessionId)

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  // During streaming, smooth scrolling is called on every delta and the browser
  // interrupts each animation before it finishes, causing the view to lag behind
  // the final content. Rapid smooth-scroll calls also fire onScroll mid-animation,
  // which can flip pinnedRef to false and stop further scrolls entirely.
  // Fix: use instant scrollTop assignment while loading so every update reliably
  // lands at the bottom; only use smooth scroll once the stream is stable.
  const commandsByName = useMemo(
    () => new Map((commandsData ?? []).map((command) => [command.name, command])),
    [commandsData]
  )

  const groupedMessages = useMemo(
    () => groupChatMessages(visibleMessages),
    [visibleMessages]
  )

  const hasActiveWorkingGroup =
    isLoading &&
    groupedMessages.length > 0 &&
    groupedMessages[groupedMessages.length - 1].type === "working"

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
      // Update in-memory cache immediately (cheap, O(1))
      queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
      // Debounce the synchronous localStorage write (fires 150ms after last scroll)
      if (scrollSaveTimeoutRef.current !== null) {
        clearTimeout(scrollSaveTimeoutRef.current)
      }
      scrollSaveTimeoutRef.current = setTimeout(() => {
        scrollSaveTimeoutRef.current = null
        syncEngine.saveScrollMeta(sessionId, meta)
      }, 150)
    },
    [queryClient, sessionId, syncEngine]
  )

  // ── Restore scroll position or scroll to bottom on thread change ──────────────
  // If the thread has been visited before and has a saved position, restore it.
  // Otherwise, scroll to bottom (new thread behavior).
  // useLayoutEffect runs before the browser paints, so scroll position is
  // applied atomically with the DOM update — no one-frame flash of wrong position.
  useLayoutEffect(() => {
    isScrollingToBottomRef.current = false
    pinnedRef.current = true

    const el = scrollContainerRef.current
    if (!el) return

    // Check if this thread has been visited before
    // First check query cache, then localStorage
    let savedMeta = queryClient.getQueryData<{
      scrollTop: number
      isPinned: boolean
      visited?: boolean
    }>(chatKeys.scroll(sessionId))

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

    // Sync scroll button visibility with the restored position (no setState needed
    // here since pinnedRef drives the auto-scroll effect, not showScrollButton).
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollButton(distanceFromBottom >= 80)
  }, [threadId, sessionId, queryClient, syncEngine])

  // Scroll to bottom synchronously (before paint) whenever loading state or
  // messages change, so there is no 1-frame window where a scroll-anchoring
  // event or other onScroll can flip pinnedRef to false before we act.
  // This runs after the session-restore useLayoutEffect (which appears earlier
  // in the file), so pinnedRef already holds the correct restored value.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [isLoading, visibleMessages])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    if (isScrollingToBottomRef.current) {
      const scrolledUp = el.scrollTop < lastScrollTopRef.current
      lastScrollTopRef.current = el.scrollTop
      if (distanceFromBottom < 10) {
        // Animation reached the bottom — clear the in-flight flag
        isScrollingToBottomRef.current = false
        saveScrollPosition(el.scrollTop)
        return
      }
      if (!scrolledUp) {
        // Still animating downward — skip pinned/button updates to avoid
        // flipping pinnedRef false mid-animation (which would break auto-scroll
        // for any message that arrives before the animation finishes)
        saveScrollPosition(el.scrollTop)
        return
      }
      // User scrolled up to interrupt the animation — clear flag and handle normally
      isScrollingToBottomRef.current = false
    } else {
      lastScrollTopRef.current = el.scrollTop
    }

    pinnedRef.current = distanceFromBottom < 80
    setShowScrollButton(distanceFromBottom >= 80)
    saveScrollPosition(el.scrollTop)
  }, [saveScrollPosition])

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    pinnedRef.current = true
    setShowScrollButton(false)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 10) return  // Already at bottom
    isScrollingToBottomRef.current = true
    lastScrollTopRef.current = el.scrollTop
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
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
      onSuccess: () => {
        markStopped()
        updateThreadStopped.mutate({ threadId, stopped: true })
      },
      onError: (err: unknown) => {
        console.error("[abort]", err)
        toast.error("Failed to stop", {
          description: "Could not stop the agent. It may still be running.",
          duration: 5000,
        })
      },
    })
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
          onSuccess: ({ title }) => {
            updateTitleMutation.mutate({ workspaceId, threadId, title })
            confirmThread(threadId)
          },
          onError: () => confirmThread(threadId),
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
      updateTitleMutation,
      updateThreadStopped,
      confirmThread,
    ]
  )

  const handleFork = useCallback(
    async (blockId: string) => {
      try {
        const { threadId: newThreadId, sessionId: newSessionId, initialInput } = await forkSession(sessionId, blockId)
        const parentTitle = activeWorkspace?.threads.find((t) => t.id === threadId)?.title ?? "Thread"
        addThreadTab(newThreadId, `Fork of ${parentTitle}`)
        // Store the forked user message so the new ChatView can pre-fill the textbox
        if (initialInput) pendingInitialInputs.set(newThreadId, initialInput)
        // Pre-populate the messages cache so the forked thread renders immediately
        try {
          const { blocks } = await listMessages(newSessionId)
          const seededMessages = blocksToMessages(blocks as MessageBlock[])
          queryClient.setQueryData(messagesQueryKey(newSessionId), seededMessages)
        } catch {
          // Non-fatal — the query will fetch on mount
        }
        // Fire-and-forget — the route guards against premature redirect via isTabKnown
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
        navigate({ to: "/workspace/$threadId", params: { threadId: newThreadId } })
      } catch (err) {
        toast.error("Fork failed", {
          description: err instanceof Error ? err.message : "Could not fork conversation",
        })
      }
    },
    [sessionId, queryClient, navigate, addThreadTab, activeWorkspace, threadId]
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
          className="flex w-full flex-1 flex-col overflow-y-auto pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overflow-anchor:none]"
        >
          {visibleMessages.length === 0 && !isLoading && (
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 text-center select-none">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1c1c1e] ring-1 ring-white/5 shadow-md">
                  <span className="font-black text-3xl leading-none" style={{ color: "#d4a017" }}>Λ</span>
                </div>
                <div className="space-y-1.5">
                  <p className="text-lg font-semibold tracking-tight">How can I help?</p>
                  <p className="text-xs text-muted-foreground">
                    Use{" "}
                    <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
                      @
                    </kbd>{" "}
                    for files and{" "}
                    <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
                      /
                    </kbd>{" "}
                    for commands
                  </p>
                </div>
              </div>
              <div className="grid w-full max-w-lg grid-cols-3 gap-2">
                {PROMPT_SUGGESTIONS.map(({ icon: Icon, text, description }) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => chatTextboxRef.current?.setValue(text)}
                    className="group flex flex-col items-start gap-2 rounded-xl border bg-card/60 p-3 text-left transition-colors hover:border-primary/20 hover:bg-card"
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary/8 text-primary/70 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium leading-tight text-foreground/80">{text}</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {groupedMessages.length > 0 && (
            <div className="mx-auto w-full max-w-3xl px-6">
              {groupedMessages.map((group, groupIndex) => {
                if (group.type === "working") {
                  const isGroupActive =
                    isLoading && groupIndex === groupedMessages.length - 1
                  const firstMsg = group.messages[0] as WorkingMessage | undefined
                  const firstKey = firstMsg
                    ? firstMsg.role === "tool"
                      ? (firstMsg as ToolMessage).toolCallId
                      : `assistant-${group.startIndex}`
                    : `working-${group.startIndex}`
                  const isNewGroup =
                    initialSnapshot !== null &&
                    initialSnapshot.sessionId === sessionId &&
                    !initialSnapshot.keys.has(firstKey)
                  const workingKey =
                    (group.messages.find((m) => m.role === "tool") as ToolMessage | undefined)
                      ?.toolCallId ?? `working-${group.startIndex}`
                  return (
                    <div key={`w-${workingKey}`} className="pb-5">
                      <WorkingBlock
                        messages={group.messages}
                        isActive={isGroupActive}
                        showThinking={showThinkingSetting}
                        isNew={isNewGroup}
                        finalThinking={group.finalThinking}
                        rootPath={rootPath}
                      />
                    </div>
                  )
                }

                // Regular message
                const { message, index } = group
                if (
                  message.role === "assistant" &&
                  !message.content.trim() &&
                  !message.thinking.trim() &&
                  !message.errorMessage
                )
                  return null
                const key = getMessageKey(message, index)
                const isNewMessage =
                  initialSnapshot !== null &&
                  initialSnapshot.sessionId === sessionId &&
                  !initialSnapshot.keys.has(key)
                // Only show the metadata bar on the last assistant block in a turn.
                let isLastInTurn = true
                let turnMessages: AssistantMessage[] | undefined
                if (message.role === "assistant") {
                  if (isLoading) {
                    isLastInTurn = false
                  } else {
                    for (let j = index + 1; j < visibleMessages.length; j++) {
                      if (visibleMessages[j].role !== "tool") {
                        isLastInTurn = visibleMessages[j].role !== "assistant"
                        break
                      }
                    }
                  }
                  if (isLastInTurn) {
                    turnMessages = []
                    for (let j = index; j >= 0; j--) {
                      const m = visibleMessages[j]
                      if (m.role === "user" || m.role === "abort") break
                      if (m.role === "assistant") turnMessages.unshift(m as AssistantMessage)
                    }
                  }
                }
                return (
                  <div key={key} className="pb-5">
                    <MessageRow
                      message={message}
                      commandsByName={commandsByName}
                      showThinking={group.suppressThinking ? false : showThinkingSetting}
                      isNewMessage={isNewMessage}
                      isLastInTurn={isLastInTurn}
                      turnMessages={turnMessages}
                      rootPath={rootPath}
                      onFork={handleFork}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div className="mx-auto w-full max-w-3xl px-6">
            {isCompacting
              ? <CompactingIndicator reason={compactionReason} />
              : isLoading && !hasActiveWorkingGroup && <ThinkingIndicator className="py-0.5" />
            }
          </div>

          {/* File changes card - shown after chat completion */}
          {!isLoading && visibleMessages.some((m) => m.role !== "error") && (
            <FileChangesCard sessionId={sessionId} rootPath={rootPath} openWithAppId={openWithAppId} />
          )}
        </div>

        <ChatErrorAlert error={pendingError} onAction={handleErrorAction} />

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
            isAborting={abortSessionMutation.isPending}
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
