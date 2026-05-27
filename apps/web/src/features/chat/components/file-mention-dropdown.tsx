import * as React from "react"
import { Icon } from "@iconify/react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { getIconName } from "@/shared/ui/file-icon"
import type { WorkspaceEntry } from "../queries"

export function FileMentionDropdown({
  entries,
  open,
  isLoading,
  selectedIndex,
  onSelect,
}: {
  entries: WorkspaceEntry[]
  open: boolean
  isLoading?: boolean
  selectedIndex: number
  onSelect: (entry: WorkspaceEntry) => void
}) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const selectedValue = entries[selectedIndex]?.path

  // Scroll the highlighted item into view by index. Querying by data-index is
  // reliable because refs are committed synchronously before effects run —
  // unlike querying [data-selected="true"] which depends on cmdk's own effect.
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
          {isLoading && entries.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Loading files…
            </div>
          ) : entries.length === 0 ? (
            <CommandEmpty>No files found</CommandEmpty>
          ) : (
            <CommandGroup>
              {entries.map((entry, i) => (
                <CommandItem
                  key={entry.path}
                  value={entry.path}
                  data-index={i}
                  onSelect={() => onSelect(entry)}
                  // Prevent the contenteditable from losing focus before
                  // the select handler fires — same pattern as slash-command-dropdown.
                  onMouseDown={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  {entry.type === "dir" ? (
                    <Icon
                      icon="catppuccin:folder"
                      className="size-3 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <Icon
                      icon={`catppuccin:${getIconName(entry.path)}`}
                      className="size-3 shrink-0"
                      aria-hidden
                    />
                  )}
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 font-mono font-medium">
                      {entry.path.split("/").pop() ?? entry.path}
                    </span>
                    {entry.path.includes("/") && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {entry.path.slice(0, entry.path.lastIndexOf("/"))}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
