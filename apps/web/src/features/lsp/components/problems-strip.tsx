import { useState } from "react"
import { AlertTriangle, XCircle, Info } from "lucide-react"
import type { Diagnostic } from "../types"
import { SEVERITY_ERROR, SEVERITY_WARNING } from "../types"
import { cn } from "@/shared/lib/utils"

interface ProblemsStripProps {
  diagnostics: Diagnostic[]
  onJumpToLine: (line: number) => void
  /**
   * Where the strip sits in the viewer. "bottom" pins the toggle to the bottom
   * edge (like a status bar) and expands the list upward; "top" expands down.
   */
  position?: "top" | "bottom"
}

export function ProblemsStrip({
  diagnostics,
  onJumpToLine,
  position = "top",
}: ProblemsStripProps) {
  const [expanded, setExpanded] = useState(false)
  if (diagnostics.length === 0) return null

  const errors = diagnostics.filter((d) => (d.severity ?? 1) === SEVERITY_ERROR).length
  const warnings = diagnostics.filter((d) => d.severity === SEVERITY_WARNING).length
  const infos = diagnostics.length - errors - warnings
  const atBottom = position === "bottom"

  const toggle = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/30"
    >
      {errors > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="size-3.5" />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-amber-500">
          <AlertTriangle className="size-3.5" />
          {warnings}
        </span>
      )}
      {infos > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <Info className="size-3.5" />
          {infos}
        </span>
      )}
      <span className="text-muted-foreground">
        {expanded ? "Hide problems" : "Show problems"}
      </span>
    </button>
  )

  const list = expanded && (
    <ul
      className={cn(
        "max-h-48 overflow-auto bg-background/50",
        atBottom ? "border-b" : "border-t",
      )}
    >
      {diagnostics.map((d, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onJumpToLine(d.range.start.line + 1)}
            className={cn(
              "flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-muted/40",
              (d.severity ?? 1) === SEVERITY_ERROR && "text-destructive",
              d.severity === SEVERITY_WARNING && "text-amber-500",
            )}
          >
            <span className="shrink-0 font-mono text-muted-foreground">
              {d.range.start.line + 1}:{d.range.start.character + 1}
            </span>
            <span className="break-all">{d.message}</span>
            {d.source && (
              <span className="ml-auto shrink-0 text-muted-foreground">{d.source}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className={cn("bg-muted/10 text-xs", atBottom ? "border-t" : "border-b")}>
      {atBottom ? (
        <>
          {list}
          {toggle}
        </>
      ) : (
        <>
          {toggle}
          {list}
        </>
      )}
    </div>
  )
}
