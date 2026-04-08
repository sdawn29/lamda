import * as React from "react"
import { ChevronsUpDownIcon } from "lucide-react"

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
import { getProviderMeta } from "@/lib/provider-meta"

export type ModelGroup = [
  string,
  { id: string; name: string; provider: string; reasoning: boolean }[],
][]

export function ModelCombobox({
  groups,
  selected,
  onSelect,
  disabled,
}: {
  groups: ModelGroup
  selected: { id: string; name: string; provider: string } | null
  onSelect: (compositeKey: string) => void
  disabled?: boolean
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
            className="w-auto"
          >
            {selectedMeta?.icon}
            <span className="whitespace-nowrap">{selected?.name ?? "Select model"}</span>
            <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        className="w-auto min-w-40 p-0"
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
                      className="whitespace-nowrap"
                      onSelect={() => {
                        onSelect(`${provider}::${m.id}`)
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
