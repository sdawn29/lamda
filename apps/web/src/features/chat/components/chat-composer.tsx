import * as React from "react"
import { memo, forwardRef, useImperativeHandle } from "react"

export interface ChatComposerHandle {
  getValue: () => string
  setValue: (text: string) => void
  focus: () => void
}
import {
  ArrowUpIcon,
  BotIcon,
  ChartColumnIcon,
  EraserIcon,
  FileTextIcon,
  HelpCircleIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  MinimizeIcon,
  MoonIcon,
  PaperclipIcon,
  PlusIcon,
  SettingsIcon,
  StopCircleIcon,
  SunIcon,
  XIcon,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import {
  useModels,
  useSlashCommands,
  useWorkspaceSlashCommands,
  useContextUsage,
  chatKeys,
  type WorkspaceEntry,
} from "../queries"
import { useWorkspaceIndex } from "@/features/workspace/queries"
import { BranchSelector } from "@/features/git"
import { ModelCombobox } from "./model-combobox"
import { ModeCombobox, getModeOption } from "./mode-combobox"
import { ApprovalModeCombobox } from "./approval-mode-combobox"
import { ThinkingCombobox, type ThinkingLevel } from "./thinking-combobox"
export type { ThinkingLevel } from "./thinking-combobox"
import { useComposerPrefsStore, MAX_MESSAGE_HISTORY } from "../composer-prefs-store"
import type { Mode, ApprovalMode } from "@/features/workspace/api"
import {
  RichInput,
  buildMentionChip,
  buildSlashCommandChip,
  type RichInputHandle,
  type AtMention,
  type SlashMention,
} from "./rich-input"
import { FileMentionDropdown } from "./file-mention-dropdown"
import {
  SlashCommandDropdown,
  itemValue,
  type ChatSlashAction,
  type ChatSlashItem,
  type ChatSlashGroup,
} from "./slash-command-dropdown"
import { ContextChart } from "./context-chart"
import { compactSession, type SessionStats } from "../api"
import { useCommandPalette } from "@/features/command-palette"
import { DEFAULT_SETTINGS_SECTION } from "@/features/settings"
import { useTheme } from "@/shared/components/theme-provider"

// Composer preferences (thinking level + sent-message history) live in a
// persisted zustand store. These thin wrappers preserve the call sites below.
function readStoredThinkingLevel(): ThinkingLevel {
  return useComposerPrefsStore.getState().thinkingLevel
}

// Shell-style history of messages the user has sent, recalled by pressing
// ArrowUp / ArrowDown on the chat input. Stored newest-last and shared across
// threads so the history follows the user like a terminal prompt.
function readMessageHistory(): string[] {
  // Return a copy — callers mutate the array in place before persisting.
  return [...useComposerPrefsStore.getState().messageHistory]
}

function writeMessageHistory(history: string[]): void {
  useComposerPrefsStore.getState().setMessageHistory(history)
}

export interface PendingAttachment {
  id: string
  filename: string
  mediaType: string
  size: number
  kind: "image" | "text" | "file"
  dataUrl: string
}

interface ChatComposerProps {
  onSend?: (
    message: string,
    modelId: string,
    provider: string,
    thinkingLevel?: string,
    attachments?: PendingAttachment[]
  ) => void
  isLoading?: boolean
  /** True while the abort request is in-flight — disables the stop button to prevent double-clicks. */
  isAborting?: boolean
  onStop?: () => void
  placeholder?: string
  className?: string
  branch?: string | null
  branches?: string[]
  onBranchSelect?: (branch: string) => void
  onBranchError?: (message: string) => void
  sessionId?: string
  workspaceId?: string
  selectedModelId?: string | null
  onModelChange?: (modelId: string) => void
  selectedThinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  mode?: Mode
  onModeChange?: (mode: Mode) => void
  approvalMode?: ApprovalMode
  onApprovalModeChange?: (mode: ApprovalMode) => void
  sessionStats?: SessionStats | null
  /**
   * Extra content rendered at the start of the composer's context strip, before
   * the branch selector. The new-thread composer uses this for its workspace
   * picker so workspace, branch, and approval share one connected bar.
   */
  contextLeading?: React.ReactNode
}

export const ChatComposer = memo(
  forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
    {
      onSend,
      isLoading = false,
      isAborting = false,
      onStop,
      placeholder = "Ask anything… @ for files, / for commands",
      className,
      branch,
      branches = [],
      onBranchSelect,
      onBranchError,
      sessionId,
      workspaceId,
      selectedModelId: controlledModelId,
      onModelChange,
      selectedThinkingLevel: controlledThinkingLevel,
      onThinkingLevelChange,
      mode = "agent",
      onModeChange,
      approvalMode = "ask",
      onApprovalModeChange,
      sessionStats,
      contextLeading,
    }: ChatComposerProps,
    ref
  ) {
    const [isEmpty, setIsEmpty] = React.useState(true)
    const [internalModelId, setInternalModelId] = React.useState<string | null>(
      null
    )
    // Hydrate from localStorage so the user's last pick survives navigation
    // (e.g. new-thread → thread view, or switching between threads).
    const [thinkingLevel, setThinkingLevelState] =
      React.useState<ThinkingLevel>(() => readStoredThinkingLevel())
    const setThinkingLevel = React.useCallback(
      (level: ThinkingLevel) => {
        setThinkingLevelState(level)
        onThinkingLevelChange?.(level)
        useComposerPrefsStore.getState().setThinkingLevel(level)
      },
      [onThinkingLevelChange]
    )
    const [atMention, setAtMention] = React.useState<
      (AtMention & { selectedIndex: number }) | null
    >(null)
    const [slashMention, setSlashMention] = React.useState<
      (SlashMention & { selectedIndex: number }) | null
    >(null)
    const [attachments, setAttachments] = React.useState<PendingAttachment[]>([])
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const mentionEntries = React.useRef<WorkspaceEntry[]>([])
    const slashItemsRef = React.useRef<ChatSlashItem[]>([])
    const isControlled = controlledModelId !== undefined
    const isThinkingControlled = controlledThinkingLevel !== undefined

    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const openPalette = useCommandPalette((s) => s.openPalette)
    const openSettings = React.useCallback(() => {
      navigate({
        to: "/settings/$section",
        params: { section: DEFAULT_SETTINGS_SECTION },
      })
    }, [navigate])
    const openUsage = React.useCallback(() => {
      navigate({
        to: "/settings/$section",
        params: { section: "usage" },
      })
    }, [navigate])
    const { resolvedTheme, setTheme } = useTheme()
    const selectedModelId = isControlled ? controlledModelId : internalModelId
    const selectedThinkingLevel = isThinkingControlled
      ? controlledThinkingLevel
      : thinkingLevel
    const richInputRef = React.useRef<RichInputHandle>(null)
    // Persisted history of sent messages (newest last), cycled with Up/Down.
    const historyRef = React.useRef<string[]>(readMessageHistory())
    // Position within `historyRef`; null means we're showing the live draft.
    const historyCursorRef = React.useRef<number | null>(null)
    // The draft that was in the input when history navigation began, restored
    // when the user arrows back down past the newest entry.
    const historyDraftRef = React.useRef<string>("")
    // The exact value we last wrote to the input during navigation. If the
    // current value differs, the user has edited it and navigation restarts.
    const historyNavValueRef = React.useRef<string>("")

    useImperativeHandle(ref, () => ({
      getValue() {
        return richInputRef.current?.getValue() ?? ""
      },
      setValue(text: string) {
        richInputRef.current?.setValue(text)
        setIsEmpty(text.trim().length === 0)
      },
      focus() {
        richInputRef.current?.focus()
      },
    }))

    const { data } = useModels()
    const models = React.useMemo(() => data?.models ?? [], [data])
    const selectedModel =
      models.find((m) => `${m.provider}::${m.id}` === selectedModelId) ??
      models[0] ??
      null

    const availableLevels = React.useMemo(
      () => selectedModel?.thinkingLevels ?? [],
      [selectedModel]
    )

    React.useEffect(() => {
      if (!availableLevels.length) return
      // When thinking is available, default to "medium" if not set or not in available levels
      if (!availableLevels.includes(selectedThinkingLevel)) {
        const mediumIndex = availableLevels.indexOf("medium")
        if (mediumIndex !== -1) {
          setThinkingLevel("medium")
        } else {
          // Fall back to first available level
          setThinkingLevel(availableLevels[0] as ThinkingLevel)
        }
      }
    }, [availableLevels, selectedThinkingLevel, setThinkingLevel])

    const grouped = React.useMemo(
      () =>
        Object.entries(
          models.reduce<Record<string, typeof models>>((acc, m) => {
            ;(acc[m.provider] ??= []).push(m)
            return acc
          }, {})
        ),
      [models]
    )

    const fileMentionOpen = atMention !== null
    const slashCommandOpen = slashMention !== null

    const { data: indexedFiles, isLoading: filesLoading } = useWorkspaceIndex(
      workspaceId,
      fileMentionOpen
    )
    const fileData = React.useMemo((): WorkspaceEntry[] => {
      if (!indexedFiles) return []
      return indexedFiles.map((f) => ({
        path: f.relativePath,
        type: f.isDirectory ? "dir" : "file",
      }))
    }, [indexedFiles])
    // Skills/prompts come from the live session once one exists; before then
    // (the new-thread composer) they're resolved from the workspace directly so
    // the dropdown can still preview the workspace's skills.
    const useWorkspaceCommands = !sessionId
    const {
      data: sessionCommandsData,
      isLoading: sessionCommandsLoading,
      refetch: refetchSessionCommands,
    } = useSlashCommands(sessionId, slashCommandOpen && !useWorkspaceCommands)
    const {
      data: workspaceCommandsData,
      isLoading: workspaceCommandsLoading,
    } = useWorkspaceSlashCommands(
      workspaceId,
      slashCommandOpen && useWorkspaceCommands
    )
    const commandsData = useWorkspaceCommands
      ? workspaceCommandsData
      : sessionCommandsData
    const commandsLoading = useWorkspaceCommands
      ? workspaceCommandsLoading
      : sessionCommandsLoading

    // Re-fetch session skills / prompt-templates every time the slash-command
    // dropdown opens (reading them off the live session is cheap). Workspace
    // commands rebuild the resource loader server-side, so those rely on the
    // query's own staleTime rather than a forced refetch on every "/".
    const prevSlashCommandOpen = React.useRef(false)
    React.useEffect(() => {
      if (
        slashCommandOpen &&
        !prevSlashCommandOpen.current &&
        !useWorkspaceCommands
      ) {
        void refetchSessionCommands()
      }
      prevSlashCommandOpen.current = slashCommandOpen
    }, [slashCommandOpen, useWorkspaceCommands, refetchSessionCommands])
    const { data: contextUsage } = useContextUsage(sessionId)

    const mentionEntries2 = React.useMemo(() => {
      if (!atMention) return []
      const entries = fileData ?? []
      const f = atMention.filter.toLowerCase()
      return entries
        .filter((e) => e.path.toLowerCase().includes(f))
        .slice(0, 10)
    }, [fileData, atMention])
    mentionEntries.current = mentionEntries2

    // Built-in action commands. Each runs immediately when selected (no chip
    // is inserted). Items are conditionally included based on context.
    const actions = React.useMemo<ChatSlashAction[]>(() => {
      const list: ChatSlashAction[] = []

      if (onModeChange) {
        const modeCommands: Array<{
          mode: Mode
          name: string
          description: string
          icon: ChatSlashAction["icon"]
        }> = [
          {
            mode: "ask",
            name: "ask",
            description: "Switch to Ask mode",
            icon: MessageCircleQuestionIcon,
          },
          {
            mode: "plan",
            name: "plan",
            description: "Switch to Plan mode",
            icon: ListTodoIcon,
          },
          {
            mode: "agent",
            name: "agent",
            description: "Switch to Agent mode",
            icon: BotIcon,
          },
        ]

        for (const command of modeCommands) {
          if (command.mode === mode) continue
          list.push({
            kind: "action",
            name: command.name,
            description: command.description,
            icon: command.icon,
            onSelect: () => onModeChange(command.mode),
          })
        }
      }

      if (workspaceId) {
        list.push({
          kind: "action",
          name: "new",
          description: "Open a new thread",
          icon: PlusIcon,
          onSelect: () => {
            navigate({ to: "/new", search: { ws: workspaceId } })
          },
        })
      }

      if (sessionId && !isLoading) {
        list.push({
          kind: "action",
          name: "compact",
          description: "Compact conversation context",
          icon: MinimizeIcon,
          onSelect: () => {
            void (async () => {
              try {
                await compactSession(sessionId)
                void queryClient.invalidateQueries({
                  queryKey: chatKeys.contextUsage(sessionId),
                })
                void queryClient.invalidateQueries({
                  queryKey: chatKeys.sessionStats(sessionId),
                })
              } catch (err) {
                toast.error("Compaction failed", {
                  description:
                    err instanceof Error
                      ? err.message
                      : "Could not compact context.",
                })
              }
            })()
          },
        })
      }

      if (isLoading && onStop) {
        list.push({
          kind: "action",
          name: "stop",
          description: "Stop generation",
          icon: StopCircleIcon,
          onSelect: onStop,
        })
      }

      if (!isEmpty) {
        list.push({
          kind: "action",
          name: "clear",
          description: "Clear the input",
          icon: EraserIcon,
          onSelect: () => {
            richInputRef.current?.clear()
            setIsEmpty(true)
          },
        })
      }

      list.push({
        kind: "action",
        name: "help",
        description: "Open command palette",
        icon: HelpCircleIcon,
        onSelect: openPalette,
      })

      list.push({
        kind: "action",
        name: "settings",
        description: "Open settings",
        icon: SettingsIcon,
        onSelect: openSettings,
      })

      list.push({
        kind: "action",
        name: "usage",
        description: "Open the AI usage page",
        icon: ChartColumnIcon,
        onSelect: openUsage,
      })

      list.push({
        kind: "action",
        name: "theme",
        description:
          resolvedTheme === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode",
        icon: resolvedTheme === "dark" ? SunIcon : MoonIcon,
        onSelect: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
        },
      })

      return list
    }, [
      workspaceId,
      sessionId,
      isLoading,
      isEmpty,
      onStop,
      mode,
      onModeChange,
      navigate,
      queryClient,
      openPalette,
      openSettings,
      openUsage,
      resolvedTheme,
      setTheme,
    ])

    const slashFilter = slashMention?.filter.toLowerCase() ?? ""

    const filteredActions = React.useMemo(() => {
      if (!slashFilter) return actions
      return actions.filter(
        (a) =>
          a.name.toLowerCase().includes(slashFilter) ||
          a.description?.toLowerCase().includes(slashFilter)
      )
    }, [actions, slashFilter])

    const filteredServerCommands = React.useMemo(() => {
      const commands = commandsData ?? []
      if (!slashFilter) return commands.slice(0, 20)
      return commands
        .filter(
          (c) =>
            c.name.toLowerCase().includes(slashFilter) ||
            c.description?.toLowerCase().includes(slashFilter)
        )
        .slice(0, 20)
    }, [commandsData, slashFilter])

    const slashGroups = React.useMemo<ChatSlashGroup[]>(() => {
      const skills = filteredServerCommands.filter((c) => c.source === "skill")
      const prompts = filteredServerCommands.filter(
        (c) => c.source === "prompt"
      )
      return [
        {
          heading: "Actions",
          items: filteredActions as ChatSlashItem[],
        },
        {
          heading: "Skills",
          items: skills.map(
            (command): ChatSlashItem => ({ kind: "command", command })
          ),
        },
        {
          heading: "Prompts",
          items: prompts.map(
            (command): ChatSlashItem => ({ kind: "command", command })
          ),
        },
      ]
    }, [filteredActions, filteredServerCommands])

    const slashItems = React.useMemo(
      () => slashGroups.flatMap((g) => g.items),
      [slashGroups]
    )
    slashItemsRef.current = slashItems

    // Server returned no skills/prompts at all (not just filtered to zero).
    const noSkillsAvailable =
      !commandsLoading && (commandsData?.length ?? 0) === 0

    // Sending is allowed even while the agent runs: a non-empty submit while
    // loading steers the live turn (the parent decides steer vs. new prompt).
    const canSend = !isEmpty || attachments.length > 0

    async function readFileAsBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (typeof result === "string") {
            resolve(result.split(",")[1] || result)
          } else {
            reject(new Error("Failed to read file"))
          }
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    }

    // Extensions that are textual even when the browser reports a generic or
    // empty MIME type (common for source files).
    const TEXT_EXTENSIONS =
      /\.(txt|md|markdown|json|jsonc|ya?ml|toml|ini|csv|tsv|log|xml|html?|css|scss|less|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|swift|sh|bash|zsh|sql|graphql|env|gitignore|dockerfile|vue|svelte)$/i

    function classifyFile(file: File): "image" | "text" | "file" {
      if (file.type.startsWith("image/")) return "image"
      if (
        file.type.startsWith("text/") ||
        file.type.includes("json") ||
        file.type.includes("xml") ||
        file.type.includes("javascript") ||
        file.type.includes("typescript") ||
        TEXT_EXTENSIONS.test(file.name)
      ) {
        return "text"
      }
      // Any other format is accepted and attached as a generic file.
      return "file"
    }

    async function handleAddFiles(files: File[]) {
      const newAttachments: PendingAttachment[] = []
      for (const file of files) {
        const kind = classifyFile(file)
        try {
          const base64 = await readFileAsBase64(file)
          const dataUrl = `data:${file.type};base64,${base64}`
          newAttachments.push({
            id: crypto.randomUUID(),
            filename: file.name,
            mediaType: file.type,
            size: file.size,
            kind,
            dataUrl,
          })
        } catch (err) {
          toast.error("Failed to read file", {
            description: `Could not read ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
          })
        }
      }
      setAttachments((prev) => [...prev, ...newAttachments])
    }

    function handleRemoveAttachment(id: string) {
      setAttachments((prev) => prev.filter((a) => a.id !== id))
    }

    function handleSend() {
      if (!canSend) return
      const text = richInputRef.current?.getValue() ?? ""
      // Allow sending when attachments are present even if the text is empty.
      if (!text.trim() && attachments.length === 0) return
      const safeLevel =
        availableLevels.length &&
        !availableLevels.includes(selectedThinkingLevel)
          ? ((availableLevels[availableLevels.length - 1] ??
              "medium") as ThinkingLevel)
          : selectedThinkingLevel
      const effectiveThinkingLevel = selectedModel?.reasoning
        ? safeLevel
        : undefined
      onSend?.(
        text,
        selectedModel?.id ?? "",
        selectedModel?.provider ?? "",
        effectiveThinkingLevel,
        attachments.length > 0 ? attachments : undefined
      )
      // Append to history (skipping consecutive duplicates) and reset the
      // navigation cursor so the next ArrowUp starts from the newest message.
      // Empty text (attachment-only sends) is not recorded in history.
      const history = historyRef.current
      if (text.trim() && history[history.length - 1] !== text) {
        history.push(text)
        if (history.length > MAX_MESSAGE_HISTORY) {
          history.splice(0, history.length - MAX_MESSAGE_HISTORY)
        }
        writeMessageHistory(history)
      }
      historyCursorRef.current = null
      historyDraftRef.current = ""
      historyNavValueRef.current = ""
      richInputRef.current?.clear()
      setIsEmpty(true)
      setAttachments([])
      setAtMention(null)
      setSlashMention(null)
      richInputRef.current?.focus()
    }

    // Replace the input contents during history navigation, tracking the value
    // we wrote so a later edit can be detected.
    function applyHistoryValue(text: string) {
      historyNavValueRef.current = text
      if (text) {
        richInputRef.current?.setValue(text)
        setIsEmpty(text.trim().length === 0)
      } else {
        richInputRef.current?.clear()
        setIsEmpty(true)
        richInputRef.current?.focus()
      }
    }

    // Move through sent-message history. `canStart` gates beginning navigation
    // from a fresh (empty) input. Returns true when the key was consumed.
    function navigateHistory(dir: "prev" | "next", canStart: boolean): boolean {
      const history = historyRef.current
      if (history.length === 0) return false

      // If the user edited a recalled message, drop out of navigation mode so
      // their edit becomes the live draft.
      const current = richInputRef.current?.getValue() ?? ""
      if (
        historyCursorRef.current !== null &&
        current !== historyNavValueRef.current
      ) {
        historyCursorRef.current = null
      }

      if (historyCursorRef.current === null) {
        if (dir === "next") return false // nothing newer than the live draft
        if (!canStart) return false // don't hijack arrows mid-draft
        historyDraftRef.current = current
        historyCursorRef.current = history.length - 1
        applyHistoryValue(history[historyCursorRef.current]!)
        return true
      }

      if (dir === "prev") {
        if (historyCursorRef.current > 0) {
          historyCursorRef.current -= 1
          applyHistoryValue(history[historyCursorRef.current]!)
        }
        return true // consume even at the oldest entry
      }

      // dir === "next"
      historyCursorRef.current += 1
      if (historyCursorRef.current >= history.length) {
        historyCursorRef.current = null
        applyHistoryValue(historyDraftRef.current)
        return true
      }
      applyHistoryValue(history[historyCursorRef.current]!)
      return true
    }

    function handleInput() {
      const text = richInputRef.current?.getValue() ?? ""
      setIsEmpty(text.trim().length === 0)
    }

    function handleAtMentionChange(mention: AtMention | null) {
      if (!mention) {
        setAtMention(null)
        return
      }
      setAtMention((prev) => ({
        ...mention,
        selectedIndex:
          mention.filter !== prev?.filter ? 0 : (prev?.selectedIndex ?? 0),
      }))
    }

    function handleSlashMentionChange(mention: SlashMention | null) {
      if (!mention) {
        setSlashMention(null)
        return
      }
      setSlashMention((prev) => ({
        ...mention,
        selectedIndex:
          mention.filter !== prev?.filter ? 0 : (prev?.selectedIndex ?? 0),
      }))
    }

    function deleteSlashTrigger() {
      const current = slashMention
      if (!current?.textNode) return null
      const { textNode, startOffset, filter } = current
      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + 1 + filter.length)
      range.deleteContents()
      return range
    }

    function handleSelectItem(item: ChatSlashItem) {
      if (item.kind === "action") {
        const range = deleteSlashTrigger()
        if (range) {
          range.collapse(true)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
        }
        setSlashMention(null)
        const text = richInputRef.current?.getValue() ?? ""
        setIsEmpty(text.trim().length === 0)
        item.onSelect()
        return
      }

      const range = deleteSlashTrigger()
      if (!range) return

      const chip = buildSlashCommandChip(item.command)
      range.insertNode(chip)

      const space = document.createTextNode(" ")
      chip.after(space)

      const newRange = document.createRange()
      newRange.setStart(space, 1)
      newRange.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(newRange)

      setSlashMention(null)
      setIsEmpty(false)
      richInputRef.current?.focus()
    }

    function handleSelectFile(entry: WorkspaceEntry) {
      const current = atMention
      if (!current?.textNode) return
      const { textNode, startOffset, filter } = current
      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + 1 + filter.length)
      range.deleteContents()

      const chip = buildMentionChip(entry.path)
      range.insertNode(chip)

      const space = document.createTextNode(" ")
      chip.after(space)
      const newRange = document.createRange()
      newRange.setStart(space, 1)
      newRange.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(newRange)

      setAtMention(null)
      setIsEmpty(false)
      richInputRef.current?.focus()
    }

    const modeStyles = getModeOption(mode)
    const modeSendButton = modeStyles.sendButton
    const stopBinding = useShortcutBinding(SHORTCUT_ACTIONS.STOP_GENERATION)

    const showBranch = branch !== undefined
    const showApproval = Boolean(onApprovalModeChange)
    const showContextStrip = showBranch || showApproval || Boolean(contextLeading)

    return (
      <div className={cn("w-full", className)}>
        <div
          className={cn(
            "relative flex w-full flex-col rounded-2xl border border-border/70 bg-card shadow-sm",
            "transition-all duration-150 focus-within:border-border focus-within:shadow-md"
          )}
        >
          <SlashCommandDropdown
            groups={slashGroups}
            open={
              slashCommandOpen && (slashItems.length > 0 || commandsLoading)
            }
            isLoading={commandsLoading}
            selectedValue={
              slashItems.length > 0
                ? itemValue(
                    slashItems[
                      Math.min(
                        Math.max(slashMention?.selectedIndex ?? 0, 0),
                        slashItems.length - 1
                      )
                    ]!
                  )
                : undefined
            }
            noSkillsHint={noSkillsAvailable && filteredActions.length === 0}
            onSelect={handleSelectItem}
          />

          <FileMentionDropdown
            entries={mentionEntries2}
            open={
              fileMentionOpen && (mentionEntries2.length > 0 || filesLoading)
            }
            isLoading={filesLoading}
            selectedIndex={atMention?.selectedIndex ?? 0}
            onSelect={handleSelectFile}
          />

          {showContextStrip && (
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1">
              <div className="flex min-w-0 items-center gap-1">
                {contextLeading}
                {showBranch && (
                  <BranchSelector
                    branch={branch ?? null}
                    branches={branches}
                    onBranchSelect={onBranchSelect}
                    onGitError={onBranchError}
                    sessionId={sessionId}
                  />
                )}
              </div>
              {showApproval && (
                <ApprovalModeCombobox
                  selected={approvalMode}
                  onSelect={onApprovalModeChange!}
                />
              )}
            </div>
          )}

          <div className="px-3.5 pt-3 pb-1.5">
            <RichInput
              ref={richInputRef}
              placeholder={
                isLoading ? "Steer the agent — your message joins this run…" : placeholder
              }
              mentionActive={atMention !== null && mentionEntries2.length > 0}
              slashActive={
                slashMention !== null &&
                (slashItems.length > 0 || commandsLoading)
              }
              onAtMentionChange={handleAtMentionChange}
              onSlashMentionChange={handleSlashMentionChange}
              onSend={handleSend}
              onInput={handleInput}
              onPasteFiles={(files) => void handleAddFiles(files)}
              onMentionEnter={() => {
                const idx = atMention?.selectedIndex ?? 0
                const entry = mentionEntries2[idx]
                if (entry) handleSelectFile(entry)
              }}
              onSlashEnter={() => {
                const idx = slashMention?.selectedIndex ?? 0
                const item = slashItemsRef.current[idx]
                if (item) handleSelectItem(item)
              }}
              onArrowUp={() => {
                if (slashMention !== null) {
                  setSlashMention((prev) => {
                    if (!prev) return prev
                    const n = slashItemsRef.current.length
                    if (n === 0) return prev
                    return {
                      ...prev,
                      selectedIndex: (prev.selectedIndex - 1 + n) % n,
                    }
                  })
                } else {
                  setAtMention((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedIndex:
                            (prev.selectedIndex -
                              1 +
                              mentionEntries.current.length) %
                            mentionEntries.current.length,
                        }
                      : prev
                  )
                }
              }}
              onArrowDown={() => {
                if (slashMention !== null) {
                  setSlashMention((prev) => {
                    if (!prev) return prev
                    const n = slashItemsRef.current.length
                    if (n === 0) return prev
                    return {
                      ...prev,
                      selectedIndex: (prev.selectedIndex + 1) % n,
                    }
                  })
                } else {
                  setAtMention((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedIndex:
                            (prev.selectedIndex + 1) %
                            mentionEntries.current.length,
                        }
                      : prev
                  )
                }
              }}
              onEscape={() => {
                setAtMention(null)
                setSlashMention(null)
              }}
              onHistoryPrev={(atStart) => navigateHistory("prev", atStart)}
              onHistoryNext={() => navigateHistory("next", false)}
            />
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3.5 pb-1.5">
              {attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => handleRemoveAttachment(attachment.id)}
                />
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) void handleAddFiles(files)
              // Reset so selecting the same file again re-triggers onChange.
              e.target.value = ""
            }}
          />

          <div className="flex items-center justify-between gap-2 rounded-b-2xl px-2.5 pt-1 pb-2">
            <div className="flex items-center gap-0.5">
              {onModeChange && (
                <ModeCombobox selected={mode} onSelect={onModeChange} />
              )}
              <ModelCombobox
                groups={grouped}
                selected={selectedModel}
                onSelect={(compositeKey) => {
                  if (!isControlled) setInternalModelId(compositeKey)
                  onModelChange?.(compositeKey)
                }}
                disabled={models.length === 0}
              />

              {selectedModel?.reasoning && (
                <ThinkingCombobox
                  selected={selectedThinkingLevel}
                  onSelect={setThinkingLevel}
                  availableLevels={availableLevels}
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <ContextChart
                contextUsage={contextUsage}
                sessionId={sessionId}
                sessionStats={sessionStats}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Attach files"
                      onClick={() => fileInputRef.current?.click()}
                      className="size-7 text-muted-foreground hover:text-foreground"
                    >
                      <PaperclipIcon className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>
              {isLoading && !isEmpty ? (
                // While the agent runs, a non-empty submit steers the live turn.
                // The steer button replaces Stop so there's a single primary
                // action — Stop returns the moment the input is cleared.
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-lg"
                        onClick={handleSend}
                        aria-label="Send to running agent"
                        className={cn(
                          "aspect-square animate-in rounded-lg transition-colors duration-150 fade-in-0 zoom-in-90",
                          modeSendButton
                        )}
                      >
                        <ArrowUpIcon />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    Send — steers the running agent
                    <ShortcutKbd binding="enter" className="ml-1" />
                  </TooltipContent>
                </Tooltip>
              ) : isLoading ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-lg"
                        onClick={onStop}
                        disabled={isAborting}
                        aria-label="Stop generation"
                        className="aspect-square animate-in rounded-lg bg-destructive duration-150 fade-in-0 zoom-in-90 hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="h-3 w-3 rounded-sm bg-white" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {isAborting ? "Stopping…" : "Stop"}
                    {!isAborting && (
                      <ShortcutKbd binding={stopBinding} className="ml-1" />
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-lg"
                        onClick={handleSend}
                        disabled={!canSend}
                        aria-label="Send message"
                        className={cn(
                          "aspect-square animate-in rounded-lg transition-colors duration-150 fade-in-0 zoom-in-90",
                          modeSendButton
                        )}
                      >
                        <ArrowUpIcon />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    Send
                    <ShortcutKbd binding="enter" className="ml-1" />
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  })
)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment
  onRemove: () => void
}) {
  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-border/60 bg-card p-1.5 pr-2">
      {attachment.kind === "image" ? (
        <img
          src={attachment.dataUrl}
          alt={attachment.filename}
          className="size-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
          <FileTextIcon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
          {attachment.filename}
        </span>
        <span className="text-2xs text-muted-foreground">
          {formatBytes(attachment.size)}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Remove ${attachment.filename}`}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <XIcon className="size-2.5" />
      </button>
    </div>
  )
}
