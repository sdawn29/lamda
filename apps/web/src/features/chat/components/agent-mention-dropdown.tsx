import * as React from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { cn } from "@/shared/lib/utils"
import type { AgentDto } from "@/features/workspace/api"
import { colorStyle, resolveModeIcon } from "./mode-combobox"

export function AgentMentionDropdown({
  agents,
  open,
  isLoading,
  selectedIndex,
  modeLabel,
  onSelect,
}: {
  agents: AgentDto[]
  open: boolean
  isLoading?: boolean
  selectedIndex: number
  modeLabel: string
  onSelect: (agent: AgentDto) => void
}) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const selectedValue = agents[selectedIndex]?.id

  React.useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex, open])

  if (!open) return null

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-full">
      <Command
        shouldFilter={false}
        value={selectedValue}
        className="max-h-60 overflow-hidden rounded-lg border bg-popover shadow-md"
        loop={false}
      >
        <CommandList ref={listRef} className="max-h-60">
          {isLoading && agents.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Loading subagents
            </div>
          ) : agents.length === 0 ? (
            <CommandEmpty>
              No subagents available in {modeLabel} mode
            </CommandEmpty>
          ) : (
            <CommandGroup heading="Subagents">
              {agents.map((agent, index) => {
                const Icon = resolveModeIcon(agent.icon)
                const style = colorStyle(agent.color)
                return (
                  <CommandItem
                    key={agent.id}
                    value={agent.id}
                    data-index={index}
                    onSelect={() => onSelect(agent)}
                    onMouseDown={(event) => event.preventDefault()}
                    className="text-xs"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded",
                        style.softBg,
                        style.iconAccent
                      )}
                    >
                      <Icon className="size-3" aria-hidden />
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono font-medium">
                        #{agent.label}
                      </span>
                      {agent.description && (
                        <span className="truncate text-3xs text-muted-foreground">
                          {agent.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
