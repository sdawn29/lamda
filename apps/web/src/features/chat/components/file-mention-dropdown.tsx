import * as React from "react"
import { Icon } from "@iconify/react"

import { cn } from "@/shared/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { getIconName } from "@/shared/ui/file-icon"
import { statusDotClass } from "@/features/git/components/status-badge"
import type { WorkspaceEntry } from "../queries"

/** Section an entry was bucketed into — assigned by the data layer (see
 *  chat-composer.tsx) so the flat, keyboard-navigable order and the visual
 *  section order always agree: Open, then Changed, then everything else. */
export type MentionSection = "open" | "changed" | "files"

export interface MentionEntry extends WorkspaceEntry {
  section: MentionSection
  /** Git status label (M, A, D, U, R, ...) — set when section is "changed"
   *  (or "open" for a file that's also changed), drives the status dot. */
  statusLabel?: string
}

const SECTION_HEADINGS: Record<MentionSection, string> = {
  open: "Open",
  changed: "Changed",
  files: "Files",
}

export function FileMentionDropdown({
  entries,
  open,
  isLoading,
  selectedIndex,
  onSelect,
}: {
  entries: MentionEntry[]
  open: boolean
  isLoading?: boolean
  selectedIndex: number
  onSelect: (entry: MentionEntry) => void
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

  // Entries arrive pre-sorted by section (open, changed, files) from the data
  // layer — group consecutive runs for rendering while keeping each entry's
  // original flat index for data-index/arrow-key nav.
  const sections = React.useMemo(() => {
    const groups: {
      section: MentionSection
      items: { entry: MentionEntry; index: number }[]
    }[] = []
    entries.forEach((entry, index) => {
      const last = groups[groups.length - 1]
      if (last && last.section === entry.section) {
        last.items.push({ entry, index })
      } else {
        groups.push({ section: entry.section, items: [{ entry, index }] })
      }
    })
    return groups
  }, [entries])

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
              Loading files
            </div>
          ) : entries.length === 0 ? (
            <CommandEmpty>No files found</CommandEmpty>
          ) : (
            sections.map((group) => (
              <CommandGroup
                key={group.section}
                heading={SECTION_HEADINGS[group.section]}
              >
                {group.items.map(({ entry, index }) => (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    data-index={index}
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
                        <span className="truncate font-mono text-3xs text-muted-foreground">
                          {entry.path.slice(0, entry.path.lastIndexOf("/"))}
                        </span>
                      )}
                    </span>
                    {entry.statusLabel && (
                      <span
                        className={cn(
                          "inline-block size-1.5 shrink-0 rounded-full",
                          statusDotClass(entry.statusLabel)
                        )}
                        aria-hidden
                      />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </Command>
    </div>
  )
}
