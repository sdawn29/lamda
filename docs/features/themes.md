# Themes Guide

lamda has a full theming engine that controls the entire app's appearance — UI colors, code-block syntax highlighting, the embedded terminal, and fonts.

## Mode vs. Color Theme

Appearance is controlled by two independent settings:

| Axis | Options | What it does |
|------|---------|--------------|
| **Mode** | Light, Dark, System | Toggles the light/dark variant of the active theme |
| **Color Theme** | Any built-in or custom theme | Picks the palette that fills the design tokens |

Both are persisted to the app settings store, so they survive restarts and apply everywhere.

## Built-in Themes

| Theme | Notes |
|-------|-------|
| **Jellybeans** | Default |
| **Graphite** | |
| **macOS** | System-like look with matching corner radius |
| **Nord** | |
| **Rosé Pine** | |
| **Solarized** | |
| **Catppuccin** | Macchiato in dark mode, Latte in light mode |
| **Cursor Anysphere** | |
| **Tokyo Night** | |

Pick a theme from the swatch grid in **Settings** → **Appearance**.

## Custom Themes

Create your own theme with the theme editor:

1. Go to **Settings** → **Appearance**
2. Select the **Custom** theme
3. Open the theme editor and adjust individual design tokens (backgrounds, foregrounds, accents, borders, …), grouped by purpose
4. Changes apply live as you edit

The custom theme is seeded from the currently active theme, so you can start from a palette you like and tweak it.

## What the Theme Controls

The active palette is applied as CSS custom properties and derived into:

- **UI colors** — every component reads from the same design tokens
- **Syntax highlighting** — code blocks in chat and Markdown use a code palette derived from the theme
- **Monaco editor** — the code/diff viewers follow the theme
- **Terminal** — the xterm.js color scheme is derived from the UI tokens

## Fonts

Configure the UI (sans) and code (mono) fonts in **Settings** → **Appearance**:

- **Bundled sans fonts**: Geist (default), Outfit, Google Sans, System UI
- **Bundled mono fonts**: JetBrains Mono (default), System Mono
- **Google Fonts**: browse the Google Fonts catalog in-app and apply any font; it is loaded on demand

## Related

- [Settings](settings.md) — All settings, including appearance
- [Terminal](terminal.md) — Terminal theming
- [Chat Interface](chat.md) — Code blocks and syntax highlighting
