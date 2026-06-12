import { useEffect, useRef } from "react"

export function LivePre({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (live && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text, live])
  return (
    <pre
      ref={ref}
      className="max-h-64 overflow-auto break-all whitespace-pre-wrap text-foreground/80"
    >
      {text}
    </pre>
  )
}
