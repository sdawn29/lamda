import * as React from "react"
import { memo } from "react"
import { ArrowUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useModels } from "@/queries/use-models"
import {
  useWorkspaceFiles,
  type WorkspaceEntry,
} from "@/queries/use-workspace-files"
import { BranchSelector } from "@/components/branch-selector"
import { ModelCombobox } from "@/components/model-combobox"
import {
  ThinkingCombobox,
  type ThinkingLevel,
} from "@/components/thinking-combobox"
import {
  RichInput,
  buildMentionChip,
  type RichInputHandle,
  type AtMention,
} from "@/components/rich-input"
import { FileMentionDropdown } from "@/components/file-mention-dropdown"

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
  sessionId?: string
  selectedModelId?: string | null
  onModelChange?: (modelId: string) => void
}

export const ChatTextbox = memo(function ChatTextbox({
  onSend,
  isLoading = false,
  onStop,
  placeholder = "Ask me to write, fix, or explain code… Use @ to mention files",
  className,
  branch,
  branches = [],
  onBranchSelect,
  sessionId,
  selectedModelId: controlledModelId,
  onModelChange,
}: ChatTextboxProps) {
  const [isEmpty, setIsEmpty] = React.useState(true)
  const [internalModelId, setInternalModelId] = React.useState<string | null>(
    null
  )
  const [thinkingLevel, setThinkingLevel] =
    React.useState<ThinkingLevel>("medium")
  const [atMention, setAtMention] = React.useState<
    (AtMention & { selectedIndex: number }) | null
  >(null)
  const mentionEntries = React.useRef<WorkspaceEntry[]>([])
  const isControlled = controlledModelId !== undefined
  const selectedModelId = isControlled ? controlledModelId : internalModelId
  const richInputRef = React.useRef<RichInputHandle>(null)

  const { data } = useModels()
  const models = React.useMemo(() => data?.models ?? [], [data])
  const selectedModel =
    models.find((m) => `${m.provider}::${m.id}` === selectedModelId) ??
    models[0] ??
    null

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

  const { data: fileData } = useWorkspaceFiles(sessionId)

  const mentionEntries2 = React.useMemo(() => {
    if (!atMention) return []
    const entries = fileData ?? []
    const f = atMention.filter.toLowerCase()
    return entries.filter((e) => e.path.toLowerCase().includes(f)).slice(0, 10)
  }, [fileData, atMention])
  mentionEntries.current = mentionEntries2

  const canSend = !isEmpty && !isLoading

  function handleSend() {
    if (!canSend) return
    const text = richInputRef.current?.getValue() ?? ""
    if (!text.trim()) return
    const effectiveThinkingLevel = selectedModel?.reasoning
      ? thinkingLevel
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
        <FileMentionDropdown
          entries={mentionEntries2}
          open={atMention !== null && mentionEntries2.length > 0}
          selectedIndex={atMention?.selectedIndex ?? 0}
          onSelect={handleSelectFile}
        />

        <div className="px-3 pt-3 pb-2">
          <RichInput
            ref={richInputRef}
            placeholder={placeholder}
            mentionActive={atMention !== null && mentionEntries2.length > 0}
            onAtMentionChange={handleAtMentionChange}
            onSend={handleSend}
            onInput={handleInput}
            onMentionEnter={() => {
              const idx = atMention?.selectedIndex ?? 0
              const entry = mentionEntries2[idx]
              if (entry) handleSelectFile(entry)
            }}
            onArrowUp={() =>
              setAtMention((prev) =>
                prev
                  ? {
                      ...prev,
                      selectedIndex:
                        (prev.selectedIndex - 1 + mentionEntries.current.length) %
                        mentionEntries.current.length,
                    }
                  : prev
              )
            }
            onArrowDown={() =>
              setAtMention((prev) =>
                prev
                  ? {
                      ...prev,
                      selectedIndex:
                        (prev.selectedIndex + 1) % mentionEntries.current.length,
                    }
                  : prev
              )
            }
            onEscape={() => setAtMention(null)}
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
              />
            )}
          </div>

          <div className="pr-0.5">
            {isLoading ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      onClick={onStop}
                      aria-label="Stop generation"
                      className="animate-in duration-150 fade-in-0 zoom-in-90 bg-destructive hover:bg-destructive/90"
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
                      className="animate-in duration-150 fade-in-0 zoom-in-90"
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
            sessionId={sessionId}
          />
        </div>
      )}
    </div>
  )
})
