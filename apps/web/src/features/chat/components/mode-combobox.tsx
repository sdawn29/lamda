import * as React from "react"
import {
  BotIcon,
  BookOpenIcon,
  BugIcon,
  ChevronDownIcon,
  CodeIcon,
  CompassIcon,
  EyeIcon,
  HammerIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  RocketIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  WandSparklesIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"
import type { Mode, ModeDto } from "@/features/workspace/api"

/** Per-color class sets for a mode's chip and menu row. */
interface ModeColorStyle {
  /** Color class applied to the icon, both in the trigger and the menu. */
  iconAccent: string
  /** Color class applied to the trigger label text. */
  triggerText: string
  /** Accent tint applied to the selected row in the menu. */
  selectedBg: string
  /** Translucent background tint applied to the trigger button. */
  triggerBg: string
  /** Focus ring + border classes for the chat input wrapper. */
  focusRing: string
}

// Static palette. Class strings are spelled out (not interpolated) so Tailwind's
// scanner keeps them in the build. Keep keys in sync with `MODE_COLORS` in the
// pi-sdk `modes` module.
const MODE_COLOR_STYLES: Record<string, ModeColorStyle> = {
  sky: {
    iconAccent: "text-sky-600 dark:text-sky-400",
    triggerText: "text-sky-700 dark:text-sky-300",
    selectedBg: "data-[checked=true]:bg-sky-500/10",
    triggerBg:
      "bg-sky-500/10 hover:bg-sky-500/15 aria-expanded:bg-sky-500/20 dark:bg-sky-500/15 dark:hover:bg-sky-500/20 dark:aria-expanded:bg-sky-500/25",
    focusRing:
      "focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/25",
  },
  amber: {
    iconAccent: "text-amber-600 dark:text-amber-400",
    triggerText: "text-amber-700 dark:text-amber-300",
    selectedBg: "data-[checked=true]:bg-amber-500/10",
    triggerBg:
      "bg-amber-500/10 hover:bg-amber-500/15 aria-expanded:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/20 dark:aria-expanded:bg-amber-500/25",
    focusRing:
      "focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/25",
  },
  emerald: {
    iconAccent: "text-emerald-600 dark:text-emerald-400",
    triggerText: "text-emerald-700 dark:text-emerald-300",
    selectedBg: "data-[checked=true]:bg-emerald-500/10",
    triggerBg:
      "bg-emerald-500/10 hover:bg-emerald-500/15 aria-expanded:bg-emerald-500/20 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20 dark:aria-expanded:bg-emerald-500/25",
    focusRing:
      "focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/25",
  },
  violet: {
    iconAccent: "text-violet-600 dark:text-violet-400",
    triggerText: "text-violet-700 dark:text-violet-300",
    selectedBg: "data-[checked=true]:bg-violet-500/10",
    triggerBg:
      "bg-violet-500/10 hover:bg-violet-500/15 aria-expanded:bg-violet-500/20 dark:bg-violet-500/15 dark:hover:bg-violet-500/20 dark:aria-expanded:bg-violet-500/25",
    focusRing:
      "focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/25",
  },
  rose: {
    iconAccent: "text-rose-600 dark:text-rose-400",
    triggerText: "text-rose-700 dark:text-rose-300",
    selectedBg: "data-[checked=true]:bg-rose-500/10",
    triggerBg:
      "bg-rose-500/10 hover:bg-rose-500/15 aria-expanded:bg-rose-500/20 dark:bg-rose-500/15 dark:hover:bg-rose-500/20 dark:aria-expanded:bg-rose-500/25",
    focusRing:
      "focus-within:border-rose-500/60 focus-within:ring-2 focus-within:ring-rose-500/25",
  },
  blue: {
    iconAccent: "text-blue-600 dark:text-blue-400",
    triggerText: "text-blue-700 dark:text-blue-300",
    selectedBg: "data-[checked=true]:bg-blue-500/10",
    triggerBg:
      "bg-blue-500/10 hover:bg-blue-500/15 aria-expanded:bg-blue-500/20 dark:bg-blue-500/15 dark:hover:bg-blue-500/20 dark:aria-expanded:bg-blue-500/25",
    focusRing:
      "focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/25",
  },
  teal: {
    iconAccent: "text-teal-600 dark:text-teal-400",
    triggerText: "text-teal-700 dark:text-teal-300",
    selectedBg: "data-[checked=true]:bg-teal-500/10",
    triggerBg:
      "bg-teal-500/10 hover:bg-teal-500/15 aria-expanded:bg-teal-500/20 dark:bg-teal-500/15 dark:hover:bg-teal-500/20 dark:aria-expanded:bg-teal-500/25",
    focusRing:
      "focus-within:border-teal-500/60 focus-within:ring-2 focus-within:ring-teal-500/25",
  },
  orange: {
    iconAccent: "text-orange-600 dark:text-orange-400",
    triggerText: "text-orange-700 dark:text-orange-300",
    selectedBg: "data-[checked=true]:bg-orange-500/10",
    triggerBg:
      "bg-orange-500/10 hover:bg-orange-500/15 aria-expanded:bg-orange-500/20 dark:bg-orange-500/15 dark:hover:bg-orange-500/20 dark:aria-expanded:bg-orange-500/25",
    focusRing:
      "focus-within:border-orange-500/60 focus-within:ring-2 focus-within:ring-orange-500/25",
  },
  fuchsia: {
    iconAccent: "text-fuchsia-600 dark:text-fuchsia-400",
    triggerText: "text-fuchsia-700 dark:text-fuchsia-300",
    selectedBg: "data-[checked=true]:bg-fuchsia-500/10",
    triggerBg:
      "bg-fuchsia-500/10 hover:bg-fuchsia-500/15 aria-expanded:bg-fuchsia-500/20 dark:bg-fuchsia-500/15 dark:hover:bg-fuchsia-500/20 dark:aria-expanded:bg-fuchsia-500/25",
    focusRing:
      "focus-within:border-fuchsia-500/60 focus-within:ring-2 focus-within:ring-fuchsia-500/25",
  },
  slate: {
    iconAccent: "text-slate-600 dark:text-slate-400",
    triggerText: "text-slate-700 dark:text-slate-300",
    selectedBg: "data-[checked=true]:bg-slate-500/10",
    triggerBg:
      "bg-slate-500/10 hover:bg-slate-500/15 aria-expanded:bg-slate-500/20 dark:bg-slate-500/15 dark:hover:bg-slate-500/20 dark:aria-expanded:bg-slate-500/25",
    focusRing:
      "focus-within:border-slate-500/60 focus-within:ring-2 focus-within:ring-slate-500/25",
  },
}

const DEFAULT_COLOR = "violet"

// Named icons a mode file may declare via frontmatter `icon`. Falls back to a
// generic icon for unknown names so custom modes always render something.
const MODE_ICONS: Record<string, LucideIcon> = {
  "message-circle-question": MessageCircleQuestionIcon,
  "list-todo": ListTodoIcon,
  bot: BotIcon,
  sparkles: SparklesIcon,
  wand: WandSparklesIcon,
  search: SearchIcon,
  pencil: PencilIcon,
  bug: BugIcon,
  shield: ShieldIcon,
  rocket: RocketIcon,
  book: BookOpenIcon,
  code: CodeIcon,
  terminal: TerminalIcon,
  eye: EyeIcon,
  zap: ZapIcon,
  compass: CompassIcon,
  hammer: HammerIcon,
  wrench: WrenchIcon,
}

const DEFAULT_ICON = SparklesIcon

// The full set of Lucide icon names (kebab-case), so a frontmatter `icon` may
// name any Lucide icon — not just the curated set in MODE_ICONS above.
const LUCIDE_ICON_NAMES: ReadonlySet<string> = new Set(iconNames)

function isLucideIconName(name: string): name is IconName {
  return LUCIDE_ICON_NAMES.has(name)
}

// Wrapper components built for dynamically-resolved icons, cached by name so the
// same name yields a stable component identity across renders (a fresh component
// each render would remount DynamicIcon and re-trigger its async load).
const dynamicIconCache = new Map<IconName, LucideIcon>()

/** A `LucideIcon`-shaped component that lazy-loads the named icon at render. */
function dynamicModeIcon(name: IconName): LucideIcon {
  const cached = dynamicIconCache.get(name)
  if (cached) return cached
  const Component = React.forwardRef<SVGSVGElement, LucideProps>(
    (props, ref) => (
      <DynamicIcon
        ref={ref}
        name={name}
        // Render the default icon while the real one is loading, so the slot is
        // never empty mid-load.
        fallback={() => <DEFAULT_ICON className={props.className} />}
        {...props}
      />
    ),
  ) as LucideIcon
  dynamicIconCache.set(name, Component)
  return Component
}

/**
 * Resolve a frontmatter `icon` name to a component: a curated icon for the fast
 * common path, any other valid Lucide name via dynamic import, else the default.
 */
function resolveModeIcon(name: string): LucideIcon {
  return (
    MODE_ICONS[name] ??
    (isLucideIconName(name) ? dynamicModeIcon(name) : DEFAULT_ICON)
  )
}

/** Send button styling — shared across modes. */
export const MODE_SEND_BUTTON =
  "bg-primary text-primary-foreground hover:bg-primary hover:shadow-none"

export interface ModeOption {
  value: Mode
  label: string
  description: string
  Icon: LucideIcon
  style: ModeColorStyle
  /** Background + hover for the send button. */
  sendButton: string
}

function colorStyle(color: string): ModeColorStyle {
  return MODE_COLOR_STYLES[color] ?? MODE_COLOR_STYLES[DEFAULT_COLOR]
}

/** Build the picker option (resolved color/icon) for a mode descriptor. */
export function modeOptionFromDto(dto: ModeDto): ModeOption {
  return {
    value: dto.id,
    label: dto.label,
    description: dto.description,
    Icon: resolveModeIcon(dto.icon),
    style: colorStyle(dto.color),
    sendButton: MODE_SEND_BUTTON,
  }
}

/**
 * The option for `mode` from the available `modes`, or a neutral fallback when
 * the mode isn't in the list yet (e.g. before `/modes` resolves, or a mode whose
 * file was just removed).
 */
export function getModeOption(mode: Mode, modes: ModeDto[]): ModeOption {
  const dto = modes.find((m) => m.id === mode)
  return modeOptionFromDto(
    dto ?? {
      id: mode,
      label: mode.charAt(0).toUpperCase() + mode.slice(1),
      description: "",
      color: DEFAULT_COLOR,
      icon: "",
      source: "builtin",
    },
  )
}

/** Next mode when cycling (e.g. via a shortcut), wrapping around the list. */
export function getNextMode(mode: Mode, modes: ModeDto[]): Mode {
  if (modes.length === 0) return mode
  const index = modes.findIndex((m) => m.id === mode)
  return modes[(index + 1) % modes.length].id
}

export function ModeCombobox({
  selected,
  onSelect,
  modes,
}: {
  selected: Mode
  onSelect: (mode: Mode) => void
  modes: ModeDto[]
}) {
  const [open, setOpen] = React.useState(false)
  const selectedOption = getModeOption(selected, modes)
  const options = React.useMemo(() => modes.map(modeOptionFromDto), [modes])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            className={selectedOption.style.triggerBg}
          >
            <span className={selectedOption.style.iconAccent}>
              <selectedOption.Icon className="size-3.5 shrink-0" />
            </span>
            <span className={selectedOption.style.triggerText}>
              {selectedOption.label}
            </span>
            <ChevronDownIcon
              data-icon="inline-end"
              className={`opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </Button>
        }
      />
      <PopoverContent
        className="w-44 p-0"
        side="top"
        align="start"
        sideOffset={6}
      >
        <Command>
          <CommandList>
            <CommandGroup className="p-1">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  data-checked={option.value === selected}
                  className={cn(
                    "items-center gap-2 rounded-md px-2 py-1",
                    option.style.selectedBg
                  )}
                  onSelect={() => {
                    onSelect(option.value)
                    setOpen(false)
                  }}
                >
                  <span className={option.style.iconAccent}>
                    <option.Icon className="size-3.5 shrink-0" />
                  </span>
                  <span className="text-xs font-medium">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
