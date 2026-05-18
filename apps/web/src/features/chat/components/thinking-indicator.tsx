import { useMemo } from "react"
import { SparklesIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { useThinkingPhrases } from "@/shared/lib/thinking-visibility"

export function ThinkingIndicator({ className }: { className?: string }) {
  const phrases = useThinkingPhrases()

  const phrase = useMemo(
    () => phrases[Math.floor(Math.random() * phrases.length)] ?? phrases[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phrases.length]
  )

  return (
    <div
      className={cn(
        "flex animate-in items-center gap-1.5 self-start py-1 duration-200 fade-in-0",
        className
      )}
      aria-live="polite"
      aria-label={phrase}
    >
      <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      <span
        key={phrase}
        className="animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-sm font-medium text-transparent"
      >
        {phrase}
      </span>
    </div>
  )
}
