import * as React from "react"
import { memo, forwardRef, useImperativeHandle } from "react"

export interface ChatComposerHandle {
  getValue: () => string
  setValue: (text: string) => void
  focus: () => void
}
import {
  ArrowUpIcon,
  BrainIcon,
  ChartColumnIcon,
  EraserIcon,
  FileTextIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  HelpCircleIcon,
  HistoryIcon,
  MinimizeIcon,
  MoonIcon,
  PaperclipIcon,
  PanelRightIcon,
  PlugIcon,
  PlusIcon,
  SettingsIcon,
  StopCircleIcon,
  SunIcon,
  TerminalSquareIcon,
  VariableIcon,
  XIcon,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { Kbd, ShortcutKbd } from "@/shared/ui/kbd"
import {
  useShortcutBinding,
  useRunShortcutAction,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import {
  useModels,
  useSlashCommands,
  useWorkspaceSlashCommands,
  useContextUsage,
  chatKeys,
  type WorkspaceEntry,
} from "../queries"
import {
  useAgents,
  useWorkspaceIndex,
  useModes,
} from "@/features/workspace/queries"
import type { AgentDto } from "@/features/workspace/api"
import { useEnvDialog, useWorkspace } from "@/features/workspace"
import { useGitStatus, statusLabel } from "@/features/git"
import { buildChangedFileMap } from "../file-chip-context"
import { useMainTabsStore } from "@/features/main-tabs"
import { ModelCombobox } from "./model-combobox"
import { ModeCombobox, getModeOption, modeOptionFromDto } from "./mode-combobox"
import { ApprovalModeCombobox } from "./approval-mode-combobox"
import { ModeToolsDialog } from "./mode-tools-dialog"
import { ThinkingCombobox, type ThinkingLevel } from "./thinking-combobox"
export type { ThinkingLevel } from "./thinking-combobox"
import {
  useComposerPrefsStore,
  MAX_MESSAGE_HISTORY,
} from "../composer-prefs-store"
import type { Mode, ApprovalMode } from "@/features/workspace/api"
import {
  RichInput,
  buildAgentMentionChip,
  buildMentionChip,
  buildSlashCommandChip,
  type RichInputHandle,
  type AgentMention,
  type AtMention,
  type SlashMention,
} from "./rich-input"
import { AgentMentionDropdown } from "./agent-mention-dropdown"
import { FileMentionDropdown, type MentionEntry } from "./file-mention-dropdown"
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
  initialValue?: string
  initialValueKey?: string
  onValueChange?: (value: string) => void
  className?: string
  /** Overrides the textbox's default idle height — e.g. a taller hero textbox on the new-thread page. */
  inputMinHeightClassName?: string
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
}

export const ChatComposer = memo(
  forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
    {
      onSend,
      isLoading = false,
      isAborting = false,
      onStop,
      placeholder = "Ask anything @ files, # subagents, / commands",
      initialValue,
      initialValueKey,
      onValueChange,
      className,
      inputMinHeightClassName,
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
    const [agentMention, setAgentMention] = React.useState<
      (AgentMention & { selectedIndex: number }) | null
    >(null)
    const [attachments, setAttachments] = React.useState<PendingAttachment[]>(
      []
    )
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const mentionEntries = React.useRef<MentionEntry[]>([])
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
    const openMemory = React.useCallback(() => {
      navigate({ to: "/settings/$section", params: { section: "memory" } })
    }, [navigate])
    const openMcp = React.useCallback(() => {
      navigate({ to: "/settings/$section", params: { section: "mcp" } })
    }, [navigate])
    const openEnvDialog = useEnvDialog((s) => s.openEnvDialog)
    const runAction = useRunShortcutAction()
    const { resolvedTheme, setTheme } = useTheme()
    const selectedModelId = isControlled ? controlledModelId : internalModelId
    const selectedThinkingLevel = isThinkingControlled
      ? controlledThinkingLevel
      : thinkingLevel
    const richInputRef = React.useRef<RichInputHandle>(null)
    const appliedInitialValueRef = React.useRef<
      { key: string | undefined; value: string } | undefined
    >(undefined)
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
    // UI indicator describing the active history-navigation position. `null`
    // when showing the live draft (no badge shown). `position` is 1-based from
    // the newest entry, `total` is the number of recallable messages.
    const [historyNav, setHistoryNav] = React.useState<{
      position: number
      total: number
    } | null>(null)
    // Reconcile the visible indicator with the navigation cursor. Called after
    // every navigation step and whenever the user drops out of history mode.
    const syncHistoryIndicator = React.useCallback(() => {
      const cursor = historyCursorRef.current
      if (cursor === null) {
        setHistoryNav(null)
        return
      }
      const total = historyRef.current.length
      setHistoryNav({ position: total - cursor, total })
    }, [])

    useImperativeHandle(ref, () => ({
      getValue() {
        return richInputRef.current?.getValue() ?? ""
      },
      setValue(text: string) {
        richInputRef.current?.setValue(text)
        setIsEmpty(text.trim().length === 0)
        onValueChange?.(text)
      },
      focus() {
        richInputRef.current?.focus()
      },
    }))

    React.useEffect(() => {
      if (initialValue === undefined) return
      const applied = appliedInitialValueRef.current
      if (
        applied &&
        applied.key === initialValueKey &&
        applied.value === initialValue
      ) {
        return
      }
      appliedInitialValueRef.current = {
        key: initialValueKey,
        value: initialValue,
      }

      if ((richInputRef.current?.getValue() ?? "") === initialValue) return
      if (initialValue) {
        richInputRef.current?.setValue(initialValue)
      } else {
        richInputRef.current?.clear()
      }
      setIsEmpty(initialValue.trim().length === 0)
    }, [initialValue, initialValueKey])

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
    const agentMentionOpen = agentMention !== null

    const { data: indexedFiles, isLoading: filesLoading } = useWorkspaceIndex(
      workspaceId,
      fileMentionOpen
    )
    const { data: modeData } = useModes(workspaceId)
    const modeList = React.useMemo(() => modeData ?? [], [modeData])
    const { data: agentData, isLoading: agentsLoading } = useAgents(workspaceId)
    const availableAgents = React.useMemo(() => {
      const agents = agentData ?? []
      const activeMode = modeList.find((entry) => entry.id === mode)
      if (!activeMode || !activeMode.tools.includes("delegate")) return []
      const allowed = activeMode.agents
      const filtered =
        allowed === null
          ? agents
          : agents.filter((agent) => allowed.includes(agent.id))
      if (!agentMention) return filtered
      const query = agentMention.filter.toLowerCase()
      if (!query) return filtered
      return filtered.filter(
        (agent) =>
          agent.id.toLowerCase().includes(query) ||
          agent.label.toLowerCase().includes(query) ||
          agent.description.toLowerCase().includes(query)
      )
    }, [agentData, agentMention, mode, modeList])
    const activeModeLabel =
      modeList.find((entry) => entry.id === mode)?.label ?? mode
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
    const { data: workspaceCommandsData, isLoading: workspaceCommandsLoading } =
      useWorkspaceSlashCommands(
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

    // Section inputs for the @-mention dropdown: currently open file tabs and
    // the working tree's changed files. Sectioning happens here in the data
    // layer (not in the dropdown) so the flat index the keyboard navigation
    // walks matches the visual order of the sections.
    const { workspaces } = useWorkspace()
    const workspacePath = workspaces.find((w) => w.id === workspaceId)?.path
    const { data: gitStatusData } = useGitStatus(sessionId ?? "")
    const changedFiles = React.useMemo(
      () => buildChangedFileMap(gitStatusData?.raw ?? ""),
      [gitStatusData?.raw]
    )
    const mainTabs = useMainTabsStore((s) => s.tabs)
    // Workspace-relative paths of files open as main tabs.
    const openTabPaths = React.useMemo(() => {
      const paths = new Set<string>()
      const root = workspacePath?.replace(/\/$/, "")
      for (const tab of mainTabs) {
        if (tab.type !== "file") continue
        const tabRoot = (tab.workspacePath ?? root)?.replace(/\/$/, "")
        if (tabRoot && tab.filePath.startsWith(`${tabRoot}/`)) {
          paths.add(tab.filePath.slice(tabRoot.length + 1))
        }
      }
      return paths
    }, [mainTabs, workspacePath])

    const mentionEntries2 = React.useMemo((): MentionEntry[] => {
      if (!atMention) return []
      const entries = fileData ?? []
      const f = atMention.filter.toLowerCase()
      const matched = entries.filter((e) => e.path.toLowerCase().includes(f))

      // Bucket into Open / Changed / Files, preserving the existing ranking
      // within each bucket. The concatenated order is exactly what both the
      // dropdown sections and the arrow-key selectedIndex iterate over.
      const open: MentionEntry[] = []
      const changed: MentionEntry[] = []
      const rest: MentionEntry[] = []
      for (const e of matched) {
        const changedFile =
          e.type === "file" ? changedFiles.get(e.path) : undefined
        const label = changedFile ? statusLabel(changedFile) : undefined
        if (e.type === "file" && openTabPaths.has(e.path)) {
          open.push({ ...e, section: "open", statusLabel: label })
        } else if (changedFile) {
          changed.push({ ...e, section: "changed", statusLabel: label })
        } else {
          rest.push({ ...e, section: "files" })
        }
      }
      return [...open, ...changed, ...rest].slice(0, 10)
    }, [fileData, atMention, changedFiles, openTabPaths])
    mentionEntries.current = mentionEntries2

    // Built-in action commands. Each runs immediately when selected (no chip
    // is inserted). Items are conditionally included based on context.
    const actions = React.useMemo<ChatSlashAction[]>(() => {
      const list: ChatSlashAction[] = []

      if (onModeChange) {
        for (const dto of modeList) {
          if (dto.id === mode) continue
          const option = modeOptionFromDto(dto)
          list.push({
            kind: "action",
            name: dto.id,
            description: `Switch to ${dto.label} mode`,
            icon: option.Icon,
            onSelect: () => onModeChange(dto.id),
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

      list.push({
        kind: "action",
        name: "new-workspace",
        description: "Add a new workspace",
        icon: FolderPlusIcon,
        onSelect: () => runAction(SHORTCUT_ACTIONS.NEW_WORKSPACE),
      })

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
            onValueChange?.("")
          },
        })
      }

      list.push({
        kind: "action",
        name: "terminal",
        description: "Toggle the terminal panel",
        icon: TerminalSquareIcon,
        onSelect: () => runAction(SHORTCUT_ACTIONS.TOGGLE_TERMINAL),
      })

      list.push({
        kind: "action",
        name: "files",
        description: "Toggle the file tree panel",
        icon: FolderTreeIcon,
        onSelect: () => runAction(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE),
      })

      list.push({
        kind: "action",
        name: "review",
        description: "Toggle the review panel",
        icon: PanelRightIcon,
        onSelect: () => runAction(SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL),
      })

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
        name: "memory",
        description: "Open the memory page",
        icon: BrainIcon,
        onSelect: openMemory,
      })

      list.push({
        kind: "action",
        name: "mcp",
        description: "Open the MCP servers page",
        icon: PlugIcon,
        onSelect: openMcp,
      })

      if (workspaceId) {
        list.push({
          kind: "action",
          name: "env",
          description: "Edit workspace environment variables",
          icon: VariableIcon,
          onSelect: () => openEnvDialog(workspaceId),
        })
      }

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
      onValueChange,
      mode,
      modeList,
      onModeChange,
      navigate,
      queryClient,
      openPalette,
      openSettings,
      openUsage,
      openMemory,
      openMcp,
      openEnvDialog,
      resolvedTheme,
      setTheme,
      runAction,
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
      setHistoryNav(null)
      richInputRef.current?.clear()
      setIsEmpty(true)
      onValueChange?.("")
      setAttachments([])
      setAtMention(null)
      setSlashMention(null)
      setAgentMention(null)
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
      onValueChange?.(text)
    }

    // Leave history navigation, restoring the draft that was in the input when
    // navigation began. Returns true if we were navigating (Escape consumed).
    function exitHistory(): boolean {
      if (historyCursorRef.current === null) return false
      applyHistoryValue(historyDraftRef.current)
      historyCursorRef.current = null
      setHistoryNav(null)
      return true
    }

    // Move through sent-message history, then refresh the on-screen indicator
    // so it tracks the cursor (and disappears when we return to the draft).
    function navigateHistory(dir: "prev" | "next", canStart: boolean): boolean {
      const consumed = runHistoryNavigation(dir, canStart)
      syncHistoryIndicator()
      return consumed
    }

    // Move through sent-message history. `canStart` gates beginning navigation
    // from a fresh (empty) input. Returns true when the key was consumed.
    function runHistoryNavigation(
      dir: "prev" | "next",
      canStart: boolean
    ): boolean {
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
      onValueChange?.(text)
      // If the user edits a recalled message, leave history mode so their edit
      // becomes the live draft and the indicator clears immediately.
      if (
        historyCursorRef.current !== null &&
        text !== historyNavValueRef.current
      ) {
        historyCursorRef.current = null
        setHistoryNav(null)
      }
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

    function handleAgentMentionChange(mention: AgentMention | null) {
      if (!mention) {
        setAgentMention(null)
        return
      }
      setAgentMention((prev) => ({
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
        onValueChange?.(text)
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
      onValueChange?.(richInputRef.current?.getValue() ?? "")
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
      onValueChange?.(richInputRef.current?.getValue() ?? "")
      richInputRef.current?.focus()
    }

    function handleSelectAgent(agent: AgentDto) {
      const current = agentMention
      if (!current?.textNode) return
      const { textNode, startOffset, filter } = current
      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + 1 + filter.length)
      range.deleteContents()

      const chip = buildAgentMentionChip(agent)
      range.insertNode(chip)

      const space = document.createTextNode(" ")
      chip.after(space)
      const newRange = document.createRange()
      newRange.setStart(space, 1)
      newRange.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(newRange)

      setAgentMention(null)
      setIsEmpty(false)
      onValueChange?.(richInputRef.current?.getValue() ?? "")
      richInputRef.current?.focus()
    }

    const modeStyles = getModeOption(mode, modeList)
    const modeSendButton = modeStyles.sendButton
    const stopBinding = useShortcutBinding(SHORTCUT_ACTIONS.STOP_GENERATION)

    const showApproval = Boolean(onApprovalModeChange)

    return (
      <div className={cn("w-full", className)}>
        <div
          className={cn(
            "relative flex w-full flex-col rounded-2xl border border-border/50 bg-muted/40",
            "transition-colors duration-150 focus-within:border-primary/40"
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

          <AgentMentionDropdown
            agents={availableAgents}
            open={agentMentionOpen}
            isLoading={agentsLoading}
            selectedIndex={agentMention?.selectedIndex ?? 0}
            modeLabel={activeModeLabel}
            onSelect={handleSelectAgent}
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

          <div className="mx-1 my-1 flex flex-col">
            {historyNav && (
              <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 font-medium">
                  <HistoryIcon className="size-3" />
                  History
                  <span className="text-foreground/80 tabular-nums">
                    {historyNav.position}/{historyNav.total}
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-muted-foreground/70 sm:flex">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <span>navigate</span>
                  <Kbd className="ml-1">Esc</Kbd>
                  <span>exit</span>
                </span>
              </div>
            )}
            <div className="px-2 py-1.5">
              <RichInput
                ref={richInputRef}
                placeholder={
                  isLoading
                    ? "Steer the agent — your message joins this run"
                    : placeholder
                }
                minHeightClassName={inputMinHeightClassName}
                mentionActive={atMention !== null && mentionEntries2.length > 0}
                slashActive={
                  slashMention !== null &&
                  (slashItems.length > 0 || commandsLoading)
                }
                agentActive={
                  agentMention !== null && availableAgents.length > 0
                }
                onAtMentionChange={handleAtMentionChange}
                onSlashMentionChange={handleSlashMentionChange}
                onAgentMentionChange={handleAgentMentionChange}
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
                onAgentEnter={() => {
                  const idx = agentMention?.selectedIndex ?? 0
                  const agent = availableAgents[idx]
                  if (agent) handleSelectAgent(agent)
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
                  } else if (agentMention !== null) {
                    setAgentMention((prev) => {
                      if (!prev) return prev
                      const n = availableAgents.length
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
                  } else if (agentMention !== null) {
                    setAgentMention((prev) => {
                      if (!prev) return prev
                      const n = availableAgents.length
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
                  exitHistory()
                  setAtMention(null)
                  setSlashMention(null)
                  setAgentMention(null)
                }}
                onHistoryPrev={(atStart) => navigateHistory("prev", atStart)}
                onHistoryNext={() => navigateHistory("next", false)}
              />
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pb-1.5">
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

            <div className="@container/composer-controls flex items-center justify-between gap-2 px-1.5 pb-1.5">
              <div className="flex min-w-0 items-center gap-0.5">
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
                {onModeChange && (
                  <>
                    <ModeCombobox
                      selected={mode}
                      onSelect={onModeChange}
                      modes={modeList}
                    />
                    <ModeToolsDialog
                      mode={modeList.find((item) => item.id === mode)}
                      workspaceId={workspaceId}
                    />
                  </>
                )}
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2">
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
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Attach files"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <PaperclipIcon className="size-3.5" />
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
                          size="icon"
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
                          size="icon"
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
                      {isAborting ? "Stopping" : "Stop"}
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
                          size="icon"
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

        {showApproval && (
          <div className="mt-1.5 flex w-full justify-end">
            <ApprovalModeCombobox
              selected={approvalMode}
              onSelect={onApprovalModeChange!}
            />
          </div>
        )}
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
        className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
      >
        <XIcon className="size-2.5" />
      </button>
    </div>
  )
}
