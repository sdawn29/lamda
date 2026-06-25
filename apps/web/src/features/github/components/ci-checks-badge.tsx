import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import type { CheckRun } from "../types"

/** Aggregate state of a set of check runs, in priority order. */
export function summarizeChecks(checks: CheckRun[]): {
  bucket: "fail" | "pending" | "pass" | "none"
  passed: number
  failed: number
  pending: number
  total: number
} {
  let passed = 0
  let failed = 0
  let pending = 0
  for (const c of checks) {
    if (c.bucket === "fail" || c.bucket === "cancel") failed++
    else if (c.bucket === "pass" || c.bucket === "skipping") passed++
    else pending++
  }
  const bucket =
    checks.length === 0
      ? "none"
      : failed > 0
        ? "fail"
        : pending > 0
          ? "pending"
          : "pass"
  return { bucket, passed, failed, pending, total: checks.length }
}

/**
 * Compact CI status pill for a branch/PR. Renders nothing when there are no
 * checks so it stays out of the way on repos without CI.
 */
export function CiChecksBadge({
  checks,
  className,
}: {
  checks: CheckRun[]
  className?: string
}) {
  const { bucket, passed, failed, total } = summarizeChecks(checks)
  if (bucket === "none") return null

  const { icon, text, tone } = (() => {
    switch (bucket) {
      case "fail":
        return {
          icon: <XCircle className="size-3" />,
          text: `${failed} failing`,
          tone: "text-destructive",
        }
      case "pending":
        return {
          icon: <Loader2 className="size-3 animate-spin" />,
          text: "Checks running",
          tone: "text-muted-foreground",
        }
      case "pass":
        return {
          icon: <CheckCircle2 className="size-3" />,
          text: `${passed}/${total} passed`,
          tone: "text-emerald-600 dark:text-emerald-500",
        }
      default:
        return {
          icon: <CircleSlash className="size-3" />,
          text: "No checks",
          tone: "text-muted-foreground",
        }
    }
  })()

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.6875rem] font-medium",
        tone,
        className,
      )}
    >
      {icon}
      {text}
    </span>
  )
}
