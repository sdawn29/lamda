/**
 * Derive an xterm.js terminal palette from a theme's UI tokens, so the terminal
 * follows the active color theme (built-in or custom) instead of a fixed
 * palette. The 16 ANSI slots are mapped onto the theme's chart colors +
 * destructive; surface/cursor/selection come from the structural tokens.
 */

import type { ThemePalette } from "./types"

/** The subset of xterm's `ITheme` we set. Plain strings keep it dependency-free. */
export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

/** Append an alpha channel (0–1) to a #RRGGBB hex; passes other formats through. */
function withAlpha(color: string, a: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color.trim())) return color
  const v = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")
  return `${color}${v}`
}

export function buildTerminalTheme(p: ThemePalette): TerminalThemeColors {
  return {
    background: p.background,
    foreground: p.foreground,
    cursor: p.foreground,
    cursorAccent: p.background,
    selectionBackground: withAlpha(p.primary, 0.3),

    // Normal ANSI: structural dim → chart hues.
    black: p["muted-foreground"],
    red: p.destructive,
    green: p["chart-2"],
    yellow: p["chart-3"],
    blue: p["chart-1"],
    magenta: p["chart-5"],
    cyan: p["chart-4"],
    white: p.foreground,

    // Bright ANSI: reuse the same hues (already legible on the theme surface).
    brightBlack: p["muted-foreground"],
    brightRed: p.destructive,
    brightGreen: p["chart-2"],
    brightYellow: p["chart-3"],
    brightBlue: p["chart-1"],
    brightMagenta: p["chart-5"],
    brightCyan: p["chart-4"],
    brightWhite: p.foreground,
  }
}
