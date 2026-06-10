import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * SectionLabel — the canonical "eyebrow" used to title panels, sections and
 * grouped controls throughout the app (git sections, settings groups, chat
 * cards, MCP/LSP forms). It replaces the ~11 hand-rolled variants that drifted
 * across font-size (9–10px), weight (medium/semibold), tracking (wide/wider/
 * 0.08em/0.14em) and muted opacity (/45–/70). One look, applied everywhere:
 *
 *   text-3xs · semibold · uppercase · tracking-wider · muted-foreground
 *
 * Renders a <span> by default; pass `asChild` to project the styles onto a
 * different element (e.g. a <div> or a clickable header) without an extra node.
 */
function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="section-label"
      className={cn(
        "text-3xs font-semibold tracking-wider text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

export { SectionLabel }
