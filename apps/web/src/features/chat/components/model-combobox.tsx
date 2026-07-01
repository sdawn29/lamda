import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { getProviderMeta } from "@/shared/lib/provider-meta"

export type ModelGroup = [
  string,
  { id: string; name: string; provider: string; reasoning: boolean }[],
][]

export function ModelCombobox({
  groups,
  selected,
  onSelect,
  disabled,
  placeholder = "Select model",
  triggerClassName,
  contentClassName,
  side = "top",
}: {
  groups: ModelGroup
  selected: { id: string; name: string; provider: string } | null
  onSelect: (compositeKey: string) => void
  disabled?: boolean
  placeholder?: string
  /** Extra classes for the trigger button (overrides the default ghost look). */
  triggerClassName?: string
  /** Extra classes for the popover content. */
  contentClassName?: string
  /** Side the popover opens toward. */
  side?: "top" | "bottom" | "left" | "right"
}) {
  const [open, setOpen] = React.useState(false)

  const selectedMeta = selected?.provider
    ? getProviderMeta(selected.provider)
    : null

  const nameByKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const [provider, items] of groups) {
      for (const m of items) map.set(`${provider}::${m.id}`, m.name)
    }
    return map
  }, [groups])

  const filter = React.useCallback(
    (key: string, search: string) => {
      const name = nameByKey.get(key) ?? key
      return name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
    },
    [nameByKey]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-expanded={open}
            title={selected?.name ?? placeholder}
            className={cn("max-w-60", triggerClassName)}
          >
            <span data-icon="inline-start">{selectedMeta?.icon}</span>
            <span
              className={cn(
                "truncate",
                triggerClassName && "mr-auto",
                !selected && "text-muted-foreground"
              )}
            >
              {selected?.name ?? placeholder}
            </span>
            <ChevronDownIcon
              data-icon="inline-end"
              className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </Button>
        }
      />
      <PopoverContent
        className={cn("w-64 p-0", contentClassName)}
        side={side}
        align="start"
        sideOffset={6}
      >
        <Command filter={filter}>
          <CommandInput placeholder="Search models" />
          <CommandList>
            <CommandEmpty>No models found</CommandEmpty>
            {groups.map(([provider, items]) => {
              const meta = getProviderMeta(provider)
              return (
                <CommandGroup key={provider} heading={meta.label}>
                  {items.map((m) => (
                    <CommandItem
                      key={`${provider}::${m.id}`}
                      value={`${provider}::${m.id}`}
                      data-checked={
                        m.id === selected?.id && provider === selected?.provider
                      }
                      onSelect={() => {
                        onSelect(`${provider}::${m.id}`)
                        setOpen(false)
                      }}
                    >
                      {meta.icon}
                      <span className="truncate">{m.name}</span>
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
