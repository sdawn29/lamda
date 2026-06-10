import { type ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Minimal building blocks for settings pages. Sections are flat — no card
 * chrome — just titled groups of rows separated by hairline dividers.
 */

interface SettingsGroupProps {
  title?: string
  description?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled group of settings rows, divided by hairlines. */
export function SettingsGroup({
  title,
  description,
  children,
  className,
}: SettingsGroupProps) {
  return (
    <section className={cn("flex flex-col", className)}>
      {(title || description) && (
        <header className="flex flex-col gap-0.5 pb-1">
          {title && (
            <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          )}
          {description && (
            <p className="text-xs/relaxed text-muted-foreground">
              {description}
            </p>
          )}
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
