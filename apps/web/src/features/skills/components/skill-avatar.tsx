import { Container } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * Skill icon box — mirrors the muted icon treatment used elsewhere in the app
 * (e.g. the LSP settings card's per-language icon), rather than inventing a
 * new colorful-avatar visual language for this one feature.
 */
export function SkillAvatar({ className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-muted/60 ring-1 ring-foreground/5",
        className
      )}
      aria-hidden
    >
      <Container className="size-4 text-muted-foreground/70" />
    </div>
  )
}
