import * as React from "react"
import { ChevronDownIcon, ListChecksIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { getProviderMeta } from "@/shared/lib/provider-meta"
import type { Mode, ModeDto } from "@/features/workspace/api"
import { getModeOption, modeOptionFromDto } from "./mode-combobox"
import { ModeToolsDialog } from "./mode-tools-dialog"
import { ALL_THINKING_LEVELS, type ThinkingLevel } from "./thinking-combobox"
import type { ModelGroup } from "./model-combobox"

/** One-line blurbs for the thinking submenu rows. */
const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
  low: "Quick, minimal reasoning",
  medium: "Balanced speed and depth",
  high: "Deeper reasoning",
  xhigh: "Maximum reasoning depth",
}

interface ComposerSettingsMenuProps {
  /** Models grouped by provider, as built by the composer. */
  groups: ModelGroup
  selectedModel: {
    id: string
    name: string
    provider: string
    reasoning: boolean
  } | null
  onSelectModel: (compositeKey: string) => void
  /** Thinking submenu renders only for reasoning models. */
  thinkingLevel: ThinkingLevel
  onThinkingLevelChange: (level: ThinkingLevel) => void
  availableLevels: string[]
  mode: Mode
  modes: ModeDto[]
  /** Mode submenu and the tools item render only when mode switching is wired up. */
  onModeChange?: (mode: Mode) => void
  workspaceId?: string
}

/** Icon tile that fronts each cascade row — mirrors the mode picker's tiles. */
function RowTile({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg",
        className
      )}
    >
      {children}
    </span>
  )
}

/** Two-line body for a cascade row: tiny uppercase label over current value. */
function RowBody({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-3xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-xs font-medium text-foreground">
        {value}
      </span>
    </span>
  )
}

/**
 * Single entry point for the composer's per-thread settings, styled after the
 * app's floating islands: a segmented pill trigger (mode · model · thinking,
 * each as icon + label) fanning out into a cascade of Model / Thinking / Mode
 * submenus plus the mode-tools dialog.
 */
export function ComposerSettingsMenu({
  groups,
  selectedModel,
  onSelectModel,
  thinkingLevel,
  onThinkingLevelChange,
  availableLevels,
  mode,
  modes,
  onModeChange,
  workspaceId,
}: ComposerSettingsMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [toolsOpen, setToolsOpen] = React.useState(false)

  const modeOption = getModeOption(mode, modes)
  const modeOptions = React.useMemo(() => modes.map(modeOptionFromDto), [modes])
  const activeModeDto = modes.find((m) => m.id === mode)
  const providerMeta = selectedModel
    ? getProviderMeta(selectedModel.provider)
    : null

  const showThinking = Boolean(selectedModel?.reasoning)
  const thinkingLevels = React.useMemo(() => {
    if (availableLevels.length === 0) return ALL_THINKING_LEVELS
    return ALL_THINKING_LEVELS.filter((l) => availableLevels.includes(l.value))
  }, [availableLevels])
  const selectedThinking =
    thinkingLevels.find((l) => l.value === thinkingLevel) ??
    thinkingLevels[thinkingLevels.length - 1]

  const modelValue = selectedModel
    ? `${selectedModel.provider}::${selectedModel.id}`
    : ""

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-expanded={open}
              aria-label="Chat settings"
              title={[
                selectedModel?.name ?? "Select model",
                modeOption.label,
                showThinking ? `Thinking: ${selectedThinking?.label}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              className={cn(
                // Quiet inline cluster: no chrome at rest — just the mode's
                // accent icon and dot-separated labels. A soft wash of accent
                // appears on hover/open, kept a step lighter than a button.
                "group/settings flex h-6.5 max-w-96 min-w-0 items-center gap-1.5 rounded-lg px-2 text-xs outline-none",
                "text-muted-foreground transition-colors duration-150",
                "hover:bg-accent/50 hover:text-foreground",
                "aria-expanded:bg-accent/50 aria-expanded:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring/40"
              )}
            >
              {/* Mode — the one point of color at rest. */}
              <span className={cn("shrink-0", modeOption.style.iconAccent)}>
                <modeOption.Icon className="size-3.5 shrink-0" />
              </span>
              <span className="shrink-0 font-medium text-foreground/85">
                {modeOption.label}
              </span>

              <span
                aria-hidden
                className="shrink-0 text-muted-foreground/40 select-none"
              >
                ·
              </span>

              {/* Model. */}
              {providerMeta && (
                <span className="shrink-0 opacity-80">{providerMeta.icon}</span>
              )}
              <span
                className={cn(
                  "min-w-0 truncate font-medium",
                  selectedModel ? "text-foreground/85" : "text-muted-foreground"
                )}
              >
                {selectedModel?.name ?? "Select model"}
              </span>

              {/* Thinking. */}
              {showThinking && (
                <>
                  <span
                    aria-hidden
                    className="shrink-0 text-muted-foreground/40 select-none"
                  >
                    ·
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {selectedThinking?.icon}
                    <span>{selectedThinking?.label}</span>
                  </span>
                </>
              )}

              <ChevronDownIcon
                className={cn(
                  "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover/settings:text-muted-foreground",
                  open && "rotate-180"
                )}
              />
            </button>
          }
        />

        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-64 rounded-2xl p-1.5"
        >
          {/* ── Model ─────────────────────────────────────────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2.5 rounded-lg px-1.5 py-1.5">
              <RowTile className="bg-muted/70 text-foreground">
                {providerMeta?.icon}
              </RowTile>
              <RowBody
                label="Model"
                value={selectedModel?.name ?? "Select model"}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60 rounded-xl p-1.5">
              {groups.length === 0 ? (
                <DropdownMenuItem disabled>
                  No models available
                </DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup
                  value={modelValue}
                  onValueChange={(value) => onSelectModel(value as string)}
                >
                  {groups.map(([provider, items]) => {
                    const meta = getProviderMeta(provider)
                    return (
                      <DropdownMenuGroup key={provider}>
                        <DropdownMenuLabel className="text-3xs font-medium tracking-wider uppercase">
                          {meta.label}
                        </DropdownMenuLabel>
                        {items.map((m) => (
                          <DropdownMenuRadioItem
                            key={`${provider}::${m.id}`}
                            value={`${provider}::${m.id}`}
                            className="rounded-lg"
                          >
                            {meta.icon}
                            <span className="truncate">{m.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuGroup>
                    )
                  })}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Thinking ──────────────────────────────────────────────── */}
          {showThinking && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2.5 rounded-lg px-1.5 py-1.5">
                <RowTile className="bg-muted/70 text-muted-foreground">
                  {selectedThinking?.icon}
                </RowTile>
                <RowBody
                  label="Thinking"
                  value={selectedThinking?.label ?? thinkingLevel}
                />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 rounded-xl p-1.5">
                <DropdownMenuRadioGroup
                  value={selectedThinking?.value ?? thinkingLevel}
                  onValueChange={(value) =>
                    onThinkingLevelChange(value as ThinkingLevel)
                  }
                >
                  {thinkingLevels.map((level) => (
                    <DropdownMenuRadioItem
                      key={level.value}
                      value={level.value}
                      className="items-start rounded-lg py-1.5"
                    >
                      <span className="mt-0.5 text-muted-foreground">
                        {level.icon}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{level.label}</span>
                        <span className="text-3xs text-muted-foreground">
                          {THINKING_DESCRIPTIONS[level.value]}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* ── Mode ──────────────────────────────────────────────────── */}
          {onModeChange && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2.5 rounded-lg px-1.5 py-1.5">
                <RowTile
                  className={cn(
                    modeOption.style.softBg,
                    modeOption.style.iconAccent
                  )}
                >
                  <modeOption.Icon className="size-3.5 shrink-0" />
                </RowTile>
                <RowBody label="Mode" value={modeOption.label} />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64 rounded-xl p-1.5">
                <DropdownMenuRadioGroup
                  value={mode}
                  onValueChange={(value) => onModeChange(value as Mode)}
                >
                  {modeOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="items-start rounded-lg py-1.5"
                    >
                      <RowTile
                        className={cn(
                          option.style.softBg,
                          option.style.iconAccent
                        )}
                      >
                        <option.Icon className="size-3.5 shrink-0" />
                      </RowTile>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="line-clamp-2 text-3xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* ── Tools ─────────────────────────────────────────────────── */}
          {onModeChange && (
            <>
              <DropdownMenuSeparator className="mx-1" />
              <DropdownMenuItem
                disabled={!activeModeDto}
                onClick={() => setToolsOpen(true)}
                className="gap-2.5 rounded-lg px-1.5 py-1.5 text-muted-foreground"
              >
                <RowTile className="bg-muted/70">
                  <ListChecksIcon className="size-3.5 shrink-0" />
                </RowTile>
                Customize allowed tools…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onModeChange && (
        <ModeToolsDialog
          mode={activeModeDto}
          workspaceId={workspaceId}
          open={toolsOpen}
          onOpenChange={setToolsOpen}
        />
      )}
    </>
  )
}
