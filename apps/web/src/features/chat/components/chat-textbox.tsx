import * as React from "react"
import { memo, forwardRef, useImperativeHandle } from "react"

export interface ChatTextboxHandle {
  setValue: (text: string) => void
  focus: () => void
}
import { ArrowUpIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  useModels,
  useSlashCommands,
  useContextUsage,
  type WorkspaceEntry,
} from "../queries"
import { useWorkspaceIndex } from "@/features/workspace/queries"
import { BranchSelector } from "@/features/git"
import { ModelCombobox } from "./model-combobox"
import { ThinkingCombobox, type ThinkingLevel } from "./thinking-combobox"
import {
  RichInput,
  buildMentionChip,
  buildSlashCommandChip,
  type RichInputHandle,
  type AtMention,
  type SlashMention,
} from "./rich-input"
import { FileMentionDropdown } from "./file-mention-dropdown"
import { SlashCommandDropdown } from "./slash-command-dropdown"
import { ContextChart } from "./context-chart"
import type { SessionStats, SlashCommand } from "../api"

interface ChatTextboxProps {
  onSend?: (
    message: string,
    modelId: string,
    provider: string,
    thinkingLevel?: string
  ) => void
  isLoading?: boolean
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
  sessionStats?: SessionStats | null
}

export const ChatTextbox = memo(
  forwardRef<ChatTextboxHandle, ChatTextboxProps>(function ChatTextbox(
    {
      onSend,
      isLoading = false,
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
      sessionStats,
    }: ChatTextboxProps,
    ref
  ) {
    const [isEmpty, setIsEmpty] = React.useState(true)
    const [internalModelId, setInternalModelId] = React.useState<string | null>(
      null
    )
    const [thinkingLevel, setThinkingLevel] =
      React.useState<ThinkingLevel>("medium")
    const [atMention, setAtMention] = React.useState<
      (AtMention & { selectedIndex: number }) | null
    >(null)
    const [slashMention, setSlashMention] = React.useState<
      (SlashMention & { selectedIndex: number }) | null
    >(null)
    const mentionEntries = React.useRef<WorkspaceEntry[]>([])
    const slashCommandsRef = React.useRef<SlashCommand[]>([])
    const isControlled = controlledModelId !== undefined
    const selectedModelId = isControlled ? controlledModelId : internalModelId
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

    const availableLevels = selectedModel?.thinkingLevels ?? []

    React.useEffect(() => {
      if (!availableLevels.length) return
      if (!availableLevels.includes(thinkingLevel)) {
        setThinkingLevel(
          (availableLevels[availableLevels.length - 1] ?? "medium") as ThinkingLevel
        )
      }
    }, [availableLevels])

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

    const filteredCommands = React.useMemo(() => {
      const commands = commandsData ?? []
      if (!slashMention) return commands.slice(0, 12)
      const f = slashMention.filter.toLowerCase()
      if (!f) return commands.slice(0, 12)
      return commands
        .filter(
          (c) =>
            c.name.toLowerCase().includes(f) ||
            c.description?.toLowerCase().includes(f)
        )
        .slice(0, 12)
    }, [commandsData, slashMention])
    slashCommandsRef.current = filteredCommands

    const canSend = !isEmpty && !isLoading

    function handleSend() {
      if (!canSend) return
      const text = richInputRef.current?.getValue() ?? ""
      if (!text.trim()) return
      const safeLevel =
        availableLevels.length && !availableLevels.includes(thinkingLevel)
          ? ((availableLevels[availableLevels.length - 1] ?? "medium") as ThinkingLevel)
          : thinkingLevel
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

    function handleSelectCommand(cmd: SlashCommand) {
      const current = slashMention
      if (!current?.textNode) return
      const { textNode, startOffset, filter } = current
      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + 1 + filter.length)
      range.deleteContents()

      const chip = buildSlashCommandChip(cmd)
      range.insertNode(chip)

      const space = document.createTextNode(" ")
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

      const space = document.createTextNode(" ")
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

    return (
      <div className={cn("flex w-full flex-col gap-1", className)}>
        <div className="relative flex w-full flex-col rounded-2xl border border-input bg-card shadow-sm transition-all focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <SlashCommandDropdown
            commands={filteredCommands}
            open={
              slashCommandOpen &&
              (filteredCommands.length > 0 || commandsLoading)
            }
            isLoading={commandsLoading}
            selectedIndex={slashMention?.selectedIndex ?? 0}
            onSelect={handleSelectCommand}
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

          <div className="px-3 pt-2 pb-1">
            <RichInput
              ref={richInputRef}
              placeholder={placeholder}
              mentionActive={atMention !== null && mentionEntries2.length > 0}
              slashActive={
                slashMention !== null &&
                (filteredCommands.length > 0 || commandsLoading)
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
                const cmd = slashCommandsRef.current[idx]
                if (cmd) handleSelectCommand(cmd)
              }}
              onArrowUp={() => {
                if (slashMention !== null) {
                  setSlashMention((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedIndex:
                            (prev.selectedIndex -
                              1 +
                              slashCommandsRef.current.length) %
                            slashCommandsRef.current.length,
                        }
                      : prev
                  )
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
                  setSlashMention((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedIndex:
                            (prev.selectedIndex + 1) %
                            slashCommandsRef.current.length,
                        }
                      : prev
                  )
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

          <div className="mx-3 border-t border-border/50" />

          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-0.5">
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
                  selected={thinkingLevel}
                  onSelect={setThinkingLevel}
                  availableLevels={availableLevels}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5 pr-0.5">
              <ContextChart contextUsage={contextUsage} sessionId={sessionId} sessionStats={sessionStats} />
              {isLoading ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        onClick={onStop}
                        aria-label="Stop generation"
                        className="rounded-full animate-in bg-destructive duration-150 fade-in-0 zoom-in-90 hover:bg-destructive/90 aspect-square"
                      >
                        <div className="h-2.5 w-2.5 rounded-sm bg-white" />
                      </Button>
                    }
                  />
                  <TooltipContent>Stop</TooltipContent>
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
                        className="rounded-full animate-in duration-150 fade-in-0 zoom-in-90 aspect-square"
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
