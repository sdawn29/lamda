# Terminal Guide

Lamda includes an embedded terminal with multi-tab support, powered by xterm.js with a WebSocket PTY backend.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Terminal                                        [+Tab]    [×]  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ● bash ─ ~/projects/my-project                              │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │ $ git status                                                │ │
│ │ On branch main                                              │ │
│ │ Your branch is up to date with 'origin/main'.              │ │
│ │                                                             │ │
│ │ $ npm run test                                              │ │
│ │                                                             │ │
│ │ Test Suites: 5 passed, 5 total                              │ │
│ │ Tests:       42 passed, 42 total                            │ │
│ │ Time:        3.2s                                           │ │
│ │                                                             │ │
│ │ $ █                                                         │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [Tab 1] [Tab 2] [+]                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Opening the Terminal

### Keyboard Shortcut

Press the configured shortcut (default varies by platform) to toggle the terminal panel.

### Title Bar Button

Click the **Terminal** toggle button in the title bar to show/hide the terminal panel.

## Terminal Tabs

### Creating a New Tab

1. Click the **+** button or press configured shortcut
2. A new terminal tab opens with a fresh shell session
3. Tab is automatically focused

### Switching Tabs

- Click on a tab to switch to it
- Use `Cmd/Ctrl + Tab` to cycle through tabs

### Closing Tabs

- Click the **×** on individual tab to close it
- Click the trash icon to **Kill All** tabs at once

### Tab Names

Tabs display:
- Shell name (e.g., `bash`, `zsh`)
- Current working directory (truncated)

Example: `● bash ─ ~/projects/my-project`

## Terminal Operations

### Running Commands

```bash
# Navigate directories
cd src/components

# Run npm scripts
npm run dev

# Run tests
npm test

# View files
ls -la

# Search content
grep -r "function" src/

# Git operations
git log --oneline -10
```

### Input/Output

- Type commands and press **Enter** to execute
- Output displays in the terminal
- Scroll up to view previous output
- Copy text with `Cmd/Ctrl + C`

### Terminal Controls

| Control | Action |
|---------|--------|
| `Ctrl + C` | Cancel current command |
| `Ctrl + Z` | Suspend process |
| `Ctrl + D` | End of input (EOF) |
| `Ctrl + L` | Clear screen |
| `Tab` | Auto-complete |
| `↑` / `↓` | Command history |

## Themes

### Dark Theme (Default)

- Background: Dark gray (#08090a)
- Cursor: Purple (#5e5ce6)
- Text: Light gray

### Light Theme

- Background: Off-white (#fbfbfc)
- Cursor: Indigo (#5856d6)
- Text: Dark gray

### Changing Theme

1. Go to **Settings** → **Terminal**
2. Select **Theme**: Dark or Light
3. Terminal automatically updates

## Sizing

### Auto-Resize

The terminal automatically resizes to fill its panel:
- Adjusts on panel resize
- Maintains proper aspect ratio
- Fits content to available space

### Manual Resize

Drag the panel borders to resize:
- Horizontal resize changes terminal width
- Vertical resize changes terminal height

## Connection Status

### Connected

- Green indicator on active tab
- Normal terminal operation

### Disconnected

- Red indicator on tab
- "Disconnected" message
- Create a new tab to reconnect

## Shell Selection

The terminal uses your system's default shell:
- macOS/Linux: `$SHELL` environment variable or `/bin/bash`
- Can be overridden in Settings

## Working Directory

The terminal starts in your workspace directory:

```
~/projects/my-project $
```

### Changing Directory

```bash
# Change to workspace subdirectory
cd src/features

# Change to parent directory
cd ..

# Change to home directory
cd ~
```

## Integration with Chat

### Slash Commands

Use chat slash commands to interact with terminal:

```
/terminal npm run build
/terminal git status
/terminal node script.js
```

### Output Reference

The agent can reference terminal output in its responses, showing you command results and helping troubleshoot issues.

## Troubleshooting

### Terminal Not Connecting

If the terminal shows "Connecting..." indefinitely:

1. Ensure the server is running
2. Check that port 3001 is not blocked
3. Try closing and reopening the terminal panel

### "WebSocket Failed"

WebSocket connection failure:
1. Server may have crashed — restart with `npm run dev -w @lamda/server`
2. Port 3001 may be in use — check with `lsof -i :3001`

### Slow Rendering

For large outputs:
- Terminal uses 60fps flush rate for smooth rendering
- Large outputs (>8KB) bypass buffering for immediate display
- Performance optimized for typical usage

### Shell Not Found

If terminal fails to start:
1. Check that `/bin/bash` exists
2. Verify `SHELL` environment variable is set
3. In Settings, specify a valid shell path

## Tips and Tricks

### Multiple Terminals

Keep multiple terminal tabs for different tasks:
- One for running the dev server
- One for running tests
- One for git operations
- One for general exploration

### Command History

Use arrow keys to navigate command history:
- `↑` — Previous command
- `↓` — Next command
- `Ctrl + R` — Search history

### Copy/Paste

```
# Copy (select and Cmd/Ctrl + C)
Select text, then Cmd/Ctrl + C

# Paste (Cmd/Ctrl + V)
Cmd/Ctrl + V to paste in terminal
```

### Clear Screen

```
# Clear screen (keep scrollback)
Ctrl + L

# Clear scrollback buffer
Type 'clear' and press Enter
```

## Related

- [Git Integration](git.md) — Terminal git operations
- [Chat Interface](chat.md) — Slash commands for terminal
- [API Reference](../api.md) — Terminal WebSocket protocol