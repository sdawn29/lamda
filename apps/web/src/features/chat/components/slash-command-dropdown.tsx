import * as React from "react"
import {
  ContainerIcon,
  FileTextIcon,
  type LucideIcon,
} from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import type { SlashCommand } from "../api"

export type ChatSlashAction = {
  kind: "action"
  name: string
  description?: string
  icon: LucideIcon
  onSelect: () => void
}

export type ChatSlashServerCmd = {
  kind: "command"
  command: SlashCommand
}

export type ChatSlashItem = ChatSlashAction | ChatSlashServerCmd

export type ChatSlashGroup = {
  heading: string
  items: ChatSlashItem[]
}

export function itemValue(item: ChatSlashItem): string {
  return item.kind === "action"
    ? `action:${item.name}`
    : `cmd:${item.command.source}:${item.command.name}`
}

export function itemName(item: ChatSlashItem): string {
  if (item.kind === "action") return item.name
  // Skills carry a `skill:` prefix in their name — drop it for display.
  return item.command.source === "skill"
    ? item.command.name.replace(/^skill:/, "")
    : item.command.name
}

export function itemDescription(item: ChatSlashItem): string | undefined {
  return item.kind === "action" ? item.description : item.command.description
}

export function SlashCommandDropdown({
  groups,
  open,
  isLoading,
  selectedValue,
  noSkillsHint,
  onSelect,
}: {
  groups: ChatSlashGroup[]
  open: boolean
  isLoading?: boolean
  selectedValue: string | undefined
  /** Show "no skills configured" hint when the server returned an empty skills/prompts list. */
  noSkillsHint?: boolean
  onSelect: (item: ChatSlashItem) => void
}) {
  const flat = React.useMemo(
    () => groups.flatMap((g) => g.items),
    [groups]
  )
  const listRef = React.useRef<HTMLDivElement>(null)

  // Scroll the highlighted item into view ourselves: cmdk only auto-scrolls on
  // its own keyboard nav (which we don't use). Look the item up by data-value,
  // not data-selected — cmdk applies data-selected in a nested re-render that
  // commits *after* this effect runs, so querying it here would find the
  // previously selected item and the scroll would lag one step behind.
  React.useEffect(() => {
    if (!selectedValue) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-value=${CSS.escape(selectedValue)}]`
    )
    if (!el) return
    // When landing on the first item of a group, bring its heading into view
    // too so the group label isn't clipped at the top of the list.
    if (el.parentElement?.firstElementChild === el) {
      el.closest('[cmdk-group=""]')
        ?.querySelector('[cmdk-group-heading=""]')
        ?.scrollIntoView({ block: "nearest" })
    }
    el.scrollIntoView({ block: "nearest" })
  }, [selectedValue])

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
          {isLoading && flat.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Loading commands
            </div>
          ) : flat.length === 0 ? (
            <CommandEmpty>
              {noSkillsHint
                ? "No skills available. Add a SKILL.md to ~/.pi/agent/skills/ or .agents/skills/"
                : "No matches"}
            </CommandEmpty>
          ) : (
            groups.map((group) =>
              group.items.length > 0 ? (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={itemValue(item)}
                      value={itemValue(item)}
                      onSelect={() => onSelect(item)}
                      // onMouseDown prevents the contenteditable from losing focus
                      // before the click handler fires.
                      onMouseDown={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      <SlashItemIcon item={item} />
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 font-mono font-medium">
                          /{itemName(item)}
                        </span>
                        {itemDescription(item) && (
                          <span className="truncate text-3xs text-muted-foreground">
                            {itemDescription(item)}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null
            )
          )}
        </CommandList>
      </Command>
    </div>
  )
}

function SlashItemIcon({ item }: { item: ChatSlashItem }) {
  if (item.kind === "action") {
    const Icon = item.icon
    return (
      <Icon
        width={12}
        height={12}
        className="shrink-0 text-muted-foreground"
        aria-hidden
      />
    )
  }
  if (item.command.source === "prompt") {
    return (
      <FileTextIcon
        width={12}
        height={12}
        className="shrink-0 text-muted-foreground"
        aria-hidden
      />
    )
  }
  return (
    <ContainerIcon
      width={12}
      height={12}
      className="shrink-0 text-muted-foreground"
      aria-hidden
    />
  )
}
