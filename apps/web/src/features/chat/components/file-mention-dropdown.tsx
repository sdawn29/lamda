import { Icon } from "@iconify/react"
import { useDropdownScroll } from "../hooks/use-dropdown-scroll"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
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
  const listRef = useDropdownScroll(selectedIndex)

  if (!open) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
    >
      {isLoading ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Loading files…
        </div>
      ) : (
        entries.map((entry, i) => (
          <Button
            key={entry.path}
            variant="ghost"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(entry)
            }}
            className={cn(
              "h-auto w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-xs",
              i === selectedIndex && "bg-accent text-accent-foreground"
            )}
          >
            {entry.type === "dir" ? (
              <Icon
                icon="catppuccin:folder"
                width={12}
                height={12}
                className="shrink-0"
                aria-hidden
              />
            ) : (
              <Icon
                {...(() => {
                  const iconName = getIconName(entry.path)
                  return { icon: `catppuccin:${iconName}` }
                })()}
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
          </Button>
        ))
      )}
    </div>
  )
}
