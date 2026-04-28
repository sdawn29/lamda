export const SHORTCUT_ACTIONS = {
  TOGGLE_SIDEBAR: "toggle_sidebar",
  TOGGLE_DIFF_PANEL: "toggle_diff_panel",
  TOGGLE_TERMINAL: "toggle_terminal",
  TOGGLE_FILE_TREE: "toggle_file_tree",
  TOGGLE_FULLSCREEN_DIFF: "toggle_fullscreen_diff",
  NEW_THREAD: "new_thread",
  NEW_WORKSPACE: "new_workspace",
  FOCUS_CHAT: "focus_chat",
  STOP_GENERATION: "stop_generation",
  TOGGLE_THEME: "toggle_theme",
  OPEN_SETTINGS: "open_settings",
  RENAME_THREAD: "rename_thread",
  NAVIGATE_BACK: "navigate_back",
  NAVIGATE_FORWARD: "navigate_forward",
  OPEN_IN_EDITOR: "open_in_editor",
  SCROLL_TO_BOTTOM: "scroll_to_bottom",
  OPEN_COMMIT_DIALOG: "open_commit_dialog",
  OPEN_COMMAND_PALETTE: "open_command_palette",
} as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[keyof typeof SHORTCUT_ACTIONS]

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggle_sidebar: "Toggle Sidebar",
  toggle_diff_panel: "Toggle Diff Panel",
  toggle_terminal: "Toggle Terminal",
  toggle_file_tree: "Toggle File Tree",
  toggle_fullscreen_diff: "Toggle Fullscreen Diff",
  new_thread: "New Thread",
  new_workspace: "New Workspace",
  focus_chat: "Focus Chat Input",
  stop_generation: "Stop Generation",
  toggle_theme: "Toggle Theme",
  open_settings: "Open Settings",
  rename_thread: "Rename Thread",
  navigate_back: "Go Back",
  navigate_forward: "Go Forward",
  open_in_editor: "Open in Editor",
  scroll_to_bottom: "Scroll to Bottom",
  open_commit_dialog: "Open Commit Dialog",
  open_command_palette: "Open Command Palette",
}

// Order for display in settings
export const SHORTCUT_ACTION_ORDER: ShortcutAction[] = [
  "open_command_palette",
  "toggle_sidebar",
  "toggle_diff_panel",
  "toggle_terminal",
  "toggle_file_tree",
  "toggle_fullscreen_diff",
  "new_thread",
  "new_workspace",
  "focus_chat",
  "stop_generation",
  "toggle_theme",
  "open_settings",
  "rename_thread",
  "navigate_back",
  "navigate_forward",
  "open_in_editor",
  "scroll_to_bottom",
  "open_commit_dialog",
]

// Bindings use: mod (cmd/ctrl), shift, alt; plus a key name (lowercase)
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  toggle_sidebar: "mod+b",
  toggle_diff_panel: "mod+shift+d",
  toggle_terminal: "ctrl+`",
  toggle_file_tree: "mod+shift+f",
  toggle_fullscreen_diff: "mod+shift+enter",
  new_thread: "mod+t",
  new_workspace: "mod+shift+n",
  focus_chat: "/",
  stop_generation: "escape",
  toggle_theme: "d",
  open_settings: "mod+,",
  rename_thread: "f2",
  navigate_back: "mod+[",
  navigate_forward: "mod+]",
  open_in_editor: "mod+shift+e",
  scroll_to_bottom: "mod+arrowdown",
  open_commit_dialog: "mod+shift+c",
  open_command_palette: "mod+k",
}

// Actions that fire even when focus is in an editable element
export const BYPASS_EDITABLE_GUARD = new Set<ShortcutAction>([
  "stop_generation",
])

const KEY_DISPLAY: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  backspace: "⌫",
  delete: "Del",
  space: "Space",
  "`": "`",
  "[": "[",
  "]": "]",
  ",": ",",
  ".": ".",
  "/": "/",
  "\\": "\\",
  "'": "'",
  ";": ";",
  "-": "-",
  "=": "=",
}

function formatPart(p: string, isMac: boolean): string {
  if (p === "mod") return isMac ? "⌘" : "Ctrl"
  if (p === "shift") return isMac ? "⇧" : "Shift"
  if (p === "alt") return isMac ? "⌥" : "Alt"
  if (p === "ctrl") return isMac ? "⌃" : "Ctrl"
  if (KEY_DISPLAY[p]) return KEY_DISPLAY[p]
  if (p.startsWith("f") && /^f\d+$/.test(p)) return p.toUpperCase()
  return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
}

/** Returns each key part as a separate string, suitable for rendering as individual Kbd elements. */
export function formatBindingParts(binding: string): string[] {
  if (!binding) return []
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  return binding.toLowerCase().split("+").map((p) => formatPart(p, isMac))
}

export function formatBinding(binding: string): string {
  if (!binding) return "—"
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  return binding.toLowerCase().split("+").map((p) => formatPart(p, isMac)).join(isMac ? "" : "+")
}

const KEY_ALIASES: Record<string, string> = {
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  escape: "Escape",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  space: " ",
  f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5",
  f6: "F6", f7: "F7", f8: "F8", f9: "F9", f10: "F10",
  f11: "F11", f12: "F12",
}

export function matchesBinding(event: KeyboardEvent, binding: string): boolean {
  if (!binding) return false

  const parts = binding.toLowerCase().split("+")
  const keyName = parts[parts.length - 1]
  const hasMod = parts.includes("mod")
  const hasShift = parts.includes("shift")
  const hasAlt = parts.includes("alt")
  const hasCtrl = parts.includes("ctrl")

  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  // mod = Cmd on Mac, Ctrl on Win/Linux
  // ctrl = literal Control key on all platforms
  const expectMeta = isMac && hasMod
  const expectCtrl = (!isMac && hasMod) || hasCtrl

  if (expectMeta !== event.metaKey) return false
  if (expectCtrl !== event.ctrlKey) return false
  if (hasShift !== event.shiftKey) return false
  if (hasAlt !== event.altKey) return false

  const expectedKey = KEY_ALIASES[keyName] ?? keyName
  return event.key === expectedKey || event.key.toLowerCase() === keyName
}

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt"])

export function eventToBinding(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return ""

  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const parts: string[] = []

  // On Mac: Cmd → "mod", Ctrl → "ctrl" (kept separate so ctrl+` doesn't conflict with Cmd+`)
  // On Win/Linux: Ctrl → "mod"
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("mod")
  if (isMac && event.ctrlKey) parts.push("ctrl")
  if (event.shiftKey) parts.push("shift")
  if (event.altKey) parts.push("alt")

  parts.push(event.key.toLowerCase())
  return parts.join("+")
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest("input, textarea, select, [contenteditable='true']")
}
