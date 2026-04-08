import * as React from "react"
import { memo } from "react"
import {
  ArrowUpIcon,
  BrainIcon,
  ChevronsUpDownIcon,
  SquareIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useModels } from "@/queries/use-models"
import { BranchSelector } from "@/components/branch-selector"

type ModelGroup = [
  string,
  { id: string; name: string; provider: string; reasoning: boolean }[],
][]

type ThinkingLevel = "low" | "medium" | "high" | "xhigh"

const THINKING_LEVELS: {
  value: ThinkingLevel
  label: string
  icon: React.ReactNode
}[] = [
  {
    value: "low",
    label: "Low",
    icon: <BrainIcon className="size-3.5 shrink-0" strokeWidth={1} />,
  },
  {
    value: "medium",
    label: "Med",
    icon: <BrainIcon className="size-3.5 shrink-0" strokeWidth={1.5} />,
  },
  {
    value: "high",
    label: "High",
    icon: <BrainIcon className="size-3.5 shrink-0" strokeWidth={2.5} />,
  },
  {
    value: "xhigh",
    label: "Max",
    icon: <BrainIcon className="size-3.5 shrink-0" strokeWidth={3} />,
  },
]

// Maps provider IDs → { label, icon }
const PROVIDER_META: Record<string, { label: string; icon: React.ReactNode }> =
  {
    anthropic: {
      label: "Anthropic",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.732-4.355h5.698l-1.853-4.584-3.19 8.063H6.57L10.173 3.52z" />
        </svg>
      ),
    },
    openai: {
      label: "OpenAI",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
        </svg>
      ),
    },
    google: {
      label: "Google",
      icon: (
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ),
    },
    mistral: {
      label: "Mistral",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current text-orange-500"
          aria-hidden
        >
          <path d="M0 0h4v4H0zm6.667 0h4v4h-4zM0 6.667h4v4H0zm6.667 0h4v4h-4zm6.666 0h4v4h-4zM0 13.333h4v4H0zm6.667 0h4v4h-4zm6.666 0h4v4h-4zm6.667 0h4v4h-4zM13.333 0h4v4h-4zm6.667 0h4v4h-4z" />
        </svg>
      ),
    },
    groq: {
      label: "Groq",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current text-red-500"
          aria-hidden
        >
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4a8 8 0 1 1-8 8 8 8 0 0 1 8-8zm0 3a5 5 0 0 0-5 5h3a2 2 0 0 1 4 0h3a5 5 0 0 0-5-5z" />
        </svg>
      ),
    },
    xai: {
      label: "xAI",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M2 2L9.5 12.5 2 22h3l5.75-7.5L16.5 22H22l-7.75-10L22 2h-3l-5.5 7-5.5-7z" />
        </svg>
      ),
    },
    openrouter: {
      label: "OpenRouter",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current text-violet-500"
          aria-hidden
        >
          <path d="M12.001 1.5a.75.75 0 0 1 .648.372l9 15.75A.75.75 0 0 1 21 18.75H3a.75.75 0 0 1-.649-1.128l9-15.75A.75.75 0 0 1 12 1.5z" />
        </svg>
      ),
    },
    "vercel-ai-gateway": {
      label: "Vercel AI Gateway",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M12 1L24 22H0L12 1z" />
        </svg>
      ),
    },
    "amazon-bedrock": {
      label: "Amazon Bedrock",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current text-orange-400"
          aria-hidden
        >
          <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L20 8.5v7L12 19.82 4 15.5v-7l8-4.32z" />
        </svg>
      ),
    },
    "google-vertex": {
      label: "Google Vertex AI",
      icon: (
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ),
    },
    "azure-openai-responses": {
      label: "Azure OpenAI",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current text-blue-500"
          aria-hidden
        >
          <path d="M11.5 2L2 19.5h5l4.5-8.5 4.5 8.5H22L12.5 2z" />
        </svg>
      ),
    },
    "github-copilot": {
      label: "GitHub Copilot",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
      ),
    },
    "openai-codex": {
      label: "OpenAI Codex",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden
        >
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
        </svg>
      ),
    },
  }

function getProviderMeta(providerId: string) {
  return (
    PROVIDER_META[providerId] ?? {
      label: providerId
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      icon: (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] leading-none font-bold text-muted-foreground uppercase">
          {providerId.charAt(0)}
        </span>
      ),
    }
  )
}

function ThinkingCombobox({
  selected,
  onSelect,
}: {
  selected: ThinkingLevel
  onSelect: (level: ThinkingLevel) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selectedLevel = THINKING_LEVELS.find((l) => l.value === selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" aria-expanded={open}>
            {selectedLevel?.icon}
            <span>{selectedLevel?.label ?? selected}</span>
            <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        className="w-28 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {THINKING_LEVELS.map((level) => (
                <CommandItem
                  key={level.value}
                  value={level.value}
                  data-checked={level.value === selected}
                  onSelect={() => {
                    onSelect(level.value)
                    setOpen(false)
                  }}
                >
                  {level.icon}
                  {level.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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

  const selectedProvider = groups.find(([, items]) =>
    items.some((m) => m.id === selected?.id)
  )?.[0]
  const selectedMeta = selectedProvider
    ? getProviderMeta(selectedProvider)
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-expanded={open}
          >
            {selectedMeta?.icon}
            <span>{selected?.name ?? "Select model"}</span>
            <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        className="w-48 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList>
            <CommandEmpty>No models found</CommandEmpty>
            {groups.map(([provider, items]) => {
              const meta = getProviderMeta(provider)
              return (
                <CommandGroup key={provider} heading={meta.label}>
                  {items.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${provider} ${m.name}`}
                      data-checked={m.id === selected?.id}
                      onSelect={() => {
                        onSelect(m.id)
                        setOpen(false)
                      }}
                    >
                      {meta.icon}
                      {m.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
  workspaceName?: string
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
  placeholder = "Ask anything…",
  className,
  workspaceName,
  branch,
  branches = [],
  onBranchSelect,
  sessionId,
  selectedModelId: controlledModelId,
  onModelChange,
}: ChatTextboxProps) {
  const [value, setValue] = React.useState("")
  const [internalModelId, setInternalModelId] = React.useState<string | null>(
    null
  )
  const [thinkingLevel, setThinkingLevel] =
    React.useState<ThinkingLevel>("medium")
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
    const effectiveThinkingLevel = selectedModel?.reasoning
      ? thinkingLevel
      : undefined
    onSend?.(
      value.trim(),
      selectedModel?.id ?? "",
      selectedModel?.provider ?? "",
      effectiveThinkingLevel
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
          <div className="flex items-center gap-1">
            <ModelCombobox
              groups={grouped}
              selected={selectedModel}
              onSelect={(id) => {
                if (!isControlled) setInternalModelId(id)
                onModelChange?.(id)
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
                      className="animate-in duration-150 fade-in-0 zoom-in-90"
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
                      className="animate-in duration-150 fade-in-0 zoom-in-90"
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
              sessionId={sessionId}
            />
          )}
        </div>
      )}
    </div>
  )
})
