/**
 * Code (syntax) tokens — the palette that highlights code, used by both the
 * Monaco editors and the Markdown code blocks.
 *
 * Unlike the UI color tokens, these are *not* derived from the theme's chart
 * colors. They default to a fixed JetBrains Fleet palette (mirroring the Prism
 * colors in `@/shared/lib/syntax-theme`) and are exposed as explicit, editable
 * fields on the custom theme. Built-in themes keep the Fleet defaults.
 */

import type { ColorTheme, ResolvedMode } from "./types"

/**
 * Canonical syntax roles. Each maps onto a family of Monaco/Prism/hljs token
 * scopes (see `syntax-builder.ts` and `@/features/lsp`).
 */
export const CODE_TOKEN_KEYS = [
  "text",
  "comment",
  "keyword",
  "string",
  "number",
  "function",
  "type",
  "property",
  "parameter",
  "builtin",
] as const

export type CodeTokenKey = (typeof CODE_TOKEN_KEYS)[number]

/** A full set of syntax colors for a single resolved mode (`#rrggbb`). */
export type CodePalette = Record<CodeTokenKey, string>

/** A pair of code palettes, one per resolved mode. */
export interface CodePaletteSet {
  light: CodePalette
  dark: CodePalette
}

// ── Fleet defaults ───────────────────────────────────────────────────────────

/** JetBrains Fleet (dark). Mirrors `jellybeansdark` in `syntax-theme.ts`. */
export const FLEET_CODE_DARK: CodePalette = {
  text: "#d6d6dd",
  comment: "#6d6d6d",
  keyword: "#83d6c5",
  string: "#e394dc",
  number: "#ebc88d",
  function: "#ebc88d",
  type: "#87c3ff",
  property: "#af9cff",
  parameter: "#f8c762",
  builtin: "#82d2ce",
}

/** Fleet-derived light palette. Mirrors `jellybeanslight` in `syntax-theme.ts`. */
export const FLEET_CODE_LIGHT: CodePalette = {
  text: "#1a1a1a",
  comment: "#6d6d6d",
  keyword: "#006b5e",
  string: "#9a1a95",
  number: "#8a5a00",
  function: "#7a5000",
  type: "#1565c0",
  property: "#6438b0",
  parameter: "#806000",
  builtin: "#00695c",
}

/** A fresh copy of the Fleet default palette for one mode. */
export function defaultCodePalette(mode: ResolvedMode): CodePalette {
  return { ...(mode === "dark" ? FLEET_CODE_DARK : FLEET_CODE_LIGHT) }
}

/** The default Fleet code palettes for both modes. */
export function defaultCodePaletteSet(): CodePaletteSet {
  return { light: defaultCodePalette("light"), dark: defaultCodePalette("dark") }
}

/** Resolve a theme's code palette for a mode, falling back to Fleet defaults. */
export function resolveCodePalette(
  theme: Pick<ColorTheme, "code">,
  mode: ResolvedMode
): CodePalette {
  return theme.code?.[mode] ?? defaultCodePalette(mode)
}

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidCodePalette(value: unknown): value is CodePalette {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return CODE_TOKEN_KEYS.every((key) => typeof record[key] === "string")
}

// ── Editor metadata ─────────────────────────────────────────────────────────

export interface CodeTokenField {
  key: CodeTokenKey
  label: string
}

/** Labeled fields for the code-token section of the theme editor. */
export const CODE_TOKEN_FIELDS: CodeTokenField[] = [
  { key: "text", label: "Text / default" },
  { key: "comment", label: "Comment" },
  { key: "keyword", label: "Keyword" },
  { key: "string", label: "String" },
  { key: "number", label: "Number / constant" },
  { key: "function", label: "Function" },
  { key: "type", label: "Type / class" },
  { key: "property", label: "Property / key" },
  { key: "parameter", label: "Parameter" },
  { key: "builtin", label: "Built-in" },
]
