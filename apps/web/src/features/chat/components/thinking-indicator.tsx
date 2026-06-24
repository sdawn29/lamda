import { cn } from "@/shared/lib/utils"

// `active` toggles only opacity/animation — never layout. The indicator is kept
// mounted (and its row height reserved) even when idle so it doesn't add/remove
// height at the bottom of the transcript on turn boundaries; otherwise, with the
// view pinned to the bottom, its appearance/disappearance shifts the whole
// transcript up on send and back down on finish.
export function ThinkingIndicator({
  className,
  active = true,
}: {
  className?: string
  active?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 self-start py-1 transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live="polite"
      aria-label="Agent working"
      role="status"
      aria-hidden={!active}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1 w-1 rounded-full bg-foreground/45",
            active && "animate-thinking-dot"
          )}
          style={active ? { animationDelay: `${i * 160}ms` } : undefined}
        />
      ))}
    </div>
  )
}
