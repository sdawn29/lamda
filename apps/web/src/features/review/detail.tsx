import { useState } from "react"
import type { ReactNode } from "react"
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  MessageSquare,
  UploadCloud,
} from "lucide-react"

import { openExternal } from "@/features/electron/api"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { TabsList, TabsTrigger } from "@/shared/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { CommentCard } from "./comment-card"
import type { summarizeChecks } from "./ci-checks-badge"
import { PropertyRow, UserAvatar, type MergeButtonState } from "./panel-primitives"

/**
 * Provider-neutral scaffolding for the GitHub/GitLab panel pages: the detail
 * chrome (top bar, pill tabs, header, activity, composer, merge footer) and
 * the panel-root chrome (repo header, publish dialog). Provider features
 * supply data and mutations; everything visual lives here so both panels
 * stay pixel-identical.
 */

/** Slim top navigation bar for a detail page (back · icon · label · open). */
export function DetailTopBar({
  onBack,
  backLabel,
  stateIcon,
  title,
  url,
  openLabel,
  meta,
}: {
  onBack: () => void
  backLabel: string
  stateIcon?: ReactNode
  title: string
  url: string
  openLabel: string
  /** Optional trailing status slot, e.g. a freshness label. */
  meta?: ReactNode
}) {
  return (
    <div className="shrink-0 p-2 pb-0">
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-sm shadow-black/[0.03] backdrop-blur dark:shadow-black/20">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeft data-icon="inline-start" />
        </Button>
        {stateIcon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
            {stateIcon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground/90">
            {title}
          </p>
        </div>
        {meta}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void openExternal(url)}
          aria-label={openLabel}
        >
          <ExternalLink data-icon="inline-start" />
        </Button>
      </div>
    </div>
  )
}

/** Full-height "couldn't load" state with a way back to the list. */
export function DetailNotFound({
  message,
  backLabel,
  onBack,
}: {
  message: string
  backLabel: string
  onBack: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  )
}

/** Pill-styled tab list used by every detail page. */
export function DetailTabsList({ children }: { children: ReactNode }) {
  return (
    <TabsList className="mx-2 my-2 h-8 max-w-[calc(100%-1rem)] shrink-0 self-start overflow-x-auto overflow-y-hidden rounded-full border border-border/55 bg-background/75 p-[3px] shadow-xs">
      {children}
    </TabsList>
  )
}

/** One pill tab: icon + label + optional count badge. */
export function DetailTab({
  value,
  icon,
  label,
  count,
  title,
}: {
  value: string
  icon: ReactNode
  label: string
  count?: number
  title?: string
}) {
  return (
    <TabsTrigger
      value={value}
      title={title}
      className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
    >
      {icon}
      {label}
      {count !== undefined ? (
        <span className="rounded-full bg-foreground/5 px-1.5 text-3xs text-current tabular-nums">
          {count}
        </span>
      ) : null}
    </TabsTrigger>
  )
}

/**
 * Detail page header: large wrapping title, author meta line, and a property
 * list (`PropertyRow`s as children).
 */
export function DetailHeader({
  title,
  avatarSrc,
  author,
  createdAt,
  status,
  children,
}: {
  title: string
  avatarSrc: string | null
  author: string | null
  createdAt: string
  status: string
  children: ReactNode
}) {
  return (
    <header className="px-1 pt-2 pb-1">
      <h1 className="text-base leading-snug font-semibold text-foreground">
        {title}
      </h1>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <UserAvatar src={avatarSrc} name={author} className="size-4.5 shrink-0" />
        <span className="truncate font-medium">{author ?? "Unknown author"}</span>
        <span className="text-muted-foreground/40">·</span>
        <span
          className="shrink-0"
          title={new Date(createdAt).toLocaleString()}
        >
          {formatRelativeDate(createdAt)}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate">{status}</span>
      </div>

      <dl className="mt-4 flex flex-col gap-2.5 text-xs">{children}</dl>
    </header>
  )
}

export { PropertyRow }

/** Dashed placeholder for empty comment/conversation lists. */
export function EmptyPlaceholder({
  title,
  hint,
}: {
  title: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/45 px-4 py-8 text-center">
      <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground/40" />
      <p className="text-xs font-medium">{title}</p>
      {hint ? (
        <p className="mt-0.5 text-3xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** One conversation entry: a PR/MR comment or an inline review comment. */
export interface ActivityItem {
  key: string
  author: string | null
  avatarUrl: string | null
  body: string
  createdAt: string
  context: string
  reviewComment: boolean
  diff?: {
    patch: string
    line: number | null
    side: "LEFT" | "RIGHT" | null
  }
}

/** Chronological conversation list shared by the PR and MR overview tabs. */
export function ActivityList<T extends ActivityItem>({
  items,
  loading,
  error,
  onReply,
}: {
  items: T[]
  loading: boolean
  error: unknown
  onReply: (item: T, body: string) => Promise<unknown>
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Loading comments
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyPlaceholder
        title="No conversation yet"
        hint="General and file review comments will appear here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error ? (
        <p className="px-1 text-3xs text-destructive">
          File review comments could not be loaded.
        </p>
      ) : null}
      {items.map((item) => (
        <CommentCard
          key={item.key}
          author={item.author}
          avatarUrl={item.avatarUrl}
          body={item.body}
          createdAt={item.createdAt}
          context={item.context}
          reviewComment={item.reviewComment}
          diff={item.diff}
          onReply={(body) => onReply(item, body)}
        />
      ))}
    </div>
  )
}

/** Card with a textarea + submit button for adding a top-level comment. */
export function CommentComposer({
  value,
  onChange,
  disabled,
  ariaLabel,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  ariaLabel: string
  onSubmit: () => void
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/75 p-2.5 shadow-sm shadow-black/[0.025]">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add to the conversation…"
        disabled={disabled}
        aria-label={ariaLabel}
        className="min-h-24 resize-y border-border/50 bg-background/70"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!value.trim() || disabled}
        >
          <MessageSquare data-icon="inline-start" />
          Comment
        </Button>
      </div>
    </div>
  )
}

/** Human summary for the Checks property row ("2 failing · 3 passing"). */
export function checksSummaryText(
  summary: ReturnType<typeof summarizeChecks>,
  nouns: { singular: string; plural: string; none: string }
): string {
  switch (summary.bucket) {
    case "none":
      return nouns.none
    case "fail":
      return `${summary.failed} failing · ${summary.passed} passing`
    case "pending":
      return `${summary.pending} running · ${summary.passed} passing`
    default:
      return `${summary.total} ${summary.total === 1 ? nouns.singular : nouns.plural} passing`
  }
}

/** Checkout + context-aware merge buttons at the bottom of the merge card. */
export function DetailActionsFooter({
  pending,
  mergeState,
  onCheckout,
  onMerge,
}: {
  pending: boolean
  mergeState: MergeButtonState
  onCheckout: () => void
  onMerge: () => void
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/45 pt-2.5">
      <Button variant="outline" size="sm" disabled={pending} onClick={onCheckout}>
        <GitBranch data-icon="inline-start" />
        Checkout
      </Button>
      <Button
        size="sm"
        disabled={pending || mergeState.disabled}
        title={mergeState.reason ?? undefined}
        onClick={onMerge}
      >
        {mergeState.auto ? (
          <Clock data-icon="inline-start" />
        ) : (
          <GitMerge data-icon="inline-start" />
        )}
        {mergeState.label}
      </Button>
    </div>
  )
}

/**
 * Merge confirmation dialog; flips wording to auto-merge when the merge
 * button is in auto mode. `children` renders provider options (merge method,
 * squash toggle).
 */
export function MergeDialog({
  open,
  onOpenChange,
  subject,
  auto,
  pending,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. "pull request #12" or "merge request !5". */
  subject: string
  auto: boolean
  pending: boolean
  onConfirm: () => void
  children?: ReactNode
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {auto
              ? `Enable auto-merge for ${subject}?`
              : `Merge ${subject}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {auto
              ? "It will merge automatically once all requirements pass."
              : "This action updates the remote repository and cannot be undone from this panel."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {auto ? "Enable auto-merge" : "Merge"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Card container for the panel-root list sections (PRs, MRs, issues). */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/65 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
      {children}
    </div>
  )
}

/** Panel-root top bar: repo identity on the left, actions on the right. */
export function RepoPanelHeader({
  icon,
  name,
  subtitle,
  url,
  children,
}: {
  icon: ReactNode
  name: string
  subtitle: string
  url: string
  children: ReactNode
}) {
  return (
    <div className="shrink-0 p-2 pb-0">
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/90 p-2.5 shadow-sm shadow-black/[0.03] backdrop-blur @sm/panel:flex-row @sm/panel:items-center @sm/panel:justify-between dark:shadow-black/20">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left text-xs font-medium hover:underline"
          onClick={() => void openExternal(url)}
          title={name}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
            {icon}
          </div>
          <span className="min-w-0">
            <span className="block truncate">{name}</span>
            <span className="block text-3xs font-normal text-muted-foreground/60">
              {subtitle}
            </span>
          </span>
        </button>
        <div className="flex items-center justify-between gap-2 @sm/panel:justify-end">
          {children}
        </div>
      </div>
    </div>
  )
}

export type RepositoryVisibility = "private" | "public"

/**
 * Publish-to-provider dialog shared by both panels; the caller supplies the
 * wording and runs the mutation.
 */
export function PublishRepositoryDialog({
  open,
  onOpenChange,
  title,
  description,
  nameLabel,
  namePlaceholder,
  nameDescription,
  pending,
  onPublish,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  nameLabel: string
  namePlaceholder: string
  nameDescription: string
  pending: boolean
  onPublish: (
    name: string | undefined,
    visibility: RepositoryVisibility,
    close: () => void
  ) => void
}) {
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<RepositoryVisibility>("private")

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !pending) {
      setName("")
      setVisibility("private")
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="publish-repo-name">{nameLabel}</FieldLabel>
            <Input
              id="publish-repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              disabled={pending}
            />
            <FieldDescription>{nameDescription}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Visibility</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[visibility]}
              onValueChange={(values) => {
                const next = values.find((value) => value !== visibility)
                if (next === "private" || next === "public") {
                  setVisibility(next)
                }
              }}
            >
              <ToggleGroupItem value="private">Private</ToggleGroupItem>
              <ToggleGroupItem value="public">Public</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={pending}>
            Cancel
          </DialogClose>
          <Button
            onClick={() =>
              onPublish(name.trim() || undefined, visibility, () =>
                handleOpenChange(false)
              )
            }
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Publishing
              </>
            ) : (
              <>
                <UploadCloud className="size-3" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Section label + optional count, used above description/comment lists. */
export function SectionHeading({
  label,
  count,
  children,
}: {
  label: ReactNode
  count?: number
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      {label}
      {count !== undefined && count > 0 ? (
        <Badge variant="secondary">{count}</Badge>
      ) : null}
      {children}
    </div>
  )
}

