import React from "react"
import { RotateCcw, X } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useKeyboardShortcuts } from "@/shared/components/keyboard-shortcuts-provider"
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTION_ORDER,
  SHORTCUT_LABELS,
  eventToBinding,
  type ShortcutAction,
} from "@/shared/lib/keyboard-shortcuts"
import { cn } from "@/shared/lib/utils"

function ShortcutRecorder({
  action,
  binding,
  onSave,
}: {
  action: ShortcutAction
  binding: string
  onSave: (action: ShortcutAction, newBinding: string) => void
}) {
  const [recording, setRecording] = React.useState(false)

  React.useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === "Escape") {
        setRecording(false)
        return
      }

      const newBinding = eventToBinding(e)
      if (!newBinding) return
      onSave(action, newBinding)
      setRecording(false)
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [recording, action, onSave])

  const isDefault = binding === DEFAULT_SHORTCUTS[action]

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRecording(true)}
        className={cn(
          "min-w-24",
          recording && "animate-pulse border-ring bg-primary/10 text-primary"
        )}
        title="Click to record a new shortcut"
      >
        {recording ? (
          <span className="text-xs">Press key…</span>
        ) : binding ? (
          <ShortcutKbd binding={binding} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Button>
      {!isDefault && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Reset to default"
          onClick={() => onSave(action, DEFAULT_SHORTCUTS[action])}
        >
          <RotateCcw />
          <span className="sr-only">Reset to default</span>
        </Button>
      )}
      {binding && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Clear shortcut"
          onClick={() => onSave(action, "")}
        >
          <X />
          <span className="sr-only">Clear shortcut</span>
        </Button>
      )}
    </div>
  )
}

export function ShortcutsSection() {
  const { shortcuts, updateShortcut, resetShortcuts } = useKeyboardShortcuts()
  const isAllDefault = SHORTCUT_ACTION_ORDER.every(
    (a) => (shortcuts[a] ?? DEFAULT_SHORTCUTS[a]) === DEFAULT_SHORTCUTS[a]
  )

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-border/50">
        {SHORTCUT_ACTION_ORDER.map((action) => (
          <div
            key={action}
            className="flex items-center justify-between gap-6 py-2"
          >
            <span className="text-sm">{SHORTCUT_LABELS[action]}</span>
            <ShortcutRecorder
              action={action}
              binding={shortcuts[action] ?? DEFAULT_SHORTCUTS[action]}
              onSave={updateShortcut}
            />
          </div>
        ))}
      </div>
      {!isAllDefault && (
        <div className="flex justify-end pt-3">
          <Button variant="ghost" size="sm" onClick={resetShortcuts}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset all to defaults
          </Button>
        </div>
      )}
    </div>
  )
}
