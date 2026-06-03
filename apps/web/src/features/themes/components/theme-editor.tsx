import * as React from "react"

import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { BUILT_IN_THEMES } from "../registry"
import { customDataFromTheme, TOKEN_GROUPS } from "../custom-theme"
import { CODE_TOKEN_FIELDS } from "../code-tokens"
import { useTheme } from "../theme-engine"
import type { ResolvedMode } from "../types"

/** Native `<input type="color">` only accepts 7-char hex; coerce best-effort. */
function toHexInput(value: string): string {
  const v = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return "#" + v.slice(1).split("").map((c) => c + c).join("")
  }
  return "#000000"
}

/**
 * Full token editor for the custom theme. Edits write straight through to the
 * persisted `custom_theme` setting; when the custom theme is the active one the
 * change previews live (the engine re-injects on every settings change).
 */
export function ThemeEditor() {
  const {
    customData,
    updateCustomToken,
    updateCustomCodeToken,
    setCustomData,
    resolvedTheme,
    isCustomActive,
  } = useTheme()

  // Default to editing whatever mode is currently visible.
  const [editMode, setEditMode] = React.useState<ResolvedMode>(resolvedTheme)
  const palette = customData[editMode]
  const codePalette = customData.code[editMode]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          value={[editMode]}
          onValueChange={(values) => {
            // Single-select: take the newly added value, ignore deselection.
            const next = values.find((v) => v !== editMode)
            if (next === "light" || next === "dark") setEditMode(next)
          }}
        >
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
        </ToggleGroup>

        <Select
          value=""
          onValueChange={(id) => {
            const base = BUILT_IN_THEMES.find((t) => t.id === id)
            if (base) setCustomData(customDataFromTheme(base))
          }}
        >
          <SelectTrigger className="min-w-40" aria-label="Start from a preset">
            <SelectValue placeholder="Start from preset…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {BUILT_IN_THEMES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {editMode !== resolvedTheme && (
        <p className="text-xs text-muted-foreground">
          Editing the {editMode} palette while the app is in {resolvedTheme}{" "}
          mode — switch the app to {editMode} mode to preview these changes.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {TOKEN_GROUPS.map((group) => (
          <fieldset key={group.title} className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              {group.title}
            </legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {group.fields.map((field) => (
                <TokenRow
                  key={field.key}
                  label={field.label}
                  value={palette[field.key]}
                  onChange={(value) =>
                    updateCustomToken(editMode, field.key, value)
                  }
                  disabled={!isCustomActive}
                />
              ))}
            </div>
          </fieldset>
        ))}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">
            Code tokens
          </legend>
          <p className="-mt-1 mb-1 text-xs text-muted-foreground">
            Syntax colors for the code editor and Markdown code blocks.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {CODE_TOKEN_FIELDS.map((field) => (
              <TokenRow
                key={field.key}
                label={field.label}
                value={codePalette[field.key]}
                onChange={(value) =>
                  updateCustomCodeToken(editMode, field.key, value)
                }
                disabled={!isCustomActive}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">
            Shape
          </legend>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-sm">Corner radius</span>
              <Input
                value={customData.radius}
                onChange={(e) =>
                  setCustomData({ ...customData, radius: e.target.value })
                }
                className="h-7 w-28 font-mono text-xs"
                aria-label="Corner radius"
                placeholder="0.5rem"
              />
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  )
}

function TokenRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="truncate text-sm" title={label}>
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="color"
          value={toHexInput(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} color`}
          className={cn(
            "size-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5",
            "disabled:pointer-events-none disabled:opacity-50",
            "[&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0",
            "[&::-webkit-color-swatch-wrapper]:p-0"
          )}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} value`}
          className="h-7 w-24 font-mono text-xs"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
