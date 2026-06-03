/**
 * Type model for the theming engine.
 *
 * A theme is a pair of {@link ThemePalette}s (one per resolved mode) plus a
 * little metadata. The palette keys are exactly the CSS custom properties the
 * app's design tokens map to in `index.css` (`@theme inline`), minus the
 * leading `--`. The engine writes these into a managed `<style>` element at
 * runtime so the whole UI re-skins without touching any component.
 */

import type { CSSProperties } from "react"

import type { CodePaletteSet } from "./code-tokens"

/** User-facing color-scheme preference. `system` follows the OS. */
export type ThemeMode = "dark" | "light" | "system"

/** The concrete scheme after resolving `system`. */
export type ResolvedMode = "dark" | "light"

/**
 * Canonical list of color tokens every theme must define. Keep this in sync
 * with the `--color-*` mappings in `apps/web/src/index.css`.
 */
export const THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]

/** A full set of color values for a single resolved mode. */
export type ThemePalette = Record<ThemeColorKey, string>

/** A react-syntax-highlighter style object (Prism or hljs flavored). */
export type SyntaxTheme = Record<string, CSSProperties>

/** Prism + hljs palettes for one resolved mode. */
export interface SyntaxThemeSet {
  prism: SyntaxTheme
  hljs: SyntaxTheme
}

/**
 * A complete color theme: metadata + a palette per mode. `syntax` is optional —
 * when omitted the engine derives a coherent code-highlighting palette from the
 * UI tokens (see `syntax-builder.ts`).
 */
export interface ColorTheme {
  /** Stable identifier persisted in settings. */
  id: string
  /** Human-readable name shown in the picker. */
  name: string
  /** One-line description / mood. */
  description?: string
  /** Short grouping tag (e.g. palette family or author). */
  group?: string
  /** Base corner radius, e.g. `0.5rem`. Defaults to `0.5rem` when omitted. */
  radius?: string
  light: ThemePalette
  dark: ThemePalette
  /**
   * Syntax-highlighting colors for the editor and Markdown code blocks. Falls
   * back to the fixed Fleet defaults when absent (see `code-tokens.ts`); only
   * the custom theme overrides them.
   */
  code?: CodePaletteSet
  /** Hand-tuned code palettes; generated from the UI tokens when absent. */
  syntax?: {
    light: SyntaxThemeSet
    dark: SyntaxThemeSet
  }
}

/** Resolve a theme's radius, falling back to the app default. */
export function themeRadius(theme: ColorTheme): string {
  return theme.radius ?? "0.5rem"
}

/**
 * The user-editable theme. Unlike built-ins (which are static module data) its
 * palettes live in app settings as JSON, so it is reconstructed at runtime from
 * {@link CustomThemeData}.
 */
export interface CustomThemeData {
  light: ThemePalette
  dark: ThemePalette
  /** Editable syntax-highlighting colors (seeded from the Fleet defaults). */
  code: CodePaletteSet
  radius: string
}
