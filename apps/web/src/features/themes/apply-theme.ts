/**
 * Runtime application of a {@link ColorTheme}'s tokens to the document.
 *
 * The theme's two palettes are written into a single managed `<style>` element
 * appended to `<head>`. Because it is injected after `index.css`, its `:root`
 * (light) and `.dark` rules win on equal specificity, overriding the built-in
 * default palette. Switching themes only rewrites this one element's text — no
 * component re-render or class churn — so it is cheap and flicker-free.
 */

import {
  THEME_COLOR_KEYS,
  themeRadius,
  type ColorTheme,
  type ThemePalette,
} from "./types"

export const THEME_STYLE_ELEMENT_ID = "lamda-theme-vars"

function paletteToDeclarations(palette: ThemePalette): string {
  return THEME_COLOR_KEYS.map((key) => `  --${key}: ${palette[key]};`).join("\n")
}

/**
 * Build the CSS text for a theme. Mirrors the structure of `index.css`:
 * light tokens on `:root`, dark tokens on `.dark`. `--radius` is mode-agnostic
 * so it lives on `:root`.
 */
export function buildThemeCss(theme: ColorTheme): string {
  return [
    `:root {`,
    `  --radius: ${themeRadius(theme)};`,
    paletteToDeclarations(theme.light),
    `}`,
    ``,
    `.dark {`,
    paletteToDeclarations(theme.dark),
    `}`,
    ``,
  ].join("\n")
}

function getStyleElement(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null
  let el = document.getElementById(
    THEME_STYLE_ELEMENT_ID
  ) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = THEME_STYLE_ELEMENT_ID
    // Append last so the rules override index.css at equal specificity.
    document.head.appendChild(el)
  }
  return el
}

/** Apply (or update) the active theme's CSS custom properties. */
export function applyColorTheme(theme: ColorTheme): void {
  const el = getStyleElement()
  if (!el) return
  el.textContent = buildThemeCss(theme)
}
