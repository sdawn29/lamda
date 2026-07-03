import { useEffect, useRef, useState } from "react"
import { Archive, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"

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
    <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <Archive className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      <Input
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm()
          if (e.key === "Escape") onCancel()
        }}
        placeholder="Stash message (optional) — Enter to confirm"
        className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
      />
      {stashing ? (
        <LoadingSpinner size="sm" />
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          className="shrink-0 text-muted-foreground/50"
        >
          <X />
          <span className="sr-only">Cancel</span>
        </Button>
      )}
    </div>
  )
}
