import * as React from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useModels } from "@/queries/use-models"

interface ChatTextboxProps {
  onSend?: (message: string, modelId: string, provider: string) => void
  isLoading?: boolean
  onStop?: () => void
  placeholder?: string
  className?: string
  footerLabel?: string
  selectedModelId?: string | null
  onModelChange?: (modelId: string) => void
}

export function ChatTextbox({
  onSend,
  isLoading = false,
  onStop,
  placeholder = "Ask anything…",
  className,
  footerLabel,
  selectedModelId: controlledModelId,
  onModelChange,
}: ChatTextboxProps) {
  const [value, setValue] = React.useState("")
  const [internalModelId, setInternalModelId] = React.useState<string | null>(null)
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
          <Select
            value={selectedModel?.id ?? ""}
            onValueChange={(id) => {
              if (!isControlled) setInternalModelId(id)
              onModelChange?.(id)
            }}
            disabled={models.length === 0}
          >
            <SelectTrigger className="h-6 w-auto min-w-40 border-none px-2 py-0 text-xs shadow-none focus:ring-0">
              {selectedModel?.name ?? "Select model"}
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {grouped.map(([provider, items]) => (
                <SelectGroup key={provider}>
                  <SelectLabel>{provider}</SelectLabel>
                  {items.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {isLoading ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={onStop}
                    aria-label="Stop generation"
                  >
                    <SquareIcon />
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
      {footerLabel && (
        <span className="truncate py-2 text-xs text-muted-foreground">
          {footerLabel}
        </span>
      )}
    </div>
  )
}
