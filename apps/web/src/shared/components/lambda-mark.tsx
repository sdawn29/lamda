import { cn } from "@/shared/lib/utils"

// Lamda brand colors. The tile stays dark in both themes (like an app icon);
// only the ring adapts so the edge remains visible on light backgrounds.
const TILE_COLOR = "#1c1c1e"
const LAMBDA_GOLD = "#d4a017"

interface LambdaMarkProps {
  size?: "sm" | "md"
  className?: string
}

export function LambdaMark({ size = "md", className }: LambdaMarkProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl shadow-md ring-1 ring-black/10 dark:ring-white/5",
        size === "md" ? "size-14" : "size-12",
        className
      )}
      style={{ backgroundColor: TILE_COLOR }}
    >
      <span
        className={cn(
          "leading-none font-black",
          size === "md" ? "text-3xl" : "text-2xl"
        )}
        style={{ color: LAMBDA_GOLD }}
      >
        Λ
      </span>
    </div>
  )
}
