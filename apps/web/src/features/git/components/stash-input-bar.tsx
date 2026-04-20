import { useEffect, useRef, useState } from "react"
import { Archive, Loader2, X } from "lucide-react"

export function StashInputBar({
  onConfirm,
  onCancel,
}: {
  onConfirm: (message: string) => Promise<void>
  onCancel: () => void
}) {
  const [message, setMessage] = useState("")
  const [stashing, setStashing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleConfirm() {
    if (stashing) return
    setStashing(true)
    try {
      await onConfirm(message.trim())
    } finally {
      setStashing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
      <Archive className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      <input
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm()
          if (e.key === "Escape") onCancel()
        }}
        placeholder="Stash message (optional) — Enter to confirm"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
      />
      {stashing ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
      ) : (
        <button
          onClick={onCancel}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Cancel</span>
        </button>
      )}
    </div>
  )
}