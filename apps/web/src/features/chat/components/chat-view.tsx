import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { AssistantMessage, ErrorAction, UserMessage } from "../types"
import { WorkingBlock, type WorkingMessage } from "./working-block"
import { ArrowDownIcon, PlugZapIcon } from "lucide-react"

import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import {
  ChatComposer,
  type ChatComposerHandle,
  type ThinkingLevel,
  type PendingAttachment,
} from "./chat-composer"
import { pendingToUploads, pendingToDisplay } from "../lib/attachments"
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
  useSessionStatus,
  messagesQueryKey,
} from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useSessionWorktrees } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import {
  useAbortSession,
  useGenerateTitle,
  useSendPrompt,
  useSteer,
  useRevertToMessage,
} from "../mutations"
import { useModels } from "../queries"
import { ThinkingIndicator } from "./thinking-indicator"
import { CompactingIndicator } from "./compacting-indicator"
import { ChatErrorAlert } from "./chat-error-alert"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import {
  useUpdateThreadMode,
  useUpdateThreadApprovalMode,
  useUpdateThreadModel,
  useUpdateThreadStopped,
  useUpdateThreadTitle,
  useEnterThreadWorktree,
  useSwitchThreadToLocal,
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
import { getChatSyncEngine } from "../hooks/use-chat-sync-engine"
import {
  clearPendingThreadPreferences,
  getPendingThreadPreferences,
} from "./pending-thread-preferences"
import { getNextMode } from "./mode-combobox"
import { QuestionView } from "./question-view"
import { findActiveQuestion } from "../lib/active-question"
import { ToolApprovalBlock, type PendingApproval } from "./tool-approval-block"
import type { ApprovalMode } from "@/features/workspace/api"

import { FileChangesCard } from "./file-changes-card"
import { forkSession, listMessages } from "../api"
import { blocksToMessages, type MessageBlock } from "../types"
import { workspaceKeys } from "@/features/workspace/queries"
import { MESSAGES_PAGE_SIZE, type MessagesInfiniteData } from "../queries"
import {
  TodoPanel,
  CompletedTodoPanel,
  deriveCompletedGoalLists,
} from "./todo-panel"
import {
  groupChatMessages,
  estimateGroupSize,
  isPlanOnlyTurn,
  buildTurnCardsByGroup,
  buildCheckpointByUserBlock,
  buildCompletedTodosByGroup,
} from "../lib/message-groups"
import { useChatScroll } from "../hooks/use-chat-scroll"

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
  initialMode: "ask" | "plan" | "agent"
  initialApprovalMode: ApprovalMode
  initialIsStopped: boolean
}

export function ChatView({
  sessionId,
  workspaceId,
  threadId,
  initialModelId,
  initialMode,
  initialApprovalMode,
  initialIsStopped,
}: ChatViewProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const syncEngine = getChatSyncEngine()
  const showThinkingSetting = useShowThinkingSetting()
  const { workspaces } = useWorkspace()
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId)
  const activeThread = activeWorkspace?.threads.find((t) => t.id === threadId)
  const worktreeBranch = activeThread?.worktreeBranch ?? null
  // Files this thread touches live in its worktree when it runs in one, so
  // opened file tabs, file links, and FileChangesCard must resolve against the
  // worktree dir rather than the workspace path.
  const rootPath = activeThread?.worktreePath ?? activeWorkspace?.path
  const openWithAppId = activeWorkspace?.openWithAppId
  const { data: models, isLoading: modelsLoading } = useModels()
  const noProvider = !modelsLoading && !models?.models?.length
  const pendingPreferences = getPendingThreadPreferences(threadId)
  const initialSelectedModelId = pendingPreferences?.modelId ?? initialModelId
  const initialThinkingLevel = pendingPreferences?.thinkingLevel

  const [gitError, setGitError] = useState<string | null>(null)
  // Height of the floating bottom bar (error alert + todo + textbox). The
  // scroll area is padded by this so messages can scroll *behind* the input
  // instead of stopping above it.
  const [bottomBarHeight, setBottomBarHeight] = useState(0)
  // Height of just the textbox wrapper — the scroll-to-bottom button is
  // anchored to its top edge.
  const [textboxHeight, setTextboxHeight] = useState(0)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialSelectedModelId
  )
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<
    ThinkingLevel | undefined
  >(initialThinkingLevel)
  const [selectedMode, setSelectedMode] = useState<"ask" | "plan" | "agent">(
    initialMode
  )
  const [selectedApprovalMode, setSelectedApprovalMode] =
    useState<ApprovalMode>(initialApprovalMode)
  // The tool call currently paused awaiting the user's approval, if any.
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null)
  const updateThreadModel = useUpdateThreadModel()
  const updateThreadMode = useUpdateThreadMode()
  const updateThreadApprovalMode = useUpdateThreadApprovalMode()
  const updateThreadStopped = useUpdateThreadStopped()

  // Dedupe plan-saved announcements by relative path so a buffered/replayed
  // event after reconnect doesn't re-toast or re-open the tab.
  const announcedPlansRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    announcedPlansRef.current = new Set()
    resolvedApprovalsRef.current = new Set()
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
    },
    [rootPath]
  )

  // Tool calls we've seen resolved this mount. Guards the status-snapshot
  // restore below from resurrecting an approval that a live `resolved` event
  // already cleared (the REST snapshot can arrive after that event).
  const resolvedApprovalsRef = useRef<Set<string>>(new Set())

  const handleToolApprovalRequest = useCallback(
    (event: {
      toolCallId: string
      toolName: string
      input: Record<string, unknown>
      scopeLabel: string
    }) => {
      setPendingApproval(event)
    },
    []
  )

  const handleToolApprovalResolved = useCallback(
    (event: { toolCallId: string }) => {
      resolvedApprovalsRef.current.add(event.toolCallId)
      // Clear only if it matches the request we're showing (a stale resolve for
      // an already-replaced request shouldn't dismiss a newer prompt).
      setPendingApproval((prev) =>
        prev && prev.toolCallId === event.toolCallId ? null : prev
      )
    },
    []
  )

  // Restore the approval prompt from the status snapshot fetched on every thread
  // mount. The live `tool_approval_request` event fires once and isn't replayed
  // on reconnect, so without this, switching away from a paused tool and back
  // would leave the prompt gone — and the tool stuck — until the turn aborted.
  const { data: sessionStatus } = useSessionStatus(sessionId)
  useEffect(() => {
    const approval = sessionStatus?.pendingApproval
    if (!approval) return
    if (resolvedApprovalsRef.current.has(approval.toolCallId)) return
    setPendingApproval((prev) =>
      prev?.toolCallId === approval.toolCallId ? prev : approval
    )
  }, [sessionStatus])

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
        // Switch to Agent mode first, then fill the chatbox only after the
        // server confirms the mode change. This avoids a race where the user
        // could submit before updateThreadMode completes, causing the agent to
        // run in plan mode (no edit/write tools) and leaving FileChangesCard blank.
        setSelectedMode("agent")
        const prompt = `Implement the plan in @${relativePath}`
        updateThreadMode
          .mutateAsync({ threadId, mode: "agent" })
          .then(() => {
            chatTextboxRef.current?.setValue(prompt)
            chatTextboxRef.current?.focus()
          })
          .catch(() => {
            // Server update failed but local state is already agent — fill anyway.
            chatTextboxRef.current?.setValue(prompt)
            chatTextboxRef.current?.focus()
          })
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
    [rootPath, threadId, updateThreadMode]
  )

  const {
    visibleMessages,
    hasConversationHistory,
    isLoading,
    isLoadingMessages,
    isCompacting,
    compactionReason,
    pendingError,
    queuedCount,
    startUserPrompt,
    steerPrompt,
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
    initialPendingThinkingLevel: initialThinkingLevel,
    onPlanSaved: handlePlanSaved,
    onToolApprovalRequest: handleToolApprovalRequest,
    onToolApprovalResolved: handleToolApprovalResolved,
  })
  const chatTextboxRef = useRef<ChatComposerHandle>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const textboxWrapRef = useRef<HTMLDivElement>(null)
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
  const updateTitleMutation = useUpdateThreadTitle()

  // React's "adjusting state while rendering" pattern — reset all session-local
  // state in one batched pass when the active session changes, avoiding the
  // setState-inside-effect cascade that React 19 rejects.
  if (localSessionId !== sessionId) {
    const nextPendingPreferences = getPendingThreadPreferences(threadId)
    setLocalSessionId(sessionId)
    setGitError(null)
    setSelectedModelId(nextPendingPreferences?.modelId ?? initialModelId)
    setSelectedThinkingLevel(nextPendingPreferences?.thinkingLevel)
    setSelectedMode(initialMode)
    setSelectedApprovalMode(initialApprovalMode)
    setPendingApproval(null)
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
    // Bail out (returning the same reference skips the re-render) when every
    // key is already in the snapshot — idle cache updates land here often.
    setInitialSnapshot((prev) => {
      const keys = visibleMessages.map((m, i) => getMessageKey(m, i))
      if (
        prev !== null &&
        prev.sessionId === sessionId &&
        prev.keys.size === keys.length &&
        keys.every((k) => prev.keys.has(k))
      ) {
        return prev
      }
      return { sessionId, keys: new Set(keys) }
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

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: commandsData } = useSlashCommands(sessionId)
  const { data: branchData } = useBranch(sessionId)
  const { data: branchesData } = useBranches(sessionId)
  const { data: sessionWorktrees } = useSessionWorktrees(sessionId)
  const branch = branchData?.branch ?? null
  const branches = branchesData?.branches ?? []

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const checkoutBranchMutation = useCheckoutBranch(sessionId)
  const enterWorktreeMutation = useEnterThreadWorktree()
  const switchToLocalMutation = useSwitchThreadToLocal()
  const abortSessionMutation = useAbortSession(sessionId)
  const generateTitleMutation = useGenerateTitle()
  const sendPromptMutation = useSendPrompt(sessionId)
  const steerMutation = useSteer(sessionId)

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

  const commandsByName = useMemo(
    () =>
      new Map((commandsData ?? []).map((command) => [command.name, command])),
    [commandsData]
  )

  const groupedMessages = useMemo(
    () => groupChatMessages(visibleMessages),
    [visibleMessages]
  )

  // All scroll behaviour (stick-to-bottom, restore, persistence, older-history
  // prepend, the scroll-to-bottom affordance) lives in this hook.
  const {
    scrollContainerRef,
    messagesContainerRef,
    showScrollButton,
    onScroll,
    scrollToBottom,
    pinToBottom,
  } = useChatScroll({
    sessionId,
    threadId,
    groupCount: groupedMessages.length,
    isLoading,
    isLoadingMessages,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
    bottomBarHeight,
    queryClient,
    syncEngine,
  })

  // Track the floating bottom bar's height so the scroll area can reserve
  // matching padding — keeps the last message resting just above the input
  // while letting earlier content scroll behind it.
  useEffect(() => {
    const el = bottomBarRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setBottomBarHeight(el.offsetHeight)
    })
    ro.observe(el)
    setBottomBarHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // The scroll-to-bottom button is anchored to the top edge of the textbox, so
  // track its height too.
  useEffect(() => {
    const el = textboxWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setTextboxHeight(el.offsetHeight)
    })
    ro.observe(el)
    setTextboxHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // While the agent is working, the in-progress turn's metadata footer (model,
  // duration, timestamp) isn't final yet, so we hide it. This is the index of
  // that turn's last-in-turn assistant group — only its footer is suppressed
  // during loading, so previously completed turns keep showing their metadata.
  // Scans back from the end, stopping at the last user/abort boundary; -1 means
  // there's no active assistant turn yet (e.g. a fresh turn still in tool calls).
  const activeTurnFooterGroupIndex = useMemo(() => {
    for (let i = groupedMessages.length - 1; i >= 0; i--) {
      const g = groupedMessages[i]
      if (g.type !== "regular") continue
      if (g.message.role === "user" || g.message.role === "abort") break
      if (g.message.role === "assistant" && g.isLastInTurnStatic) return i
    }
    return -1
  }, [groupedMessages])

  // When the agent calls the `question` tool it blocks waiting for the user.
  // We replace the input box with a rich question picker until it's answered.
  const activeQuestion = useMemo(
    () => findActiveQuestion(visibleMessages),
    [visibleMessages]
  )

  const turnCardsByGroup = useMemo(
    () => buildTurnCardsByGroup(groupedMessages, turns),
    [groupedMessages, turns]
  )

  const checkpointByUserBlock = useMemo(
    () => buildCheckpointByUserBlock(visibleMessages, turns),
    [visibleMessages, turns]
  )

  const completedTodosByGroup = useMemo(
    () =>
      buildCompletedTodosByGroup(
        groupedMessages,
        deriveCompletedGoalLists(visibleMessages)
      ),
    [groupedMessages, visibleMessages]
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

  // While a question or a tool approval is awaiting the user the agent is idle,
  // not working — hide the shimmering "thinking" phrase so it doesn't claim the
  // agent is busy.
  const showThinkingIndicator =
    isLoading && !isCompacting && !activeQuestion && !pendingApproval

  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModelId(id)
      updateThreadModel.mutate({ threadId, modelId: id })
    },
    [threadId, updateThreadModel]
  )

  const handleModeChange = useCallback(
    (mode: "ask" | "plan" | "agent") => {
      setSelectedMode(mode)
      updateThreadMode.mutate({ threadId, mode })
    },
    [threadId, updateThreadMode]
  )

  const cycleAgentMode = useCallback(() => {
    const nextMode = getNextMode(selectedMode)
    handleModeChange(nextMode)
  }, [handleModeChange, selectedMode])

  const handleApprovalModeChange = useCallback(
    (approvalMode: ApprovalMode) => {
      setSelectedApprovalMode(approvalMode)
      updateThreadApprovalMode.mutate({ threadId, approvalMode })
    },
    [threadId, updateThreadApprovalMode]
  )

  const handleGitError = useCallback((message: string) => {
    setGitError(message)
  }, [])

  const handleBranchSelect = useCallback(
    async (selectedBranch: string) => {
      const onError = (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        const stripped = msg.replace(/^API \d+:\s*/, "")
        try {
          const parsed = JSON.parse(stripped) as { error?: string }
          handleGitError(parsed.error ?? stripped)
        } catch {
          handleGitError(stripped)
        }
      }

      // A branch checked out in a secondary worktree can't be checked out in
      // place — open the thread in that worktree's directory instead.
      const worktree = sessionWorktrees?.find(
        (w) => w.branch === selectedBranch
      )
      if (worktree) {
        if (worktreeBranch === selectedBranch) return
        try {
          if (worktreeBranch) {
            await switchToLocalMutation.mutateAsync({ threadId, sessionId })
          }
          await enterWorktreeMutation.mutateAsync({
            threadId,
            sessionId,
            branch: selectedBranch,
          })
        } catch (error) {
          onError(error)
        }
        return
      }

      try {
        if (worktreeBranch) {
          await switchToLocalMutation.mutateAsync({ threadId, sessionId })
        }
        await checkoutBranchMutation.mutateAsync(selectedBranch)
      } catch (error) {
        onError(error)
      }
    },
    [
      checkoutBranchMutation,
      enterWorktreeMutation,
      switchToLocalMutation,
      sessionWorktrees,
      threadId,
      sessionId,
      worktreeBranch,
      handleGitError,
    ]
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
  // While a tool approval or question prompt is showing, Esc belongs to that
  // prompt (reject / dismiss) — not to aborting the turn. Disarm the global
  // stop shortcut so a single Esc doesn't both reject the tool and stop the run.
  useShortcutHandler(
    SHORTCUT_ACTIONS.STOP_GENERATION,
    isLoading && !pendingApproval && !activeQuestion ? handleStop : null
  )
  useShortcutHandler(SHORTCUT_ACTIONS.SCROLL_TO_BOTTOM, scrollToBottom)
  useShortcutHandler(SHORTCUT_ACTIONS.CYCLE_AGENT_MODE, cycleAgentMode)

  const handleSend = useCallback(
    (
      text: string,
      modelId: string,
      provider: string,
      thinkingLevel?: string,
      attachments?: PendingAttachment[]
    ) => {
      // The agent is already running — steer the live turn instead of starting a
      // new one. The message is appended optimistically and the SDK injects it
      // into the current run after the active tool call finishes.
      // Attachments aren't supported on steering messages — they go with new prompts.
      if (isLoading) {
        steerPrompt(text)
        pinToBottom()
        steerMutation.mutate(text, {
          onError: () => {
            toast.error("Couldn't steer", {
              description:
                "Your message couldn't be delivered to the running agent. Try again.",
            })
          },
        })
        return
      }

      if (!hasConversationHistory && text.trim()) {
        generateTitleMutation.mutate(text, {
          onSuccess: ({ title }) => {
            updateTitleMutation.mutate({ workspaceId, threadId, title })
          },
        })
      }
      updateThreadStopped.mutate({ threadId, stopped: false })
      const uploads = attachments ? pendingToUploads(attachments) : undefined
      const displayAttachments = attachments
        ? pendingToDisplay(attachments)
        : undefined
      startUserPrompt(text, thinkingLevel, displayAttachments)
      pinToBottom()

      const model = modelId && provider ? { provider, modelId } : undefined
      sendPromptMutation.mutate(
        { text, model, thinkingLevel, attachments: uploads },
        { onError: markSendFailed }
      )
    },
    [
      isLoading,
      steerPrompt,
      steerMutation,
      pinToBottom,
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
          onScroll={onScroll}
          className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-4 pb-8"
        >
          <div ref={messagesContainerRef}>
            {/* Older history loads automatically as the user scrolls near the
                top (see useChatScroll); this spinner shows while a page fetches. */}
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
                  <div className="mx-auto w-full max-w-3xl px-3 pb-3">
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
                  const isLastInTurn =
                    isLastInTurnStatic &&
                    !(isLoading && groupIndex === activeTurnFooterGroupIndex)
                  const entryDelayMs = isNewMessage ? getEntryDelayMs(key) : 0
                  content = (
                    <div className="mx-auto w-full max-w-3xl px-3 pb-3">
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
                        threadId={threadId}
                        onFork={handleFork}
                        onRevert={!isLoading ? handleRevert : undefined}
                        isReverting={
                          revertingBlockId === (message as UserMessage).id
                        }
                        checkpoint={
                          message.role === "user" && message.id
                            ? checkpointByUserBlock.get(message.id)
                            : undefined
                        }
                      />
                    </div>
                  )
                }
              }

              const turnCards = turnCardsByGroup.get(groupIndex) ?? []
              const completedTodoLists =
                completedTodosByGroup.get(groupIndex) ?? []

              // Browser-native windowing: skip layout/paint for groups that are
              // off-screen so resizing the window no longer reflows the entire
              // thread at once. The last group is left un-contained since it's
              // the actively streaming turn (always on-screen, growing rapidly),
              // and is excluded as a scroll-anchor candidate so its bottom-growth
              // never gets anchored — the pin logic owns the bottom, native
              // anchoring owns above-viewport corrections (see useChatScroll).
              const isLastGroup = groupIndex === groupedMessages.length - 1

              return (
                <div
                  key={itemKey}
                  data-group-key={String(itemKey)}
                  style={
                    isLastGroup
                      ? { overflowAnchor: "none" }
                      : {
                          contentVisibility: "auto",
                          containIntrinsicSize: `auto ${estimateGroupSize(group)}px`,
                        }
                  }
                >
                  {content}
                  {completedTodoLists.map((goals) => (
                    <div
                      key={`todo-${goals[0]?.id ?? groupIndex}`}
                      className="mx-auto w-full max-w-3xl px-3 pb-3"
                    >
                      <CompletedTodoPanel goals={goals} />
                    </div>
                  ))}
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
            {/* The trailing status row (thinking / compacting / approval) is part
                of the scrollable transcript, so it must live inside
                messagesContainerRef — the single content wrapper useChatScroll's
                ResizeObserver watches for growth. Keeping it here (not a sibling)
                is what lets its appearance grow the observed content and the
                auto-follow snap the view onto it, so sending a message lands on
                the thinking indicator rather than just the latest message row. */}
            <div className="mx-auto w-full max-w-3xl px-3">
              {isCompacting ? (
                <CompactingIndicator reason={compactionReason} />
              ) : pendingApproval ? (
                <div
                  aria-live="polite"
                  className="flex animate-in items-center gap-2 py-0.5 text-sm font-medium text-amber-600 duration-200 fade-in-0 dark:text-amber-400"
                >
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
                  </span>
                  Waiting for approval
                </div>
              ) : (
                showThinkingIndicator && (
                  <ThinkingIndicator className="py-0.5" />
                )
              )}
            </div>
          </div>
        </div>

        {showScrollButton && (
          <div
            style={{ bottom: textboxHeight + 16 }}
            className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
          >
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

        {/* Gradient fade at the bottom of the message list — anchored just above
            the textbox so messages fade into the background as they approach the
            input. pointer-events-none so it never blocks scrolling/clicks. */}
        <div
          style={{ bottom: bottomBarHeight }}
          className="pointer-events-none absolute inset-x-0 z-10 h-8 bg-linear-to-t from-background to-transparent"
        />

        {/* Bottom bar — sits directly below the scrolling message list in normal
            flow, so the chat view ends just above the input instead of scrolling
            behind it. */}
        <div ref={bottomBarRef} className="shrink-0 bg-background">
          <ChatErrorAlert error={pendingError} onAction={handleErrorAction} />

          <div className="mx-auto w-full max-w-3xl px-3 pb-2 empty:hidden">
            <TodoPanel messages={visibleMessages} />
          </div>

          {isLoading && queuedCount > 0 && !activeQuestion && (
            <div className="mx-auto w-full max-w-3xl px-3 pb-1.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                {queuedCount === 1
                  ? "1 message queued — the agent will pick it up shortly"
                  : `${queuedCount} messages queued — the agent will pick them up shortly`}
              </div>
            </div>
          )}

          <div
            ref={textboxWrapRef}
            className="mx-auto w-full max-w-3xl px-3 pb-4"
          >
            {pendingApproval ? (
              <ToolApprovalBlock
                key={pendingApproval.toolCallId}
                sessionId={sessionId}
                approval={pendingApproval}
              />
            ) : activeQuestion ? (
              <QuestionView
                key={activeQuestion.toolCallId}
                sessionId={sessionId}
                question={activeQuestion}
              />
            ) : (
              <ChatComposer
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
                threadId={threadId}
                threadTitle={activeThread?.title}
                worktreeBranch={worktreeBranch}
                selectedModelId={selectedModelId}
                onModelChange={handleModelChange}
                selectedThinkingLevel={selectedThinkingLevel}
                onThinkingLevelChange={setSelectedThinkingLevel}
                mode={selectedMode}
                onModeChange={handleModeChange}
                approvalMode={selectedApprovalMode}
                onApprovalModeChange={handleApprovalModeChange}
                sessionStats={sessionStats}
              />
            )}
          </div>
        </div>
      </div>
    </ChatActionsProvider>
  )
}
