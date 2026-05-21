import { FileTextIcon, TerminalIcon } from "lucide-react"
import { useDropdownScroll } from "../hooks/use-dropdown-scroll"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import type { SlashCommand } from "../api"

export function SlashCommandDropdown({
  commands,
  open,
  isLoading,
  selectedIndex,
  onSelect,
}: {
  commands: SlashCommand[]
  open: boolean
  isLoading?: boolean
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
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
          Loading commands…
        </div>
      ) : commands.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          No skills available. Add a SKILL.md to ~/.pi/agent/skills/ or .agents/skills/
        </div>
      ) : (
        commands.map((cmd, i) => (
          <Button
            key={cmd.name}
            variant="ghost"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(cmd)
            }}
            className={cn(
              "h-auto w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-xs",
              i === selectedIndex && "bg-accent text-accent-foreground"
            )}
          >
            {cmd.source === "prompt" ? (
              <FileTextIcon
                width={12}
                height={12}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <TerminalIcon
                width={12}
                height={12}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono font-medium">/{cmd.name}</span>
              {cmd.description && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {cmd.description}
                </span>
              )}
            </span>
          </Button>
        ))
      )}
    </div>
  )
}
