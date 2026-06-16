import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * Shared chrome for the chat transcript's collapsible blocks (tool calls, tool
 * run groups, the working block). Keeping the trigger row, chevron, collapsible
 * body, and nested-content indent in one place is what keeps their padding,
 * spacing, and font size coherent — they used to drift between copies.
 */

/**
 * The clickable header of a collapsible block. Renders as inline-looking text
 * with no card chrome: hovering doesn't paint a background, it just lifts the
 * dim content toward the foreground (see DISCLOSURE_LABEL_DONE and the dim
 * helpers below, which key their brightening off this row's `group/row`).
 */
export const DISCLOSURE_ROW_CLASS =
  "group/row flex w-fit max-w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-xs"

/** Indent + left rule wrapping a block's nested child rows. */
export const NESTED_BODY_CLASS =
  "mt-1.5 ml-[5px] flex flex-col gap-1 border-l border-border/40 pl-3.5"

/** Muted label tone for a settled (done) block header — brightens on row hover. */
export const DISCLOSURE_LABEL_DONE =
  "text-muted-foreground/55 transition-colors group-hover/row:text-foreground/80"

/** Dim secondary text (file path / summary / counts) that lifts on row hover. */
export const DISCLOSURE_DIM =
  "text-muted-foreground/40 transition-colors group-hover/row:text-muted-foreground/70"

export function DisclosureChevron({
  expanded,
  /** Hide until the row is hovered while collapsed — used by the leaf rows that
   * shouldn't advertise expandability at rest. The working block keeps it
   * always visible by leaving this false. */
  revealOnHover = false,
}: {
  expanded: boolean
  revealOnHover?: boolean
}) {
  return (
    <ChevronRightIcon
      className={cn(
        "h-3 w-3 shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover/row:text-muted-foreground/60",
        expanded
          ? "rotate-90 opacity-100"
          : revealOnHover
            ? "opacity-0 group-hover/row:opacity-100"
            : "opacity-100"
      )}
    />
  )
}

/**
 * Height-animating collapsible region. The grid-rows 1fr→0fr trick animates
 * height without measuring; children stay mounted (so heavy content is gated by
 * the caller via `open`, not by unmounting).
 */
export function CollapsibleBody({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
