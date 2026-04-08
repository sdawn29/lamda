import * as React from "react"
import { memo } from "react"
import { ArrowUpIcon, ChevronsUpDownIcon, SquareIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useModels } from "@/queries/use-models"
import { BranchSelector } from "@/components/branch-selector"

type ModelGroup = [string, { id: string; name: string; provider: string }[]][]

function ModelCombobox({
  groups,
  selected,
  onSelect,
  disabled,
}: {
  groups: ModelGroup
  selected: { id: string; name: string } | null
  onSelect: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const filtered: ModelGroup = groups
    .map(([provider, items]) => [
      provider,
      items.filter(
        (m) =>
          !query ||
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          provider.toLowerCase().includes(query.toLowerCase())
      ),
    ] as [string, typeof items])
    .filter(([, items]) => items.length > 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <span>{selected?.name ?? "Select model"}</span>
        <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="border-b border-foreground/10 px-2 py-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No models found
              </p>
            ) : (
              filtered.map(([provider, items]) => (
                <div key={provider}>
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {provider}
                  </p>
                  {items.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelect(m.id)
                        setOpen(false)
                        setQuery("")
                      }}
                      className={cn(
                        "flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-foreground/8",
                        selected?.id === m.id && "font-medium text-foreground"
                      )}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ChatTextboxProps {
  onSend?: (message: string, modelId: string, provider: string) => void
  isLoading?: boolean
  onStop?: () => void
  placeholder?: string
  className?: string
  workspaceName?: string
  branch?: string | null
  branches?: string[]
  onBranchSelect?: (branch: string) => void
  selectedModelId?: string | null
  onModelChange?: (modelId: string) => void
}

export const ChatTextbox = memo(function ChatTextbox({
  onSend,
  isLoading = false,
  onStop,
  placeholder = "Ask anything…",
  className,
  workspaceName,
  branch,
  branches = [],
  onBranchSelect,
  selectedModelId: controlledModelId,
  onModelChange,
}: ChatTextboxProps) {
  const [value, setValue] = React.useState("")
  const [internalModelId, setInternalModelId] = React.useState<string | null>(
    null
  )
  const isControlled = controlledModelId !== undefined
  const selectedModelId = isControlled ? controlledModelId : internalModelId
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const { data } = useModels()
  const models = React.useMemo(() => data?.models ?? [], [data])
  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? models[0] ?? null

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

  const canSend = value.trim().length > 0 && !isLoading

  function handleSend() {
    if (!canSend) return
    onSend?.(
      value.trim(),
      selectedModel?.id ?? "",
      selectedModel?.provider ?? ""
    )
    setValue("")
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <div className="relative flex w-full flex-col gap-2 rounded-xl border border-input bg-card p-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="border-none bg-card px-0 py-0 shadow-none ring-0 outline-none focus-visible:border-none focus-visible:ring-0 dark:bg-card"
        />

        <div className="flex items-center justify-between">
          <ModelCombobox
            groups={grouped}
            selected={selectedModel}
            onSelect={(id) => {
              if (!isControlled) setInternalModelId(id)
              onModelChange?.(id)
            }}
            disabled={models.length === 0}
          />

          <div className="transition-[transform,opacity] duration-150">
            {isLoading ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={onStop}
                      aria-label="Stop generation"
                      className="animate-in fade-in-0 zoom-in-90 duration-150"
                    >
                      <SquareIcon className="animate-pulse" />
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
                      className="animate-in fade-in-0 zoom-in-90 duration-150"
                    >
                      <ArrowUpIcon className="transition-transform duration-150 group-hover/button:scale-110" />
                    </Button>
                  }
                />
                <TooltipContent>Send</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {(workspaceName || branch !== undefined) && (
        <div className="flex items-center gap-1 py-1">
          {workspaceName && (
            <span className="truncate text-xs text-muted-foreground">
              {workspaceName}
            </span>
          )}
          {workspaceName && branch !== undefined && (
            <span className="text-xs text-muted-foreground">/</span>
          )}
          {branch !== undefined && (
            <BranchSelector
              branch={branch ?? null}
              branches={branches}
              onBranchSelect={onBranchSelect}
            />
          )}
        </div>
      )}
    </div>
  )
})
