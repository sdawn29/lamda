import * as React from "react"
import { memo, forwardRef, useImperativeHandle } from "react"

export interface ChatTextboxHandle {
  setValue: (text: string) => void
  focus: () => void
}
import {
  ArrowUpIcon,
  BotIcon,
  EraserIcon,
  HelpCircleIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  MinimizeIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  StopCircleIcon,
  SunIcon,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  useModels,
  useSlashCommands,
  useContextUsage,
  chatKeys,
  type WorkspaceEntry,
} from "../queries"
import { useWorkspaceIndex } from "@/features/workspace/queries"
import { BranchSelector } from "@/features/git"
import { ModelCombobox } from "./model-combobox"
import { ModeCombobox, getModeOption } from "./mode-combobox"
import { ThinkingCombobox, type ThinkingLevel } from "./thinking-combobox"
export type { ThinkingLevel } from "./thinking-combobox"
import type { Mode } from "@/features/workspace/api"
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
import { useSettingsModal } from "@/features/settings"
import { useTheme } from "@/shared/components/theme-provider"

const THINKING_LEVEL_STORAGE_KEY = "chat:thinking_level"
const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const

function readStoredThinkingLevel(): ThinkingLevel {
  try {
    const v = window.localStorage.getItem(THINKING_LEVEL_STORAGE_KEY)
    if (v && (THINKING_LEVELS as readonly string[]).includes(v)) {
      return v as ThinkingLevel
    }
  } catch {
    // localStorage may be unavailable (SSR / private mode) — fall through.
  }
  return "medium"
}

interface ChatTextboxProps {
  onSend?: (
    message: string,
    modelId: string,
    provider: string,
    thinkingLevel?: string
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
  sessionStats?: SessionStats | null
}

export const ChatTextbox = memo(
  forwardRef<ChatTextboxHandle, ChatTextboxProps>(function ChatTextbox(
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
      mode = "code",
      onModeChange,
      sessionStats,
    }: ChatTextboxProps,
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
        try {
          window.localStorage.setItem(THINKING_LEVEL_STORAGE_KEY, level)
        } catch {
          // localStorage may be unavailable (private mode / disabled) — ignore.
        }
      },
      [onThinkingLevelChange]
    )
    const [atMention, setAtMention] = React.useState<
      (AtMention & { selectedIndex: number }) | null
    >(null)
    const [slashMention, setSlashMention] = React.useState<
      (SlashMention & { selectedIndex: number }) | null
    >(null)
    const mentionEntries = React.useRef<WorkspaceEntry[]>([])
    const slashItemsRef = React.useRef<ChatSlashItem[]>([])
    const isControlled = controlledModelId !== undefined
    const isThinkingControlled = controlledThinkingLevel !== undefined

    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const openPalette = useCommandPalette((s) => s.openPalette)
    const openSettings = useSettingsModal((s) => s.openSettings)
    const { resolvedTheme, setTheme } = useTheme()
    const selectedModelId = isControlled ? controlledModelId : internalModelId
    const selectedThinkingLevel = isThinkingControlled
      ? controlledThinkingLevel
      : thinkingLevel
    const richInputRef = React.useRef<RichInputHandle>(null)

    useImperativeHandle(ref, () => ({
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
    const {
      data: commandsData,
      isLoading: commandsLoading,
      refetch: refetchSlashCommands,
    } = useSlashCommands(sessionId, slashCommandOpen)

    // Re-fetch skills / prompt-templates every time the slash-command dropdown
    // opens (i.e. every time the user types "/" into the input).
    const prevSlashCommandOpen = React.useRef(false)
    React.useEffect(() => {
      if (slashCommandOpen && !prevSlashCommandOpen.current) {
        void refetchSlashCommands()
      }
      prevSlashCommandOpen.current = slashCommandOpen
    }, [slashCommandOpen, refetchSlashCommands])
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
            mode: "code",
            name: "code",
            description: "Switch to Code mode",
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

    const canSend = !isEmpty && !isLoading

    function handleSend() {
      if (!canSend) return
      const text = richInputRef.current?.getValue() ?? ""
      if (!text.trim()) return
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
        effectiveThinkingLevel
      )
      richInputRef.current?.clear()
      setIsEmpty(true)
      setAtMention(null)
      setSlashMention(null)
      richInputRef.current?.focus()
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

    return (
      <div className={cn("flex w-full flex-col gap-1", className)}>
        <div className="relative flex w-full flex-col rounded-2xl border border-input bg-card shadow-sm transition-colors">
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

          <div className="px-2 pt-2 pb-1">
            <RichInput
              ref={richInputRef}
              placeholder={placeholder}
              mentionActive={atMention !== null && mentionEntries2.length > 0}
              slashActive={
                slashMention !== null &&
                (slashItems.length > 0 || commandsLoading)
              }
              onAtMentionChange={handleAtMentionChange}
              onSlashMentionChange={handleSlashMentionChange}
              onSend={handleSend}
              onInput={handleInput}
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
            />
          </div>

          <div className="mx-2 border-t border-border/50" />

          <div className="flex items-center justify-between px-1.5 py-1.5">
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

            <div className="flex items-center gap-1.5 pr-0.5">
              <ContextChart
                contextUsage={contextUsage}
                sessionId={sessionId}
                sessionStats={sessionStats}
              />
              {isLoading ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        onClick={onStop}
                        disabled={isAborting}
                        aria-label="Stop generation"
                        className="aspect-square animate-in rounded-full bg-destructive duration-150 fade-in-0 zoom-in-90 hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="h-2.5 w-2.5 rounded-sm bg-white" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {isAborting ? "Stopping…" : "Stop"}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        onClick={handleSend}
                        disabled={!canSend}
                        aria-label="Send message"
                        className={cn(
                          "aspect-square animate-in rounded-full transition-colors duration-150 fade-in-0 zoom-in-90",
                          modeSendButton
                        )}
                      >
                        <ArrowUpIcon />
                      </Button>
                    }
                  />
                  <TooltipContent>Send</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        {branch !== undefined && (
          <div className="flex items-center gap-1 py-1">
            <BranchSelector
              branch={branch ?? null}
              branches={branches}
              onBranchSelect={onBranchSelect}
              onGitError={onBranchError}
              sessionId={sessionId}
            />
          </div>
        )}
      </div>
    )
  })
)
