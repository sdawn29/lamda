import { type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { cn } from "@/shared/lib/utils"

/**
 * Minimal building blocks for settings pages. Sections are flat — no card
 * chrome — just titled groups of rows separated by hairline dividers.
 */

interface SettingsGroupProps {
  title?: string
  description?: ReactNode
  /** Optional control aligned to the right edge of the group header. */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled group of settings rows, divided by hairlines. */
export function SettingsGroup({
  title,
  description,
  action,
  children,
  className,
}: SettingsGroupProps) {
  return (
    <section className={cn("flex flex-col", className)}>
      {(title || description || action) && (
        <header className="flex items-start justify-between gap-4 pb-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && (
              <h2 className="text-sm font-medium tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="text-xs/relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center">{action}</div>}
        </header>
      )}
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  title: ReactNode
  description?: ReactNode
  htmlFor?: string
  /** Control rendered on the right edge of the row. */
  children?: ReactNode
  className?: string
}

/** Horizontal row: title + description on the left, control on the right. */
export function SettingsRow({
  title,
  description,
  htmlFor,
  children,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 py-3.5",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-sm leading-snug">
          {title}
        </label>
        {description && (
          <p className="text-xs/relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  )
}

interface SettingsStackProps {
  title?: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

/** Vertical block: title + description above a full-width control. */
export function SettingsStack({
  title,
  description,
  htmlFor,
  children,
  className,
}: SettingsStackProps) {
  return (
    <div className={cn("flex flex-col gap-2.5 py-3.5", className)}>
      {(title || description) && (
        <div className="flex flex-col gap-0.5">
          {title && (
            <label htmlFor={htmlFor} className="text-sm leading-snug">
              {title}
            </label>
          )}
          {description && (
            <p className="text-xs/relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

interface SettingsNavCardProps {
  icon: ReactNode
  title: ReactNode
  description: ReactNode
  /** Settings section slug to navigate to. */
  section: string
  className?: string
}

/** Dashed cross-link card pointing to a related settings section. */
export function SettingsNavCard({
  icon,
  title,
  description,
  section,
  className,
}: SettingsNavCardProps) {
  return (
    <Link
      to="/settings/$section"
      params={{ section }}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-dashed border-border/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/30",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-foreground/5">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-snug">{title}</span>
        <span className="text-xs/relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
