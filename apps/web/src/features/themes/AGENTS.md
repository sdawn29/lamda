# AGENTS.md — web/src/features/themes

> The theming engine. Last updated: 2026-06-03

## Purpose

Runtime theming for the entire app. Manages two orthogonal axes — **mode**
(light / dark / system) and **color theme** (which palette fills the design
tokens) — persists both to the server-backed app settings store, and applies
the active palette by injecting CSS custom properties. Also derives code-block
syntax-highlighting palettes from the active theme.

## Status

✅ **Implemented.**

## Architecture

```
themes/
├── types.ts             — ThemeMode, token keys, ThemePalette, ColorTheme, CustomThemeData
├── registry.ts          — built-in themes + getThemeById (default = jellybeans)
├── custom-theme.ts      — editable custom theme: (de)serialize, seed, TOKEN_GROUPS
├── apply-theme.ts       — injects :root/.dark CSS vars into a managed <style>
├── syntax-builder.ts    — derives Prism/hljs palettes from UI tokens
├── terminal-theme.ts    — derives an xterm.js ITheme from UI tokens
├── theme-engine.tsx     — ThemeProvider + useTheme (the single source of truth)
├── use-syntax-theme.ts  — useSyntaxTheme() hook for code blocks
├── components/
│   ├── theme-picker.tsx — swatch grid (built-ins + custom)
│   └── theme-editor.tsx — per-token editor for the custom theme
└── index.ts             — public barrel
```

## How it works

- `ThemeProvider` reads `theme` and `color_theme` from app settings
  (`APP_SETTINGS_KEYS`). The mode toggles the `.light` / `.dark` class on
  `<html>`; the color theme is written into a `<style id="lamda-theme-vars">`
  element appended after `index.css` so its `:root` / `.dark` rules override the
  baked-in default at equal specificity.
- The default theme id (`jellybeans`) matches the palette in `index.css`, so a
  user who never picks a theme sees zero change and there is no first-paint
  flash.
- `useSyntaxTheme()` returns the active theme's `{ prism, hljs }` set for the
  resolved mode — the theme's hand-tuned palette when present, otherwise one
  derived from its UI tokens. Consumed by chat code blocks, write-view, and
  tool-call-block.

## Custom theme

A reserved theme (`CUSTOM_THEME_ID = "custom"`) is fully user-editable. Unlike
built-ins it isn't static module data — its `light`/`dark` palettes and radius
live in the `custom_theme` app setting as JSON (`CustomThemeData`) and are
reconstructed into a `ColorTheme` at runtime by `customThemeFromData`.

- First time the user selects "Custom", `setColorTheme` seeds it by cloning the
  currently active theme, so they start from a coherent palette.
- The editor (`theme-editor.tsx`) writes each change straight to the setting via
  `updateCustomToken` / `setCustomData`; because the engine re-injects on every
  settings change, edits to the active custom theme preview live.
- `parseCustomData` validates the stored JSON and falls back to the default
  theme for any missing/corrupt field, so a bad setting can never break render.
- The editor's field layout comes from `TOKEN_GROUPS`; a DEV-only assertion
  keeps it in sync with `THEME_COLOR_KEYS`.

## Adding a theme

Add a `ColorTheme` to `BUILT_IN_THEMES` in `registry.ts`. TypeScript enforces
that every `ThemeColorKey` is present in both `light` and `dark` palettes, so a
missing token is a compile error. `syntax` is optional — omit it to get a
generated code palette for free.

## Terminal & Monaco

These surfaces can't read CSS variables through their theming APIs, so they
derive concrete palettes from the active theme's tokens and re-apply live:

- **Terminal** (`terminal-panel.tsx`) builds an xterm `ITheme` via
  `buildTerminalTheme(activeColorTheme[resolvedTheme])`. The 16 ANSI slots map
  onto the chart colors + destructive. A "sync theme" effect pushes changes to
  the live `term.options.theme`; the mount effect reads the theme from a ref so
  a theme change never tears down the running session.
- **Monaco** (`lsp-integration.ts`) maps tokens onto Monaco's editor/widget
  colors (`paletteFromTokens` → `editorColors`) and token-color rules
  (`syntaxRules`, mirroring `syntax-builder`'s roles). The viewers call
  `applyMonacoTheme(activeColorTheme, isDark)` in an effect; theme names stay
  stable, so redefining + `setTheme` re-skins mounted editors. The diff
  viewer's row tints come from CSS `color-mix` over `--chart-*` / `--destructive`
  and update automatically.

## Related

- [`@/shared/components/theme-provider`](../../shared/components/theme-provider.tsx)
  — back-compat shim that re-exports `ThemeProvider` / `useTheme` from here.
- [Settings → appearance](../settings/sections/appearance.tsx) — hosts the picker.
- [Command Palette](../command-palette/AGENTS.md) — "Color Theme" command group.
