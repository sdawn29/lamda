import * as React from "react"
import { ChevronsUpDownIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"
import type { ApprovalMode } from "@/features/workspace/api"

interface ApprovalModeOption {
  value: ApprovalMode
  /** Full name shown in both the trigger and the menu. */
  label: string
  description: string
  icon: React.ReactNode
  /** Color class applied to the icon and label. */
  iconAccent: string
  /** Accent tint applied to the selected row in the menu. */
  selectedBg: string
  /** Translucent background tint applied to the trigger button. */
  triggerBg: string
}

export const APPROVAL_MODE_OPTIONS: ApprovalModeOption[] = [
  {
    // Default, safe mode — kept neutral (no accent color).
    value: "ask",
    label: "Ask for approval",
    description: "Prompt before bash, edits, and MCP tools",
    icon: <ShieldCheckIcon className="size-3.5 shrink-0" />,
    iconAccent: "text-muted-foreground",
    selectedBg: "data-[checked=true]:bg-muted",
    triggerBg: "",
  },
  {
    // Permissive mode — coloured amber to flag that tools run unchecked.
    value: "all_allowed",
    label: "All tools allowed",
    description: "Run every tool without prompting",
    icon: <ShieldOffIcon className="size-3.5 shrink-0" />,
    iconAccent: "text-amber-600 dark:text-amber-400",
    selectedBg: "data-[checked=true]:bg-amber-500/10",
    triggerBg:
      "bg-amber-500/10 hover:bg-amber-500/15 aria-expanded:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/20 dark:aria-expanded:bg-amber-500/25",
  },
]

export function getApprovalModeOption(mode: ApprovalMode): ApprovalModeOption {
  return (
    APPROVAL_MODE_OPTIONS.find((m) => m.value === mode) ??
    APPROVAL_MODE_OPTIONS[0]
  )
}

export function ApprovalModeCombobox({
  selected,
  onSelect,
}: {
  selected: ApprovalMode
  onSelect: (mode: ApprovalMode) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selectedOption = getApprovalModeOption(selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            title="Tool approval"
            className={cn(selectedOption.triggerBg)}
          >
            <span className={selectedOption.iconAccent}>
              {selectedOption.icon}
            </span>
            <span className={selectedOption.iconAccent}>
              {selectedOption.label}
            </span>
            <ChevronsUpDownIcon
              data-icon="inline-end"
              className={`opacity-60 ${selectedOption.iconAccent}`}
            />
          </Button>
        }
      />
      <PopoverContent
        className="w-56 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command>
          <CommandList>
            <CommandGroup className="p-1">
              {APPROVAL_MODE_OPTIONS.map((mode) => (
                <CommandItem
                  key={mode.value}
                  value={mode.value}
                  data-checked={mode.value === selected}
                  className={cn(
                    "items-start gap-2 rounded-md px-2 py-1.5",
                    mode.selectedBg
                  )}
                  onSelect={() => {
                    onSelect(mode.value)
                    setOpen(false)
                  }}
                >
                  <span className={cn("mt-0.5", mode.iconAccent)}>
                    {mode.icon}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium">{mode.label}</span>
                    <span className="text-3xs text-muted-foreground">
                      {mode.description}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
