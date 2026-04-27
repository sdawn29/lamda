import * as React from "react"
import { useAppSettings } from "@/features/settings/queries"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import {
  SHORTCUT_ACTIONS,
  DEFAULT_SHORTCUTS,
  BYPASS_EDITABLE_GUARD,
  matchesBinding,
  isEditableTarget,
  type ShortcutAction,
} from "@/shared/lib/keyboard-shortcuts"

type Shortcuts = Record<ShortcutAction, string>
type HandlerFn = () => void

interface KbContextValue {
  shortcuts: Shortcuts
  registerHandler: (action: ShortcutAction, handler: HandlerFn) => () => void
  updateShortcut: (action: ShortcutAction, binding: string) => void
  resetShortcuts: () => void
}

const KeyboardShortcutsContext = React.createContext<KbContextValue | undefined>(
  undefined
)

function parseStoredShortcuts(raw: string | null | undefined): Partial<Shortcuts> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Partial<Shortcuts>
  } catch {
    return {}
  }
}

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()

  const stored = parseStoredShortcuts(settings?.[APP_SETTINGS_KEYS.KEYBOARD_SHORTCUTS])

  // Memoize shortcuts to prevent creating a new object on every render.
  // This prevents the context value from changing unnecessarily.
  const shortcuts = React.useMemo<Shortcuts>(
    () => ({ ...DEFAULT_SHORTCUTS, ...stored }),
    [stored]
  )

  // Stable ref so the keydown handler always sees the latest shortcuts without re-registering.
  // Initialized with shortcuts; updated below render so keydown handler never sees stale shortcuts.
  const shortcutsRef = React.useRef(shortcuts)
  // eslint-disable-next-line react-hooks/refs -- intentional: keydown handler fires outside render
  shortcutsRef.current = shortcuts

  // Map of action → latest handler function
  const handlersRef = React.useRef<Map<ShortcutAction, HandlerFn>>(new Map())

  const registerHandler = React.useCallback(
    (action: ShortcutAction, handler: HandlerFn) => {
      handlersRef.current.set(action, handler)
      return () => {
        handlersRef.current.delete(action)
      }
    },
    []
  )

  const updateShortcut = React.useCallback(
    (action: ShortcutAction, binding: string) => {
      const next = { ...shortcutsRef.current, [action]: binding }
      updateSetting.mutate({
        key: APP_SETTINGS_KEYS.KEYBOARD_SHORTCUTS,
        value: JSON.stringify(next),
      })
    },
    [updateSetting]
  )

  const resetShortcuts = React.useCallback(() => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.KEYBOARD_SHORTCUTS,
      value: JSON.stringify(DEFAULT_SHORTCUTS),
    })
  }, [updateSetting])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return

      const currentShortcuts = shortcutsRef.current

      for (const actionKey of Object.values(SHORTCUT_ACTIONS)) {
        const action = actionKey as ShortcutAction
        const binding = currentShortcuts[action]
        if (!matchesBinding(event, binding)) continue

        // Bare-key shortcuts (no mod) skip when focus is in an editable element,
        // unless the action explicitly bypasses this guard.
        const hasMod = binding.includes("mod") || binding.includes("ctrl")
        if (!hasMod && !BYPASS_EDITABLE_GUARD.has(action) && isEditableTarget(event.target)) {
          continue
        }

        const handler = handlersRef.current.get(action)
        if (handler) {
          event.preventDefault()
          handler()
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const value = React.useMemo<KbContextValue>(
    () => ({ shortcuts, registerHandler, updateShortcut, resetShortcuts }),
    [shortcuts, registerHandler, updateShortcut, resetShortcuts]
  )

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcuts(): KbContextValue {
  const ctx = React.useContext(KeyboardShortcutsContext)
  if (!ctx) throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutsProvider")
  return ctx
}

/**
 * Register a handler for a keyboard shortcut action. The handler ref is kept
 * fresh so callers don't need to worry about stale closures.
 */
export function useShortcutHandler(action: ShortcutAction, handler: HandlerFn | null) {
  const { registerHandler } = useKeyboardShortcuts()
  const handlerRef = React.useRef(handler)

  React.useEffect(() => {
    handlerRef.current = handler
  })

  React.useEffect(() => {
    return registerHandler(action, () => handlerRef.current?.())
  }, [action, registerHandler])
}

/** Returns the current formatted binding string for an action. */
export function useShortcutBinding(action: ShortcutAction): string {
  const { shortcuts } = useKeyboardShortcuts()
  return shortcuts[action] ?? DEFAULT_SHORTCUTS[action] ?? ""
}
