import { useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react"
import { openExternal } from "@/features/electron/api"
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

export type MergeReadinessKind =
  | "merged"
  | "closed"
  | "draft"
  | "ready"
  | "conflicts"
  | "checking"

/**
 * Derives the merge-readiness of a PR/MR from provider data. Accepts both
 * vocabularies: GitHub `MERGEABLE`/`CONFLICTING` and GitLab
 * `can_be_merged`/`cannot_be_merged`; anything else (UNKNOWN, GitLab
 * checking states, null) counts as still checking.
 */
export function mergeReadinessKind(
  state: string,
  isDraft: boolean,
  mergeStatus: string | null | undefined
): MergeReadinessKind {
  const normalizedState = state.toLowerCase()
  if (normalizedState === "merged") return "merged"
  if (normalizedState === "closed") return "closed"
  if (isDraft) return "draft"
  const normalizedStatus = mergeStatus?.toLowerCase() ?? null
  if (normalizedStatus === "can_be_merged" || normalizedStatus === "mergeable")
    return "ready"
  if (
    normalizedStatus === "cannot_be_merged" ||
    normalizedStatus === "conflicting"
  )
    return "conflicts"
  return "checking"
}

/** Slim tinted strip summarizing whether the PR/MR can be merged right now. */
export function MergeReadinessBanner({
  kind,
  baseRefName,
}: {
  kind: MergeReadinessKind
  baseRefName: string
}) {
  const { icon, text, tone } = (() => {
    switch (kind) {
      case "merged":
        return {
          icon: <GitMerge className="size-3.5 shrink-0" aria-hidden />,
          text: "Merged",
          tone: "border-purple-600/25 bg-purple-500/10 text-purple-600 dark:text-purple-400",
        }
      case "closed":
        return {
          icon: (
            <GitPullRequestClosed className="size-3.5 shrink-0" aria-hidden />
          ),
          text: "Closed",
          tone: "border-border/60 bg-muted/40 text-muted-foreground",
        }
      case "draft":
        return {
          icon: (
            <GitPullRequestDraft className="size-3.5 shrink-0" aria-hidden />
          ),
          text: "Draft — mark as ready before merging",
          tone: "border-border/60 bg-muted/40 text-muted-foreground",
        }
      case "ready":
        return {
          icon: <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />,
          text: "Ready to merge",
          tone: "border-emerald-600/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
        }
      case "conflicts":
        return {
          icon: <XCircle className="size-3.5 shrink-0" aria-hidden />,
          text: `Has conflicts with ${baseRefName}`,
          tone: "border-destructive/25 bg-destructive/10 text-destructive",
        }
      default:
        return {
          icon: (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ),
          text: "Checking mergeability…",
          tone: "border-border/60 bg-muted/40 text-muted-foreground",
        }
    }
  })()

  return (
    <div
      className={cn(
        "flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        tone
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{text}</span>
    </div>
  )
}

/** Provider-agnostic check/job row for the merge box summary. */
export interface ChecksSummaryItem {
  name: string
  state: string
  bucket: string
  link: string | null
  /** Grouping prefix — GitHub workflow / GitLab pipeline stage. */
  group: string | null
}

/**
 * One-line CI summary ("3/5 checks passed" + overall icon) that expands into
 * the per-check rows. Collapsed by default.
 */
export function CollapsibleChecksSummary({
  items,
  noun = "checks",
}: {
  items: ChecksSummaryItem[]
  noun?: string
}) {
  const [open, setOpen] = useState(false)

  let passed = 0
  let failed = 0
  for (const item of items) {
    if (item.bucket === "fail" || item.bucket === "cancel") failed++
    else if (item.bucket === "pass" || item.bucket === "skipping") passed++
  }
  const pending = items.length - passed - failed
  const overall = failed > 0 ? "fail" : pending > 0 ? "pending" : "pass"

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className="overflow-hidden rounded-lg border border-border/45 bg-background/65">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/30"
      >
        <Chevron className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        {overall === "fail" ? (
          <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden />
        ) : overall === "pending" ? (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : (
          <CheckCircle2
            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500"
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate">
          {passed}/{items.length} {noun} passed
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-border/40 border-t border-border/45">
          {items.map((item) => (
            <button
              key={`${item.group}-${item.name}`}
              type="button"
              disabled={!item.link}
              onClick={() => item.link && void openExternal(item.link)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30 disabled:cursor-default"
            >
              <span className="min-w-0 truncate">
                {item.group ? `${item.group} / ` : ""}
                {item.name}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-3xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    item.bucket === "pass" || item.bucket === "skipping"
                      ? "bg-emerald-500"
                      : item.bucket === "fail" || item.bucket === "cancel"
                        ? "bg-red-500"
                        : "animate-pulse bg-muted-foreground/50"
                  )}
                />
                {item.state}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
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

/** Avatar URL for a GitHub login; bot authors come through as `app/<slug>`. */
export function githubAvatarUrl(login: string | null): string | null {
  const slug = login?.replace(/^app\//, "")
  return slug ? `https://github.com/${slug}.png?size=64` : null
}

/**
 * Small round user avatar. Renders `src` when given, and falls back to the
 * user's initial (or a generic person icon) when there is no image or it 404s.
 */
export function UserAvatar({
  src,
  name,
  className,
}: {
  src: string | null | undefined
  name: string | null | undefined
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 text-3xs font-semibold text-primary",
          className
        )}
        title={name ?? undefined}
        aria-hidden
      >
        {name ? (
          name.slice(0, 1).toUpperCase()
        ) : (
          <UserRound className="size-[62%]" />
        )}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={name ?? undefined}
      title={name ?? undefined}
      className={cn("rounded-full bg-muted object-cover", className)}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * One reviewer avatar in the detail header's stack, with a status dot when
 * the review state is known: approved, changes requested, pending.
 */
export function ReviewerAvatar({
  name,
  src,
  state,
}: {
  name: string
  src: string | null
  state?: string
}) {
  const tone =
    state === "APPROVED"
      ? "bg-diff-add"
      : state === "CHANGES_REQUESTED"
        ? "bg-destructive"
        : "bg-amber-400"
  return (
    <span
      className="relative inline-flex"
      title={state ? `${name} · ${reviewStateLabel(state)}` : name}
    >
      <UserAvatar src={src} name={name} className="size-5 ring-2 ring-background" />
      {state ? (
        <span
          className={cn(
            "absolute -right-px -bottom-px size-2 rounded-full ring-2 ring-background",
            tone
          )}
          aria-hidden
        />
      ) : null}
    </span>
  )
}

export function reviewStateLabel(state: string): string {
  switch (state) {
    case "APPROVED":
      return "Approved"
    case "CHANGES_REQUESTED":
      return "Changes requested"
    case "PENDING":
      return "Review requested"
    default:
      return state.charAt(0) + state.slice(1).toLowerCase().replace(/_/g, " ")
  }
}

/** Meta-line status text, e.g. "Ready for review" for an open non-draft PR. */
export function readinessLabel(kind: MergeReadinessKind): string {
  switch (kind) {
    case "merged":
      return "Merged"
    case "closed":
      return "Closed"
    case "draft":
      return "Draft"
    case "conflicts":
      return "Has conflicts"
    default:
      return "Ready for review"
  }
}

export interface MergeButtonState {
  label: string
  disabled: boolean
  /** Tooltip explaining the state; null when merging is plainly available. */
  reason: string | null
  /** True when clicking arms auto-merge instead of merging immediately. */
  auto: boolean
}

/**
 * Context-aware state for the detail view's merge button, shared by the
 * GitHub and GitLab panels. Derives what the button should say and do from
 * merge readiness, CI state, and whether auto-merge is already armed.
 */
export function mergeButtonState({
  readiness,
  checksBucket,
  autoMergeEnabled,
}: {
  readiness: MergeReadinessKind
  checksBucket: "pass" | "fail" | "pending" | "none"
  autoMergeEnabled: boolean
}): MergeButtonState {
  if (autoMergeEnabled) {
    return {
      label: "Auto-merge on",
      disabled: true,
      reason: "Will merge automatically once all requirements pass",
      auto: false,
    }
  }
  if (readiness === "draft") {
    return {
      label: "Merge",
      disabled: true,
      reason: "Drafts can't be merged — mark as ready first",
      auto: false,
    }
  }
  if (readiness === "conflicts") {
    return {
      label: "Merge",
      disabled: true,
      reason: "Resolve conflicts before merging",
      auto: false,
    }
  }
  if (checksBucket === "pending") {
    return {
      label: "Auto-merge",
      disabled: false,
      reason: "Checks are still running — merges automatically once they pass",
      auto: true,
    }
  }
  if (readiness === "checking") {
    return {
      label: "Merge",
      disabled: true,
      reason: "Checking mergeability…",
      auto: false,
    }
  }
  if (checksBucket === "fail") {
    return {
      label: "Merge",
      disabled: false,
      reason: "Some checks are failing",
      auto: false,
    }
  }
  return { label: "Merge", disabled: false, reason: null, auto: false }
}

/** Label + value row in the detail header's property list. */
export function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="flex w-26 shrink-0 items-center gap-2 text-muted-foreground/75">
        {icon}
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground/90">
        {children}
      </dd>
    </div>
  )
}
