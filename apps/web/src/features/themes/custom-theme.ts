/**
 * The user-editable "Custom" theme.
 *
 * Built-in themes are static module data; the custom theme's palettes instead
 * live in the `custom_theme` app setting as JSON and are reconstructed into a
 * {@link ColorTheme} at runtime. This module owns the (de)serialization,
 * validation, a sensible default seed, and the grouped token metadata that
 * drives the editor UI.
 */

import {
  THEME_COLOR_KEYS,
  themeRadius,
  type ColorTheme,
  type CustomThemeData,
  type ThemeColorKey,
  type ThemePalette,
} from "./types"

/** The reserved id for the custom theme. */
export const CUSTOM_THEME_ID = "custom"

/** Build a {@link ColorTheme} from stored custom data. */
export function customThemeFromData(data: CustomThemeData): ColorTheme {
  return {
    id: CUSTOM_THEME_ID,
    name: "Custom",
    description: "Your own palette. Edit every token below.",
    group: "Custom",
    radius: data.radius,
    light: data.light,
    dark: data.dark,
  }
}

/** Seed custom data by cloning an existing theme's palettes. */
export function customDataFromTheme(base: ColorTheme): CustomThemeData {
  return {
    light: { ...base.light },
    dark: { ...base.dark },
    radius: themeRadius(base),
  }
}

function isValidPalette(value: unknown): value is ThemePalette {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return THEME_COLOR_KEYS.every((key) => typeof record[key] === "string")
}

/**
 * Parse the stored JSON into {@link CustomThemeData}. Anything missing or
 * malformed falls back to the provided base theme, so the editor never has to
 * deal with holes and a corrupt setting can't break rendering.
 */
export function parseCustomData(
  raw: string | null | undefined,
  base: ColorTheme
): CustomThemeData {
  const fallback = customDataFromTheme(base)
  if (!raw) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (typeof parsed !== "object" || parsed === null) return fallback

  const obj = parsed as Partial<CustomThemeData>
  return {
    light: isValidPalette(obj.light) ? obj.light : fallback.light,
    dark: isValidPalette(obj.dark) ? obj.dark : fallback.dark,
    radius: typeof obj.radius === "string" ? obj.radius : fallback.radius,
  }
}

export function serializeCustomData(data: CustomThemeData): string {
  return JSON.stringify(data)
}

/** Immutably set one token in one mode of the custom data. */
export function setCustomToken(
  data: CustomThemeData,
  mode: "light" | "dark",
  key: ThemeColorKey,
  value: string
): CustomThemeData {
  return {
    ...data,
    [mode]: { ...data[mode], [key]: value },
  }
}

// ── Editor metadata ─────────────────────────────────────────────────────────

export interface TokenField {
  key: ThemeColorKey
  label: string
}

export interface TokenGroup {
  title: string
  fields: TokenField[]
}

/**
 * Groups every {@link ThemeColorKey} into labeled sections for the editor. The
 * union of all `key`s here must equal `THEME_COLOR_KEYS` — a runtime assertion
 * below guards against drift.
 */
export const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: "Base",
    fields: [
      { key: "background", label: "Background" },
      { key: "foreground", label: "Foreground" },
    ],
  },
  {
    title: "Surfaces",
    fields: [
      { key: "card", label: "Card" },
      { key: "card-foreground", label: "Card text" },
      { key: "popover", label: "Popover" },
      { key: "popover-foreground", label: "Popover text" },
    ],
  },
  {
    title: "Primary & accents",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "primary-foreground", label: "Primary text" },
      { key: "secondary", label: "Secondary" },
      { key: "secondary-foreground", label: "Secondary text" },
      { key: "muted", label: "Muted" },
      { key: "muted-foreground", label: "Muted text" },
      { key: "accent", label: "Accent" },
      { key: "accent-foreground", label: "Accent text" },
      { key: "destructive", label: "Destructive" },
    ],
  },
  {
    title: "Borders & inputs",
    fields: [
      { key: "border", label: "Border" },
      { key: "input", label: "Input" },
      { key: "ring", label: "Ring" },
    ],
  },
  {
    title: "Charts & syntax",
    fields: [
      { key: "chart-1", label: "Chart 1 / keyword" },
      { key: "chart-2", label: "Chart 2 / string" },
      { key: "chart-3", label: "Chart 3 / number" },
      { key: "chart-4", label: "Chart 4 / function" },
      { key: "chart-5", label: "Chart 5 / property" },
    ],
  },
  {
    title: "Sidebar",
    fields: [
      { key: "sidebar", label: "Sidebar" },
      { key: "sidebar-foreground", label: "Sidebar text" },
      { key: "sidebar-primary", label: "Sidebar primary" },
      { key: "sidebar-primary-foreground", label: "Sidebar primary text" },
      { key: "sidebar-accent", label: "Sidebar accent" },
      { key: "sidebar-accent-foreground", label: "Sidebar accent text" },
      { key: "sidebar-border", label: "Sidebar border" },
      { key: "sidebar-ring", label: "Sidebar ring" },
    ],
  },
]

// Dev-time guard: every color key must appear in exactly one group.
if (import.meta.env.DEV) {
  const grouped = TOKEN_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
  const missing = THEME_COLOR_KEYS.filter((k) => !grouped.includes(k))
  const extra = grouped.filter((k) => !THEME_COLOR_KEYS.includes(k))
  if (missing.length || extra.length) {
    console.error(
      "[themes] TOKEN_GROUPS out of sync with THEME_COLOR_KEYS.",
      { missing, extra }
    )
  }
}
