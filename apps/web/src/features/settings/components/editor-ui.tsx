import { useMemo } from "react"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { cn } from "@/shared/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  colorStyle,
  resolveModeIcon,
} from "@/features/chat/components/mode-combobox"

/** Mirrors MODE_COLORS in pi-sdk; swatch classes spelled out for Tailwind. */
export const PICKER_COLORS: { name: string; swatch: string }[] = [
  { name: "sky", swatch: "bg-sky-500" },
  { name: "amber", swatch: "bg-amber-500" },
  { name: "emerald", swatch: "bg-emerald-500" },
  { name: "violet", swatch: "bg-violet-500" },
  { name: "rose", swatch: "bg-rose-500" },
  { name: "blue", swatch: "bg-blue-500" },
  { name: "teal", swatch: "bg-teal-500" },
  { name: "orange", swatch: "bg-orange-500" },
  { name: "fuchsia", swatch: "bg-fuchsia-500" },
  { name: "slate", swatch: "bg-slate-500" },
]

/** Curated icon choices; the free-text field below the grid takes any Lucide name. */
const PICKER_ICONS = [
  "bot",
  "sparkles",
  "wand",
  "search",
  "pencil",
  "bug",
  "shield",
  "rocket",
  "book",
  "code",
  "terminal",
  "eye",
  "zap",
  "compass",
  "hammer",
  "wrench",
  "message-circle-question",
  "list-todo",
] as const

// Resolved once at module scope so the grid renders stable component
// identities (creating components during render trips react-hooks lint and
// remounts them every render).
const PICKER_ICON_OPTIONS = PICKER_ICONS.map((name) => ({
  name,
  Icon: resolveModeIcon(name),
}))

export const KEBAB_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * A titled block in an editor body: heading + optional hint + content. Flat —
 * no box chrome — so editors read like the rest of the settings pages;
 * stack them in a `divide-y` container with per-section padding.
 */
export function FieldSection({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm leading-snug font-medium">{title}</h3>
          {hint && (
            <p className="text-xs/relaxed text-muted-foreground">{hint}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Visual identity for a mode/agent: a large tile showing the live color +
 * icon, opening a popover with the color swatches, a curated icon grid, and a
 * free-text field for any other Lucide icon name.
 */
export function AppearancePicker({
  color,
  icon,
  onChange,
}: {
  color: string
  icon: string
  onChange: (patch: { color?: string; icon?: string }) => void
}) {
  const iconName = icon.trim() || "bot"
  const visual = useMemo(
    () => ({ Icon: resolveModeIcon(iconName) }),
    [iconName]
  )
  const style = colorStyle(color)
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Change color and icon"
            className={cn(
              "group relative flex size-12 shrink-0 items-center justify-center rounded-xl transition-shadow outline-none hover:ring-2 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring",
              style.softBg,
              style.iconAccent
            )}
          />
        }
      >
        <visual.Icon className="size-5" />
        <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors group-hover:text-foreground">
          <PencilIcon className="size-2.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-3xs font-medium text-muted-foreground">
            Color
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PICKER_COLORS.map(({ name, swatch }) => (
              <button
                key={name}
                type="button"
                title={name}
                className={cn(
                  "size-5 rounded-full transition-transform",
                  swatch,
                  color === name
                    ? "scale-110 ring-2 ring-foreground/60 ring-offset-1 ring-offset-background"
                    : "opacity-60 hover:opacity-100"
                )}
                onClick={() => onChange({ color: name })}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-3xs font-medium text-muted-foreground">
            Icon
          </span>
          <div className="grid grid-cols-8 gap-1">
            {PICKER_ICON_OPTIONS.map((option) => {
              const active = iconName === option.name
              return (
                <button
                  key={option.name}
                  type="button"
                  title={option.name}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    active
                      ? cn(style.softBg, style.iconAccent)
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => onChange({ icon: option.name })}
                >
                  <option.Icon className="size-3.5" />
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-3xs font-medium text-muted-foreground">
            Any Lucide icon
          </span>
          <Input
            value={icon}
            placeholder="e.g. shield-check"
            className="h-7 font-mono text-2xs"
            onChange={(e) => onChange({ icon: e.target.value })}
          />
        </label>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Compact list row for a mode/agent definition. The whole row opens the
 * editor; the destructive action stays hidden until hover so the list reads
 * as content, not chrome. Wrap rows in `DefinitionList`.
 */
export function DefinitionRow({
  icon,
  color,
  name,
  id,
  builtin,
  workspace,
  description,
  meta,
  onEdit,
  onDelete,
  deleting = false,
}: {
  icon: string
  color: string
  name: string
  id: string
  builtin: boolean
  workspace: boolean
  description: string
  /** Right-aligned one-glance summary, e.g. "12 tools · all subagents". */
  meta: string
  onEdit: () => void
  /** Deletes the file (or resets a built-in). Omit when there is no file. */
  onDelete?: () => void
  deleting?: boolean
}) {
  const visual = useMemo(() => ({ Icon: resolveModeIcon(icon) }), [icon])
  const style = colorStyle(color)
  return (
    <div className="group relative flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
      {/* Full-row click target under the content; only the delete button
          keeps pointer events, so everything else falls through to this. */}
      <button
        type="button"
        aria-label={`Edit ${name}`}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={onEdit}
      />
      <span
        className={cn(
          "pointer-events-none relative flex size-7 shrink-0 items-center justify-center rounded-md",
          style.softBg,
          style.iconAccent
        )}
      >
        <visual.Icon className="size-3.5" />
      </span>
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm leading-snug">{name}</span>
          <code className="shrink-0 rounded bg-muted px-1 py-px font-mono text-3xs text-muted-foreground">
            {id}
          </code>
          {builtin && (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs">
              built-in
            </Badge>
          )}
          {workspace && (
            <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-3xs">
              workspace
            </Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {description || "No description"}
        </span>
      </span>
      <span className="relative flex shrink-0 items-center gap-1.5">
        <span className="pointer-events-none hidden text-3xs whitespace-nowrap text-muted-foreground/70 sm:block">
          {meta}
        </span>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
            onClick={onDelete}
            disabled={deleting}
            title={builtin ? "Reset to the built-in default" : "Delete"}
          >
            {builtin ? (
              <RotateCcwIcon className="size-3.5" />
            ) : (
              <Trash2Icon className="size-3.5" />
            )}
          </Button>
        )}
        <ChevronRightIcon className="pointer-events-none size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </span>
    </div>
  )
}

/** Island container for `DefinitionRow`s: one bordered card holding the
 *  hairline-divided rows, matching the app's floating-island surfaces. */
export function DefinitionList({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/50">
      {children}
    </div>
  )
}

/** Loading placeholder matching DefinitionRow's shape. */
export function DefinitionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="size-7 rounded-md" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  )
}

/**
 * Confirmation for deleting a definition's file. Resetting a built-in gets
 * softer copy — the definition comes back — while deleting a custom one is
 * spelled out as permanent.
 */
export function DeleteDefinitionDialog({
  kind,
  target,
  onClose,
  onConfirm,
}: {
  kind: "mode" | "agent"
  target: { name: string; builtin: boolean } | null
  onClose: () => void
  onConfirm: () => void
}) {
  const builtin = target?.builtin ?? false
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={builtin ? undefined : "bg-destructive/10"}
          >
            {builtin ? (
              <RotateCcwIcon className="size-4" />
            ) : (
              <Trash2Icon className="size-4 text-destructive" />
            )}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {builtin ? `Reset “${target?.name}”?` : `Delete “${target?.name}”?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {builtin
              ? `Your customizations are discarded and the built-in ${kind} is restored.`
              : `The ${kind}'s markdown file is permanently deleted. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={builtin ? "default" : "destructive"}
            onClick={onConfirm}
          >
            {builtin ? "Reset" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Full-page shell for the mode/agent editors (the `?mode=` / `?agent=` search
 * params take over the section page, like the MCP server form): a back link
 * above whatever the editor renders.
 */
export function DefinitionEditorPage({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-8 pt-5 pb-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-3 -ml-2 h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span className="text-xs font-medium">{backLabel}</span>
        </Button>
      </div>
      {children}
    </div>
  )
}

/** The identity fields both editors share; a subset of their form state. */
export interface DefinitionIdentity {
  isNew: boolean
  /** True once the user has typed in the id field, stopping name→id syncing. */
  idEdited: boolean
  scope: "global" | "local"
  id: string
  name: string
  color: string
  icon: string
}

/**
 * Editor page header: the name input is the page title, with the file path
 * (editable id while new) under it, the appearance tile beside it, and the
 * scope switcher (or badge, once saved) on the right.
 */
export function DefinitionEditorHeader({
  identity,
  namePlaceholder,
  idPlaceholder,
  dirGlobal,
  dirLocal,
  idInvalid,
  canScopeLocal,
  scopeControl,
  onPatch,
}: {
  identity: DefinitionIdentity
  namePlaceholder: string
  idPlaceholder: string
  /** e.g. "~/.lamda/modes" */
  dirGlobal: string
  /** e.g. ".lamda/modes" */
  dirLocal: string
  idInvalid: boolean
  canScopeLocal: boolean
  scopeControl?: React.ReactNode
  onPatch: (patch: Partial<DefinitionIdentity>) => void
}) {
  const dir = identity.scope === "local" ? dirLocal : dirGlobal
  return (
    <header className="flex items-start gap-3.5 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm">
      <AppearancePicker
        color={identity.color}
        icon={identity.icon}
        onChange={(patch) => onPatch(patch)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          value={identity.name}
          placeholder={namePlaceholder}
          autoFocus={identity.isNew}
          aria-label="Name"
          className="w-full bg-transparent text-base font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
          onChange={(e) =>
            onPatch({
              name: e.target.value,
              // Keep the file id in lockstep with the name until the user
              // takes over the id themselves.
              id:
                identity.isNew && !identity.idEdited
                  ? slugify(e.target.value)
                  : identity.id,
            })
          }
        />
        <div className="flex items-center gap-1 text-3xs text-muted-foreground">
          <span>saved as</span>
          {identity.isNew ? (
            <span className="inline-flex items-center font-mono">
              <span>{dir}/</span>
              <input
                value={identity.id}
                placeholder={idPlaceholder}
                aria-invalid={idInvalid}
                aria-label="File id"
                size={Math.max(identity.id.length, 8)}
                className={cn(
                  "rounded border border-transparent bg-transparent px-0.5 font-mono text-foreground outline-none hover:border-border focus-visible:border-ring",
                  idInvalid && "text-destructive"
                )}
                onChange={(e) =>
                  onPatch({ id: e.target.value.toLowerCase(), idEdited: true })
                }
              />
              <span>.md</span>
            </span>
          ) : (
            <code className="font-mono">
              {dir}/{identity.id}.md
            </code>
          )}
        </div>
        {idInvalid && (
          <span className="text-3xs text-destructive">
            Ids use lowercase letters, digits, and dashes.
          </span>
        )}
      </div>
      {identity.isNew && scopeControl ? (
        scopeControl
      ) : identity.isNew ? (
        <div className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              { value: "global", label: "All workspaces" },
              { value: "local", label: "This workspace" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={value === "local" && !canScopeLocal}
              className={cn(
                "rounded-md px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-40",
                identity.scope === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onPatch({ scope: value })}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-3xs">
          {identity.scope === "local" ? "workspace" : "global"}
        </Badge>
      )}
    </header>
  )
}

/**
 * Sticky save bar for the editor pages: the first unmet requirement (or a
 * quiet reassurance) on the left, Cancel/Save on the right.
 */
export function DefinitionEditorFooter({
  hint,
  submitLabel,
  canSubmit,
  onCancel,
  onSubmit,
}: {
  hint: string
  submitLabel: string
  canSubmit: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <footer className="sticky bottom-3 z-10 mt-5 flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/90 px-3.5 py-2.5 shadow-md backdrop-blur">
      <p className="text-3xs text-muted-foreground">{hint}</p>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </footer>
  )
}
