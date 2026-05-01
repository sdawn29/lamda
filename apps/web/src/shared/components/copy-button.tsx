import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Copy message"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1500)
      }}
      className="opacity-0 group-hover:opacity-100"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}
