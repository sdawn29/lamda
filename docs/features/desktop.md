# Desktop App

The Electron desktop app wraps the web UI and adds native capabilities: server lifecycle management, folder selection, external app launching, update checks, and platform-aware file operations.

> Screenshot needed: capture the desktop app window with the title bar visible and a workspace open.

## Native Folder Selection

1. Open `New Workspace`.
2. Choose local folder.
3. Click browse.
4. Select a folder from the native picker.
5. Create the workspace.

In a browser-only session, paste the folder path manually instead.

## Open Workspace or File with Another App

1. Open a workspace or file tab.
2. Use `Open With`.
3. Choose an installed app such as VS Code, Cursor, Xcode, Finder, or another detected app.
4. Set a default if prompted.

> Screenshot needed: capture the `Open With` menu in the title bar on `/workspace/<threadId>`.

## Server Recovery

The desktop shell starts and monitors the Hono server.

1. If the server is unavailable, the app shows a recovery screen.
2. Use retry or restart actions.
3. Check logs in `~/.lamda-code/logs/` if the server repeatedly fails.

> Screenshot needed: capture the server unavailable screen if reproducible.

## Updates

1. Open `Settings -> About` or `Settings -> Updates` if present.
2. Check for updates.
3. Download when an update is available.
4. Install and restart.

> Screenshot needed: capture the update dialog or update section with a downloaded update available.

## Browser Fallback

When running the web app in a browser, desktop-only APIs use safe fallbacks. Folder browsing, external app launching, and auto-update installation are Electron-only features.
