import * as React from "react"
import { ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
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
}: {
  groups: ModelGroup
  selected: { id: string; name: string; provider: string } | null
  onSelect: (compositeKey: string) => void
  disabled?: boolean
  placeholder?: string
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
            className="max-w-44"
          >
            {selectedMeta?.icon}
            <span className="truncate">{selected?.name ?? placeholder}</span>
            <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        className="w-64 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command filter={filter}>
          <CommandInput placeholder="Search models…" />
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
                      data-checked={m.id === selected?.id && provider === selected?.provider}
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
