import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type {
  AssistantMessage,
  ErrorAction,
  Message,
  UserMessage,
} from "../types"
import { WorkingBlock, type WorkingMessage } from "./working-block"
import { ArrowDownIcon, PlugZapIcon } from "lucide-react"

import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import {
  ChatTextbox,
  type ChatTextboxHandle,
  type ThinkingLevel,
} from "./chat-textbox"
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
import {
  useSlashCommands,
  useSessionStats,
  chatKeys,
  messagesQueryKey,
} from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import {
  useAbortSession,
  useGenerateTitle,
  useSendPrompt,
  useRevertToMessage,
} from "../mutations"
import { useModels } from "../queries"
import { ThinkingIndicator } from "./thinking-indicator"
import { CompactingIndicator } from "./compacting-indicator"
import { ChatErrorAlert } from "./chat-error-alert"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadMode,
  useUpdateThreadModel,
  useUpdateThreadStopped,
  useUpdateThreadTitle,
} from "@/features/workspace/mutations"
import { useWorkspace } from "@/features/workspace"
import { useChatStream } from "../use-chat-stream"
import { useMainTabsStore } from "@/features/main-tabs"
import {
  ChatActionsProvider,
  type ChatActions,
} from "../contexts/chat-actions-context"
import { formatFileCommentContext } from "../lib/file-context"
import { useTurns } from "@/features/git"
import { PlanChangesCard } from "./plan-changes-card"
import type { TurnSummary } from "@/features/git/api"
import { getChatSyncEngine } from "../hooks/use-chat-sync-engine"
import {
  clearPendingThreadPreferences,
  getPendingThreadPreferences,
} from "./pending-thread-preferences"
import { getNextMode } from "./mode-combobox"

const PLAN_DIR_PREFIX = ".agents/plans/"

import { FileChangesCard } from "./file-changes-card"
import { forkSession, listMessages } from "../api"
import { blocksToMessages, type MessageBlock } from "../types"
import { workspaceKeys } from "@/features/workspace/queries"
import { MESSAGES_PAGE_SIZE, type MessagesInfiniteData } from "../queries"
import { TodoPanel } from "./todo-panel"

type MessageGroup =
  | {
      type: "regular"
      message: Message
      index: number
      suppressThinking?: boolean
      isLastInTurnStatic: boolean
      turnMessages?: AssistantMessage[]
    }
  | {
      type: "working"
      messages: WorkingMessage[]
      startIndex: number
      finalThinking?: string
    }

function groupChatMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let i = 0
  let suppressNextThinking = false

  const isWorkingEntry = (m: Message): boolean => {
    if (m.role === "tool") return true
    if (m.role === "assistant") {
      return (
        !(m as AssistantMessage).content.trim() &&
        !(m as AssistantMessage).errorMessage
      )
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
      groups.push({
        type: "working",
        messages: workingMsgs,
        startIndex,
        finalThinking,
      })
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
        groups.push({
          type: "working",
          messages: [],
          startIndex: i,
          finalThinking: (msg as AssistantMessage).thinking,
        })
        groups.push({
          type: "regular",
          message: msg,
          index: i,
          suppressThinking: true,
          isLastInTurnStatic: false,
          turnMessages: undefined,
        })
      } else {
        groups.push({
          type: "regular",
          message: msg,
          index: i,
          suppressThinking: suppress,
          isLastInTurnStatic: false,
          turnMessages: undefined,
        })
      }
      i++
    }
  }

  // Post-pass: compute isLastInTurnStatic + turnMessages for assistant groups.
  // Backward scan to mark which assistant is last in its turn, then a forward
  // scan to collect the turn's assistant messages for the copy button.
  // Both passes are O(n) over groups, so this replaces the O(n²) per-render loop.
  let seenAssistantAfter = false
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g]
    if (group.type !== "regular") continue
    if (group.message.role === "user" || group.message.role === "abort") {
      seenAssistantAfter = false
    } else if (group.message.role === "assistant") {
      group.isLastInTurnStatic = !seenAssistantAfter
      seenAssistantAfter = true
    }
  }

  let currentTurnAssistants: AssistantMessage[] = []
  for (const group of groups) {
    if (group.type !== "regular") continue
    if (group.message.role === "user" || group.message.role === "abort") {
      currentTurnAssistants = []
    } else if (group.message.role === "assistant") {
      currentTurnAssistants = [
        ...currentTurnAssistants,
        group.message as AssistantMessage,
      ]
      if (group.isLastInTurnStatic) {
        group.turnMessages = currentTurnAssistants
      }
    }
  }

  return groups
}

function isPlanOnlyTurn(turn: TurnSummary): boolean {
  return (
    turn.files.length > 0 &&
    turn.files.every(
      (f) =>
        f.filePath.replace(/\\/g, "/").startsWith(PLAN_DIR_PREFIX) &&
        f.filePath.toLowerCase().endsWith(".md")
    )
  )
}

function getGroupCreatedAt(group: MessageGroup): number | null {
  if (group.type === "regular") {
    return "createdAt" in group.message
      ? (group.message.createdAt ?? null)
      : null
  }

  let latest: number | null = null
  for (const message of group.messages) {
    const createdAt = message.createdAt ?? null
    if (createdAt == null) continue
    latest = latest == null ? createdAt : Math.max(latest, createdAt)
  }
  return latest
}

function buildTurnCardsByGroup(
  groups: MessageGroup[],
  turns: TurnSummary[]
): Map<number, TurnSummary[]> {
  const completedTurns = turns
    .filter((turn) => !turn.inProgress && turn.files.length > 0)
    .sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)
  const groupTimes = groups.map(getGroupCreatedAt)
  const cardsByGroup = new Map<number, TurnSummary[]>()
  let previousTurnEndedAt = -Infinity

  for (const turn of completedTurns) {
    let targetIndex = -1

    for (let i = 0; i < groupTimes.length; i++) {
      const createdAt = groupTimes[i]
      if (createdAt == null) continue
      if (createdAt >= turn.startedAt && createdAt <= turn.endedAt + 5_000) {
        targetIndex = i
      }
    }

    if (targetIndex === -1) {
      for (let i = 0; i < groupTimes.length; i++) {
        const createdAt = groupTimes[i]
        if (createdAt == null) continue
        if (
          createdAt > previousTurnEndedAt &&
          createdAt <= turn.endedAt + 5_000
        ) {
          targetIndex = i
        }
      }
    }

    if (targetIndex !== -1) {
      const list = cardsByGroup.get(targetIndex) ?? []
      list.push(turn)
      cardsByGroup.set(targetIndex, list)
    }
    previousTurnEndedAt = turn.endedAt
  }

  return cardsByGroup
}

// Pending initial inputs keyed by threadId — used to pre-fill the textbox
// after a fork without threading state through route params.
const pendingInitialInputs = new Map<string, string>()

// ── Sequential message entry ─────────────────────────────────────────────
// Each row that enters the visible list within a single turn gets a sequence
// number; CSS animation-delay is `seq * STAGGER_MS` so concurrent mounts
// (RAF-batched WS events) cascade in instead of stacking on the same frame.
// Capped so a long burst doesn't push the last item out by full seconds.
const ENTRY_STAGGER_MS = 70
const ENTRY_MAX_DELAY_MS = 420

function entryDelayFor(seq: number): number {
  return Math.min(seq * ENTRY_STAGGER_MS, ENTRY_MAX_DELAY_MS)
}

interface ChatViewProps {
  sessionId: string
  workspaceId: string
  threadId: string
  initialModelId: string | null
  initialMode: "ask" | "plan" | "code"
  initialIsStopped: boolean
}

export function ChatView({
  sessionId,
  workspaceId,
  threadId,
  initialModelId,
  initialMode,
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
  const noProvider = !modelsLoading && !models?.models?.length
  const pendingPreferences = getPendingThreadPreferences(threadId)
  const initialSelectedModelId = pendingPreferences?.modelId ?? initialModelId
  const initialThinkingLevel = pendingPreferences?.thinkingLevel

  const [gitError, setGitError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialSelectedModelId
  )
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<
    ThinkingLevel | undefined
  >(initialThinkingLevel)
  const [selectedMode, setSelectedMode] = useState<"ask" | "plan" | "code">(
    initialMode
  )
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadMode = useUpdateThreadMode()
  const updateThreadStopped = useUpdateThreadStopped()

  // Dedupe plan-saved announcements by relative path so a buffered/replayed
  // event after reconnect doesn't re-toast or re-open the tab.
  const announcedPlansRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    announcedPlansRef.current = new Set()
  }, [threadId])

  const handlePlanSaved = useCallback(
    ({
      filePath,
      relativePath,
    }: {
      filePath: string
      relativePath: string
    }) => {
      if (announcedPlansRef.current.has(relativePath)) return
      announcedPlansRef.current.add(relativePath)

      const fileName = relativePath.split("/").pop() ?? relativePath
      useMainTabsStore.getState().addFileTab({
        filePath,
        title: fileName,
        workspacePath: rootPath,
      })

      if (selectedMode === "plan") {
        setSelectedMode("code")
        updateThreadMode.mutate({ threadId, mode: "code" })
        toast.success("Plan saved — switched to Code mode", {
          description: relativePath,
          action: {
            label: "Undo",
            onClick: () => {
              setSelectedMode("plan")
              updateThreadMode.mutate({ threadId, mode: "plan" })
            },
          },
        })
      } else {
        toast.success("Plan saved", { description: relativePath })
      }
    },
    [rootPath, selectedMode, threadId, updateThreadMode]
  )

  const { data: turns = [] } = useTurns(sessionId)

  const chatActions = useMemo<ChatActions>(
    () => ({
      openFile: (filePath, title) => {
        const fileName = title ?? filePath.split("/").pop() ?? filePath
        useMainTabsStore.getState().addFileTab({
          filePath,
          title: fileName,
          workspacePath: rootPath,
        })
      },
      implementPlan: (relativePath) => {
        if (selectedMode !== "code") {
          setSelectedMode("code")
          updateThreadMode.mutate({ threadId, mode: "code" })
        }
        const prompt = `Implement the plan in @${relativePath}.`
        chatTextboxRef.current?.setValue(prompt)
        chatTextboxRef.current?.focus()
      },
      addFileCommentContext: (context) => {
        const current = chatTextboxRef.current?.getValue() ?? ""
        const token = formatFileCommentContext(context)
        const next = current.trim()
          ? `${current.replace(/\s*$/, "")}\n${token}`
          : token
        chatTextboxRef.current?.setValue(next)
        chatTextboxRef.current?.focus()
      },
    }),
    [rootPath, selectedMode, threadId, updateThreadMode]
  )

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
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useChatStream({
    sessionId,
    threadId,
    initialIsStopped,
    onPlanSaved: handlePlanSaved,
  })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  // Set to true while we triggered a programmatic scroll (instant or smooth).
  // handleScroll ignores pinned-state changes until scrollend clears this flag,
  // preventing user-initiated scroll events from cancelling our animation.
  const programmaticScrollRef = useRef(false)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)
  // Messages present on the first non-empty render (from cache) skip entry animations.
  // Only messages that arrive after the initial snapshot get animate-in treatment.
  // State (not a ref) so it can be safely read during render.
  const [initialSnapshot, setInitialSnapshot] = useState<{
    sessionId: string
    keys: Set<string>
  } | null>(null)
  // Always-current ref used by the snapshot update effect below.
  const visibleMessagesRef = useRef(visibleMessages)
  visibleMessagesRef.current = visibleMessages
  // Tracks the last-rendered session so we can detect switches during render.
  const [localSessionId, setLocalSessionId] = useState(sessionId)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const updateTitleMutation = useUpdateThreadTitle()

  // React's "adjusting state while rendering" pattern — reset all session-local
  // state in one batched pass when the active session changes, avoiding the
  // setState-inside-effect cascade that React 19 rejects.
  if (localSessionId !== sessionId) {
    const nextPendingPreferences = getPendingThreadPreferences(threadId)
    setLocalSessionId(sessionId)
    setGitError(null)
    setShowScrollButton(false)
    setSelectedModelId(nextPendingPreferences?.modelId ?? initialModelId)
    setSelectedThinkingLevel(nextPendingPreferences?.thinkingLevel)
    setSelectedMode(initialMode)
  }

  // Capture initial keys for this session as soon as messages are available,
  // also during render so isNewMessage is correct on the very same frame.
  // Use the per-message key (not per-group) so we can ask "was this message
  // present at first paint?" for both regular and working-block messages.
  if (
    visibleMessages.length > 0 &&
    (initialSnapshot === null || initialSnapshot.sessionId !== sessionId)
  ) {
    setInitialSnapshot({
      sessionId,
      keys: new Set(visibleMessages.map((m, i) => getMessageKey(m, i))),
    })
  }

  // Per-turn appearance order: assigns a stable sequence number the first
  // time we see a not-in-snapshot key. Used to derive `animation-delay` so
  // rows mounted in the same RAF batch cascade instead of overlapping.
  // Reset when the active session changes; cleared by an effect when a turn
  // completes so the next turn's first row starts at delay 0.
  const appearanceOrderRef = useRef<Map<string, number>>(new Map())
  const appearanceCounterRef = useRef(0)
  if (localSessionId !== sessionId) {
    appearanceOrderRef.current = new Map()
    appearanceCounterRef.current = 0
  }
  const getEntryDelayMs = (key: string): number => {
    const map = appearanceOrderRef.current
    let seq = map.get(key)
    if (seq === undefined) {
      seq = appearanceCounterRef.current++
      map.set(key, seq)
    }
    return entryDelayFor(seq)
  }

  // Extend the snapshot to include all currently-visible messages whenever the
  // view is idle. Two windows matter:
  //   1. Turn end (isLoading true→false): the streaming user/assistant rows
  //      have only index-based keys at this point, so they get added to the
  //      snapshot under those keys.
  //   2. The post-turn refetch (~750 ms later) replaces those streaming rows
  //      with persisted versions that carry stable DB-id / createdAt-based
  //      keys. Without re-snapshotting here, the next prompt would see the
  //      new keys as "not in snapshot" and replay the entry / word-reveal
  //      animations for messages that have already been shown.
  // The appearance-order reset still only fires on the true→false transition
  // so mid-turn deltas don't restart row staggering.
  const prevIsLoadingRef = useRef(isLoading)
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current
    prevIsLoadingRef.current = isLoading
    if (isLoading || visibleMessages.length === 0) return
    setInitialSnapshot({
      sessionId,
      keys: new Set(visibleMessages.map((m, i) => getMessageKey(m, i))),
    })
    if (wasLoading) {
      appearanceOrderRef.current = new Map()
      appearanceCounterRef.current = 0
    }
  }, [isLoading, sessionId, visibleMessages])

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
    clearPendingThreadPreferences(threadId)
  }, [threadId])

  // Flush any pending scroll-to-localStorage write on unmount so the last
  // sub-debounce scroll position survives a thread switch / reload.
  useEffect(() => {
    return () => {
      if (scrollSaveTimeoutRef.current !== null) {
        clearTimeout(scrollSaveTimeoutRef.current)
        scrollSaveTimeoutRef.current = null
        const meta = pendingScrollMetaRef.current
        if (meta) {
          pendingScrollMetaRef.current = null
          queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
          syncEngine.saveScrollMeta(sessionId, meta)
        }
      }
    }
  }, [queryClient, sessionId, syncEngine])

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
  // Two-layer approach:
  // 1. A ResizeObserver on the messages container tracks content growth (word-reveal,
  //    streaming text deltas) and instantly keeps the user at the bottom — no visible
  //    jump because content grows in small increments.
  // 2. The useLayoutEffect below handles coarser events (loading state changes, new
  //    message groups) and uses smooth scroll so there is a clear visual cue for
  //    each "something new appeared" moment.
  // programmaticScrollRef prevents handleScroll from flipping pinnedRef
  // to false mid-animation, which would stop further auto-scroll.
  const commandsByName = useMemo(
    () =>
      new Map((commandsData ?? []).map((command) => [command.name, command])),
    [commandsData]
  )

  const groupedMessages = useMemo(
    () => groupChatMessages(visibleMessages),
    [visibleMessages]
  )

  const turnCardsByGroup = useMemo(
    () => buildTurnCardsByGroup(groupedMessages, turns),
    [groupedMessages, turns]
  )

  // Stable per-group keys derived from message identity rather than position,
  // so prepending older history doesn't re-key existing rows. Used as the
  // React key for each rendered group and by the initialSnapshot isNew lookup.
  const groupKeys = useMemo(() => {
    const keys: string[] = new Array(groupedMessages.length)
    for (let i = 0; i < groupedMessages.length; i++) {
      const group = groupedMessages[i]
      if (group.type === "working") {
        const firstMsg = group.messages[0]
        if (firstMsg?.role === "tool") {
          keys[i] = `working-tool-${firstMsg.toolCallId}`
        } else if (firstMsg?.role === "assistant") {
          const a = firstMsg as AssistantMessage
          keys[i] = a.id
            ? `working-assistant-id${a.id}`
            : a.createdAt != null
              ? `working-assistant-t${a.createdAt}`
              : `working-assistant-i${group.startIndex}`
        } else {
          // Synthetic working block (final-thinking placeholder) is always
          // followed by a regular assistant group; share its key prefix.
          const next = groupedMessages[i + 1]
          if (next?.type === "regular") {
            keys[i] = `working-syn-${getMessageKey(next.message, next.index)}`
          } else {
            keys[i] = `working-i${group.startIndex}`
          }
        }
      } else {
        keys[i] = getMessageKey(group.message, group.index)
      }
    }
    return keys
  }, [groupedMessages])

  const showThinkingIndicator = isLoading && !isCompacting

  // Track group count + previous scrollHeight so we can restore scroll position
  // after older pages prepend (keeps the previously-first visible row in place
  // instead of jumping to the top).
  const prevGroupCountRef = useRef(groupedMessages.length)
  const prevScrollHeightRef = useRef(0)
  const isLoadingOlderRef = useRef(false)

  // ── Scroll position persistence via query cache & localStorage ──────────────────
  // Both writes are debounced (~150 ms) — onScroll can fire 60×/s, but neither
  // the query cache (no live subscribers) nor localStorage benefits from
  // per-frame precision. Only the latest scroll position needs to survive
  // a thread switch / reload.
  const pendingScrollMetaRef = useRef<{
    scrollTop: number
    isPinned: boolean
    visited: true
  } | null>(null)
  const saveScrollPosition = useCallback(
    (scrollTop: number) => {
      pendingScrollMetaRef.current = {
        scrollTop,
        isPinned: pinnedRef.current,
        visited: true,
      }
      if (scrollSaveTimeoutRef.current !== null) return
      scrollSaveTimeoutRef.current = setTimeout(() => {
        scrollSaveTimeoutRef.current = null
        const meta = pendingScrollMetaRef.current
        if (!meta) return
        pendingScrollMetaRef.current = null
        queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
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
    programmaticScrollRef.current = false
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

  useLayoutEffect(() => {
    if (!pinnedRef.current || groupedMessages.length === 0) return
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 5) return
    programmaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [isLoading, groupedMessages.length])

  // After older pages are prepended, offset scrollTop by the height delta so
  // the previously-first visible item stays in place instead of jumping.
  useLayoutEffect(() => {
    const prevCount = prevGroupCountRef.current
    const newCount = groupedMessages.length
    if (isLoadingOlderRef.current && newCount > prevCount) {
      isLoadingOlderRef.current = false
      const el = scrollContainerRef.current
      if (el) {
        const delta = el.scrollHeight - prevScrollHeightRef.current
        if (delta > 0) el.scrollTop = el.scrollTop + delta
      }
    }
    prevGroupCountRef.current = newCount
  }, [groupedMessages.length])

  // Clear the programmatic-scroll guard once the browser reports the scroll
  // animation has settled. scrollend fires after both instant (scrollTop=)
  // and smooth (scrollTo behavior:'smooth') scrolls.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScrollEnd = () => {
      programmaticScrollRef.current = false
    }
    el.addEventListener("scrollend", onScrollEnd)
    return () => el.removeEventListener("scrollend", onScrollEnd)
  }, [])

  // ResizeObserver: keep the view pinned to the bottom as content grows
  // (word-reveal, streaming text deltas). Instant-snap only — incremental
  // deltas during streaming are small enough that the jump is imperceptible,
  // and stacking smooth-scroll calls causes jitter.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      if (!pinnedRef.current) return
      const el = scrollContainerRef.current
      if (!el) return
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom < 1) return
      programmaticScrollRef.current = true
      el.scrollTop = el.scrollHeight
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const showScrollButtonRef = useRef(showScrollButton)
  showScrollButtonRef.current = showScrollButton

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    // Trigger loading older messages when near the top
    if (
      el.scrollTop < 200 &&
      hasPreviousPage &&
      !isFetchingPreviousPage &&
      !isLoadingOlderRef.current
    ) {
      isLoadingOlderRef.current = true
      prevGroupCountRef.current = groupedMessages.length
      prevScrollHeightRef.current = el.scrollHeight
      fetchPreviousPage()
    }

    // While a programmatic scroll is in progress, don't touch pinnedRef.
    // If the user clearly dragged away (distance > threshold), treat it as
    // an intentional interrupt and cancel the programmatic guard immediately.
    if (programmaticScrollRef.current) {
      if (distanceFromBottom >= 80) {
        programmaticScrollRef.current = false
        pinnedRef.current = false
        showScrollButtonRef.current = true
        setShowScrollButton(true)
      }
      saveScrollPosition(el.scrollTop)
      return
    }

    pinnedRef.current = distanceFromBottom < 80
    // Only setState when the boolean actually flips — otherwise every
    // scroll-frame schedules a re-render React would then bail out of.
    const shouldShow = distanceFromBottom >= 80
    if (shouldShow !== showScrollButtonRef.current) {
      showScrollButtonRef.current = shouldShow
      setShowScrollButton(shouldShow)
    }
    saveScrollPosition(el.scrollTop)
  }, [
    saveScrollPosition,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
    groupedMessages.length,
  ])

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    pinnedRef.current = true
    setShowScrollButton(false)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 10) return
    programmaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [])

  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModelId(id)
      updateThreadModel.mutate({ threadId, modelId: id })
    },
    [threadId, updateThreadModel]
  )

  const handleModeChange = useCallback(
    (mode: "ask" | "plan" | "code") => {
      setSelectedMode(mode)
      updateThreadMode.mutate({ threadId, mode })
    },
    [threadId, updateThreadMode]
  )

  const cycleAgentMode = useCallback(() => {
    const nextMode = getNextMode(selectedMode)
    handleModeChange(nextMode)
  }, [handleModeChange, selectedMode])

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
  useShortcutHandler(SHORTCUT_ACTIONS.CYCLE_AGENT_MODE, cycleAgentMode)

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
          },
        })
      }
      pinnedRef.current = true
      updateThreadStopped.mutate({ threadId, stopped: false })
      startUserPrompt(text, thinkingLevel)

      // Scroll immediately when sending
      const el = scrollContainerRef.current
      if (el) {
        programmaticScrollRef.current = true
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
    ]
  )

  const handleFork = useCallback(
    async (blockId: string) => {
      try {
        const {
          threadId: newThreadId,
          sessionId: newSessionId,
          initialInput,
        } = await forkSession(sessionId, blockId)
        // Store the forked user message so the new ChatView can pre-fill the textbox
        if (initialInput) pendingInitialInputs.set(newThreadId, initialInput)
        // Pre-populate the messages cache so the forked thread renders immediately
        try {
          const { blocks, hasMore } = await listMessages(newSessionId, {
            limit: MESSAGES_PAGE_SIZE,
          })
          const seededMessages = blocksToMessages(blocks as MessageBlock[])
          const oldestBlockIndex =
            blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
          const seed: MessagesInfiniteData = {
            pages: [{ messages: seededMessages, hasMore, oldestBlockIndex }],
            pageParams: [undefined],
          }
          queryClient.setQueryData(messagesQueryKey(newSessionId), seed)
        } catch {
          // Non-fatal — the query will fetch on mount
        }
        // Fire-and-forget — the route guards against premature redirect via isTabKnown
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
        navigate({
          to: "/workspace/$threadId",
          params: { threadId: newThreadId },
        })
      } catch (err) {
        toast.error("Fork failed", {
          description:
            err instanceof Error ? err.message : "Could not fork conversation",
        })
      }
    },
    [sessionId, queryClient, navigate]
  )

  const [revertingBlockId, setRevertingBlockId] = useState<string | null>(null)
  const revertToMessageMutation = useRevertToMessage(sessionId, (text) => {
    if (text) chatTextboxRef.current?.setValue(text)
  })
  const handleRevert = useCallback(
    async (blockId: string) => {
      setRevertingBlockId(blockId)
      try {
        await revertToMessageMutation.mutateAsync(blockId)
      } catch (err) {
        toast.error("Revert failed", {
          description:
            err instanceof Error
              ? err.message
              : "Could not revert conversation",
        })
      } finally {
        setRevertingBlockId(null)
      }
    },
    [revertToMessageMutation]
  )

  return (
    <ChatActionsProvider value={chatActions}>
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
              onClick={() =>
                navigate({
                  to: "/settings/$section",
                  params: { section: "subscriptions" },
                })
              }
            >
              Configure provider
            </Button>
          </div>
        )}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex w-full flex-1 flex-col overflow-y-auto pt-4 pb-4 [overflow-anchor:none] [scrollbar-gutter:stable]"
        >
          <div ref={messagesContainerRef}>
            {/* Load earlier messages button — visible when older history exists and isn't loading */}
            {hasPreviousPage && !isFetchingPreviousPage && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={fetchPreviousPage}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Load earlier messages
                </button>
              </div>
            )}
            {/* Spinner while loading older history */}
            {isFetchingPreviousPage && (
              <div className="flex justify-center py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              </div>
            )}
            {groupedMessages.map((group, groupIndex) => {
              const itemKey = groupKeys[groupIndex] ?? groupIndex
              let content: React.ReactNode

              if (group.type === "working") {
                const isGroupActive =
                  isLoading && groupIndex === groupedMessages.length - 1
                const firstMsg = group.messages[0] as WorkingMessage | undefined
                // Use the same key fn as initialSnapshot to keep isNew lookup consistent.
                const firstKey = firstMsg
                  ? getMessageKey(firstMsg, group.startIndex)
                  : `working-${group.startIndex}`
                const isNewGroup =
                  isLoading &&
                  initialSnapshot !== null &&
                  initialSnapshot.sessionId === sessionId &&
                  !initialSnapshot.keys.has(firstKey)
                const entryDelayMs = isNewGroup ? getEntryDelayMs(firstKey) : 0
                content = (
                  <div className="mx-auto w-full max-w-3xl px-6 pb-3">
                    <WorkingBlock
                      messages={group.messages}
                      isActive={isGroupActive}
                      showThinking={showThinkingSetting}
                      isNew={isNewGroup}
                      entryDelayMs={entryDelayMs}
                      finalThinking={group.finalThinking}
                      rootPath={rootPath}
                    />
                  </div>
                )
              } else {
                const { message, index, isLastInTurnStatic, turnMessages } =
                  group
                if (
                  message.role === "assistant" &&
                  !message.content.trim() &&
                  !message.thinking.trim() &&
                  !message.errorMessage
                ) {
                  content = null
                } else {
                  const key = getMessageKey(message, index)
                  const isNewMessage =
                    isLoading &&
                    initialSnapshot !== null &&
                    initialSnapshot.sessionId === sessionId &&
                    !initialSnapshot.keys.has(key)
                  const isLastInTurn = !isLoading && isLastInTurnStatic
                  const entryDelayMs = isNewMessage ? getEntryDelayMs(key) : 0
                  content = (
                    <div className="mx-auto w-full max-w-3xl px-6 pb-3">
                      <MessageRow
                        message={message}
                        commandsByName={commandsByName}
                        showThinking={
                          group.suppressThinking ? false : showThinkingSetting
                        }
                        isNewMessage={isNewMessage}
                        entryDelayMs={entryDelayMs}
                        isLastInTurn={isLastInTurn}
                        turnMessages={turnMessages}
                        rootPath={rootPath}
                        onFork={handleFork}
                        onRevert={!isLoading ? handleRevert : undefined}
                        isReverting={
                          revertingBlockId === (message as UserMessage).id
                        }
                      />
                    </div>
                  )
                }
              }

              const turnCards = turnCardsByGroup.get(groupIndex) ?? []

              return (
                <div key={itemKey}>
                  {content}
                  {turnCards.map((turn) =>
                    isPlanOnlyTurn(turn) ? (
                      <PlanChangesCard
                        key={`turn-card-${turn.id}`}
                        rootPath={rootPath}
                        turn={turn}
                      />
                    ) : (
                      <FileChangesCard
                        key={`turn-card-${turn.id}`}
                        sessionId={sessionId}
                        rootPath={rootPath}
                        openWithAppId={openWithAppId}
                        turn={turn}
                      />
                    )
                  )}
                </div>
              )
            })}
          </div>
          <div className="mx-auto w-full max-w-3xl px-6">
            {isCompacting ? (
              <CompactingIndicator reason={compactionReason} />
            ) : (
              showThinkingIndicator && <ThinkingIndicator className="py-0.5" />
            )}
          </div>
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

        <div className="mx-auto w-full max-w-3xl shrink-0 bg-background px-6 pb-2">
          <TodoPanel messages={visibleMessages} />
        </div>

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
            selectedThinkingLevel={selectedThinkingLevel}
            onThinkingLevelChange={setSelectedThinkingLevel}
            mode={selectedMode}
            onModeChange={handleModeChange}
            sessionStats={sessionStats}
          />
        </div>
      </div>
    </ChatActionsProvider>
  )
}
