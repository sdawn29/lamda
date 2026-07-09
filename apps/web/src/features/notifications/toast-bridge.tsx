import { useEffect } from "react"
import { useSonner, type ToastT } from "sonner"
import { useNotificationStore, type NotificationVariant } from "./store"

function variantFor(type: ToastT["type"]): NotificationVariant {
  switch (type) {
    case "success":
      return "success"
    case "error":
      return "error"
    case "warning":
      return "warning"
    case "info":
      return "info"
    default:
      return "default"
  }
}

function titleFor(type: ToastT["type"]): string {
  switch (type) {
    case "success":
      return "Success"
    case "error":
      return "Error"
    case "warning":
      return "Warning"
    case "loading":
      return "Working…"
    default:
      return "Notification"
  }
}

/** Sonner's `title`/`description` accept nodes/functions; only plain strings are worth persisting. */
function asText(value: ToastT["title"]): string | undefined {
  return typeof value === "string" ? value : undefined
}

/**
 * Mirrors every toast raised anywhere in the app (via `toast.*()` from
 * "sonner") into the persistent notification store, so the notification
 * center is a durable history of everything the app has told the user — not
 * just background indexing progress. `useSonner()` subscribes to sonner's
 * single global toast store, so this catches every call site without any of
 * them needing to change. Renders nothing; mount once near `<Toaster />`.
 */
export function ToastNotificationBridge() {
  const { toasts } = useSonner()
  const upsert = useNotificationStore((s) => s.upsert)

  useEffect(() => {
    for (const t of toasts) {
      // Loading toasts are transient placeholders (usually replaced in place
      // by a success/error toast with the same id) — not worth a history entry.
      if (t.type === "loading") continue
      upsert(`toast-${t.id}`, {
        kind: "toast",
        title: asText(t.title) ?? titleFor(t.type),
        description: asText(t.description),
        variant: variantFor(t.type),
      })
    }
    // Deliberately no dependency on the store's `upsert` identity concerns —
    // zustand actions are stable references. Re-runs whenever sonner's active
    // toast list changes (new toast, content update); toasts already written
    // here are left in the notification store even after sonner dismisses them.
  }, [toasts, upsert])

  return null
}
