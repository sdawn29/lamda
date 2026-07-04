# Themes

lamda's theme engine controls UI colors, code syntax highlighting, Monaco editor colors, terminal colors, fonts, and corner styling.

> Screenshot needed: capture `/settings/appearance` with the theme swatch grid visible.

## Pick a Built-In Theme

1. Open `Settings -> Appearance`.
2. Choose light, dark, or system mode.
3. Select a color theme from the swatch grid.
4. Confirm chat, file tabs, diffs, terminal, and settings update together.

Built-in themes include Jellybeans, Graphite, macOS, Nord, Rose Pine, Solarized, Catppuccin, Cursor Anysphere, and Tokyo Night.

## Edit a Custom Theme

1. Open `Settings -> Appearance`.
2. Select the custom theme option.
3. Open the theme editor.
4. Adjust design tokens by group.
5. Preview changes live.
6. Save when the palette works across chat, diffs, and terminal output.

> Screenshot needed: capture the custom theme editor open in `/settings/appearance`.

## Configure Fonts

1. Open `Settings -> Appearance`.
2. Choose a UI font.
3. Choose a code font.
4. Browse Google Fonts if you want a font outside the bundled list.

Bundled defaults include Geist for UI and JetBrains Mono for code.

## What Themes Affect

| Area        | Effect                                              |
| ----------- | --------------------------------------------------- |
| Chat        | Message surfaces, code blocks, markdown, tool calls |
| Git diffs   | Insertions, deletions, headers, file status colors  |
| File viewer | Monaco editor background, foreground, syntax tokens |
| Terminal    | xterm.js palette and cursor colors                  |
| Settings    | Inputs, cards, controls, sidebar, dialogs           |

## Screenshot Checklist

For docs-site images, capture:

1. `Settings -> Appearance` with built-in themes.
2. Custom theme editor.
3. A chat thread with code blocks under the selected theme.
4. A git diff under the selected theme.
5. A terminal tab under the selected theme.
