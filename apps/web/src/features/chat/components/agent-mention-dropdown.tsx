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
import { AgentModelLine, AgentSourceBadge, AgentToolsSummary } from "./agent-info"

/**
 * Detail pane for the currently highlighted agent — mirrors the facts shown
 * in the AgentChip tooltip (user-message.tsx) and the subagent card, via the
 * shared helpers in agent-info.tsx, so all three surfaces read the same way.
 */
function AgentDetailPane({ agent }: { agent: AgentDto }) {
  // resolveModeIcon returns module-cached components, so identity is stable
  // across renders; rendering via the wrapper's property (`visual.Icon`)
  // keeps the react-compiler static-components rule satisfied (see the same
  // pattern in subagent-card.tsx).
  const visual = { Icon: resolveModeIcon(agent.icon) }
  const style = colorStyle(agent.color)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded",
            style.softBg,
            style.iconAccent
          )}
        >
          <visual.Icon className="size-3" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          #{agent.label}
        </span>
        <AgentSourceBadge source={agent.source} className="shrink-0" />
      </div>
      <AgentModelLine model={agent.model} />
      <AgentToolsSummary tools={agent.tools} />
      {agent.description && (
        <p className="text-2xs leading-relaxed text-foreground/70">
          {agent.description}
        </p>
      )}
    </div>
  )
}

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

  // Hover previews the detail pane without disturbing keyboard selection
  // (arrows still drive `selectedIndex`/the list's highlighted row — this is
  // display-only). Reset whenever keyboard selection moves, so a stale hover
  // target doesn't linger after the user starts using the keyboard again —
  // adjusted during render (React's recommended pattern for resetting state
  // in response to a prop change) rather than in an effect, so there's no
  // extra render cascade or one-frame flash of the stale hover target.
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [prevSelectedIndex, setPrevSelectedIndex] = React.useState(selectedIndex)
  if (selectedIndex !== prevSelectedIndex) {
    setPrevSelectedIndex(selectedIndex)
    setHoveredId(null)
  }

  const activeAgent =
    (hoveredId ? agents.find((a) => a.id === hoveredId) : undefined) ??
    agents[selectedIndex] ??
    null

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
      <div className="flex max-h-60 overflow-hidden rounded-lg border bg-popover shadow-md">
        <Command
          shouldFilter={false}
          value={selectedValue}
          className="w-full shrink-0 rounded-none bg-transparent p-1 sm:w-[55%] sm:border-r sm:border-border/50"
          loop={false}
        >
          <CommandList
            ref={listRef}
            className="max-h-60"
            onMouseLeave={() => setHoveredId(null)}
          >
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
                      onMouseEnter={() => setHoveredId(agent.id)}
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
        {activeAgent && (
          <div className="hidden max-h-60 min-w-0 flex-1 sm:flex">
            <AgentDetailPane agent={activeAgent} />
          </div>
        )}
      </div>
    </div>
  )
}
