import * as React from "react"
import {
  BotIcon,
  ChevronsUpDownIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
} from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import type { Mode } from "@/features/workspace/api"

interface ModeOption {
  value: Mode
  label: string
  description: string
  icon: React.ReactNode
  /** Color class applied to the icon, both in the trigger and the menu. */
  iconAccent: string
  /** Translucent background tint applied to the trigger button. */
  triggerBg: string
  /** Focus ring + border classes applied to the chat input wrapper. */
  focusRing: string
  /** Background + hover for the send button. */
  sendButton: string
}

const PRIMARY_SEND_BUTTON =
  "bg-primary text-primary-foreground hover:bg-primary hover:shadow-none"

export const MODE_OPTIONS: ModeOption[] = [
  {
    value: "ask",
    label: "Ask",
    description: "Read-only Q&A",
    icon: <MessageCircleQuestionIcon className="size-3.5 shrink-0" />,
    iconAccent: "text-sky-600 dark:text-sky-400",
    triggerBg:
      "bg-sky-500/10 hover:bg-sky-500/15 aria-expanded:bg-sky-500/20 dark:bg-sky-500/15 dark:hover:bg-sky-500/20 dark:aria-expanded:bg-sky-500/25",
    focusRing:
      "focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/25",
    sendButton: PRIMARY_SEND_BUTTON,
  },
  {
    value: "plan",
    label: "Plan",
    description: "Research + propose",
    icon: <ListTodoIcon className="size-3.5 shrink-0" />,
    iconAccent: "text-amber-600 dark:text-amber-400",
    triggerBg:
      "bg-amber-500/10 hover:bg-amber-500/15 aria-expanded:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/20 dark:aria-expanded:bg-amber-500/25",
    focusRing:
      "focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/25",
    sendButton: PRIMARY_SEND_BUTTON,
  },
  {
    value: "code",
    label: "Code",
    description: "Full coding agent",
    icon: <BotIcon className="size-3.5 shrink-0" />,
    iconAccent: "text-emerald-600 dark:text-emerald-400",
    triggerBg:
      "bg-emerald-500/10 hover:bg-emerald-500/15 aria-expanded:bg-emerald-500/20 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20 dark:aria-expanded:bg-emerald-500/25",
    focusRing:
      "focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/25",
    sendButton: PRIMARY_SEND_BUTTON,
  },
]

export function getModeOption(mode: Mode): ModeOption {
  return MODE_OPTIONS.find((m) => m.value === mode) ?? MODE_OPTIONS[2]
}

export function ModeCombobox({
  selected,
  onSelect,
}: {
  selected: Mode
  onSelect: (mode: Mode) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selectedOption = getModeOption(selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            className={selectedOption.triggerBg}
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
        className="w-60 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {MODE_OPTIONS.map((mode) => (
                <CommandItem
                  key={mode.value}
                  value={mode.value}
                  data-checked={mode.value === selected}
                  className="items-start py-2"
                  onSelect={() => {
                    onSelect(mode.value)
                    setOpen(false)
                  }}
                >
                  <span className={`mt-0.5 ${mode.iconAccent}`}>
                    {mode.icon}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{mode.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {mode.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
