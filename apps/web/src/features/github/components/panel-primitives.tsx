import {
  ChevronRight,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { cn } from "@/shared/lib/utils"

/**
 * Shared building blocks for the GitHub/GitLab review panels: empty/loading
 * states, list rows, and the state-colored PR/MR icon + status-badge
 * humanizer used by both detail views.
 */

export function PanelMessage({
  loading,
  icon,
  message,
  hint,
  children,
}: {
  loading?: boolean
  icon?: React.ReactNode
  message: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
        {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground/70">
          {message}
        </p>
        {hint && (
          <p className="text-3xs leading-relaxed text-muted-foreground/40">
            {hint}
          </p>
        )}
      </div>
      {children && <div className="pt-1">{children}</div>}
    </div>
  )
}

export function Row({
  onClick,
  icon,
  title,
  titleBadge,
  meta,
  external = true,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  /** Small badge rendered next to the title, e.g. a "Draft" tag. */
  titleBadge?: React.ReactNode
  meta: React.ReactNode
  external?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-12 w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/35"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="block min-w-0 truncate text-xs font-medium">
            {title}
          </span>
          {titleBadge}
        </span>
        <span className="block truncate text-3xs text-muted-foreground">
          {meta}
        </span>
      </span>
      {external ? (
        <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : (
        <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

function RowSkeleton() {
  return (
    <div className="flex min-h-12 items-start gap-2.5 px-3 py-2.5">
      <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-2.5 w-2/5" />
      </div>
    </div>
  )
}

export function ListState({
  loading,
  empty,
  message,
}: {
  loading: boolean
  empty: boolean
  message: string
}) {
  if (loading) {
    return (
      <div className="divide-y divide-border/40">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }
  if (empty) {
    return (
      <p className="px-3 py-2 text-2xs text-muted-foreground/50">{message}</p>
    )
  }
  return null
}

/** Ghost icon button for a panel header that refetches its query root. */
export function RefreshButton({
  onClick,
  spinning,
  label = "Refresh",
}: {
  onClick: () => void
  spinning: boolean
  label?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <RefreshCw className={cn("size-3.5", spinning && "animate-spin")} />
    </Button>
  )
}

/**
 * State-colored icon for a PR/MR list row. `openState` is the lowercased
 * open-state string for the provider ("open" on GitHub, "opened" on GitLab).
 */
export function reviewItemStateIcon(
  state: string,
  isDraft: boolean,
  openState: string = "open"
) {
  const normalized = state.toLowerCase()
  if (isDraft) {
    return <GitPullRequestDraft className="size-3.5 text-muted-foreground" />
  }
  if (normalized === "merged") {
    return (
      <GitMerge className="size-3.5 text-purple-600 dark:text-purple-400" />
    )
  }
  if (normalized === "closed") {
    return (
      <GitPullRequestClosed className="size-3.5 text-red-600 dark:text-red-500" />
    )
  }
  if (normalized === openState) {
    return <GitPullRequest className="size-3.5 text-emerald-600" />
  }
  return <GitPullRequest className="size-3.5 text-muted-foreground" />
}

type StatusTone = "positive" | "negative" | "neutral"

const KNOWN_STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "Open", tone: "positive" },
  opened: { label: "Open", tone: "positive" },
  merged: { label: "Merged", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  mergeable: { label: "Mergeable", tone: "positive" },
  conflicting: { label: "Conflicts", tone: "negative" },
  unknown: { label: "Unknown", tone: "neutral" },
  review_required: { label: "Review required", tone: "neutral" },
  changes_requested: { label: "Changes requested", tone: "negative" },
  approved: { label: "Approved", tone: "positive" },
  can_be_merged: { label: "Mergeable", tone: "positive" },
  cannot_be_merged: { label: "Conflicts", tone: "negative" },
  cannot_be_merged_recheck: { label: "Checking", tone: "neutral" },
  unchecked: { label: "Checking", tone: "neutral" },
  checking: { label: "Checking", tone: "neutral" },
  preparing: { label: "Preparing", tone: "neutral" },
}

/** Title-cases a raw SNAKE_CASE/lower_snake status into readable text. */
function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function humanizeStatus(raw: string): { label: string; tone: StatusTone } {
  const known = KNOWN_STATUSES[raw.toLowerCase()]
  if (known) return known
  return { label: titleCase(raw), tone: "neutral" }
}

/** Badge for a raw API status value (mergeable state, review decision, ...). */
export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null
  const { label, tone } = humanizeStatus(value)
  return (
    <Badge
      variant={tone === "negative" ? "destructive" : "outline"}
      className={cn(
        tone === "positive" && "text-emerald-600 dark:text-emerald-500"
      )}
    >
      {label}
    </Badge>
  )
}
