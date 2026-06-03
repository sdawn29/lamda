import { Check } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { useTheme } from "../theme-engine"
import { themeRadius, type ColorTheme, type ResolvedMode } from "../types"

/**
 * A grid of selectable theme swatches. Each card renders a miniature of the
 * theme's actual tokens for the currently resolved mode, so the preview always
 * matches what selecting it will produce.
 */
export function ThemePicker() {
  const { colorThemes, colorTheme, setColorTheme, resolvedTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {colorThemes.map((theme) => (
        <ThemeSwatch
          key={theme.id}
          theme={theme}
          mode={resolvedTheme}
          selected={theme.id === colorTheme}
          onSelect={() => setColorTheme(theme.id)}
        />
      ))}
    </div>
  )
}

function ThemeSwatch({
  theme,
  mode,
  selected,
  onSelect,
}: {
  theme: ColorTheme
  mode: ResolvedMode
  selected: boolean
  onSelect: () => void
}) {
  const p = theme[mode]
  const radius = themeRadius(theme)

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "border-primary ring-primary/40 ring-2"
          : "border-border hover:border-muted-foreground/40"
      )}
    >
      {/* Miniature UI rendered with the theme's own tokens. */}
      <div
        className="flex h-16 overflow-hidden border"
        style={{
          background: p.background,
          borderColor: p.border,
          borderRadius: `calc(${radius} * 0.8)`,
        }}
      >
        {/* Sidebar strip */}
        <div
          className="flex w-1/4 flex-col gap-1 p-1.5"
          style={{ background: p.sidebar }}
        >
          <span
            className="h-1.5 w-full rounded-full"
            style={{ background: p["sidebar-primary"] }}
          />
          <span
            className="h-1 w-3/4 rounded-full"
            style={{ background: p["sidebar-accent"] }}
          />
          <span
            className="h-1 w-2/3 rounded-full"
            style={{ background: p["sidebar-accent"] }}
          />
        </div>
        {/* Content area with a card + accent chips */}
        <div className="flex flex-1 flex-col gap-1 p-1.5">
          <div
            className="flex flex-1 flex-col justify-center gap-1 px-1.5"
            style={{
              background: p.card,
              borderRadius: `calc(${radius} * 0.5)`,
            }}
          >
            <span
              className="h-1.5 w-full rounded-full"
              style={{ background: p.foreground, opacity: 0.85 }}
            />
            <span
              className="h-1 w-1/2 rounded-full"
              style={{ background: p["muted-foreground"] }}
            />
          </div>
          <div className="flex gap-1">
            <span
              className="h-2.5 w-5 rounded-full"
              style={{ background: p.primary }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: p["chart-2"] }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: p["chart-4"] }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="truncate text-sm font-medium">{theme.name}</span>
        {selected && (
          <Check className="text-primary size-4 shrink-0" aria-hidden />
        )}
      </div>
    </button>
  )
}
