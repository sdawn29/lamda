import { Check, AlertCircle, Download, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { FileIcon } from "@/shared/ui/file-icon"
import { SectionLabel } from "@/shared/ui/section-label"
import { Skeleton } from "@/shared/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"
import {
  useInstallLspServer,
  useLspInstallJobs,
  useLspRegistry,
} from "../queries"
import type { LspInstallJob, LspRegistryEntry } from "../api"

/**
 * Settings card that lists the built-in LSP registry — one row per language
 * server — shows whether each binary is available on PATH, and lets the user
 * install missing servers in-app (the server runs the registry's install
 * recipe, e.g. `npm install -g pyright`).
 */
export function LspSettingsCard() {
  const { data: languages, isLoading, isError } = useLspRegistry()
  const { data: jobs } = useLspInstallJobs()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }

  if (isError || !languages) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>Failed to load the LSP registry.</AlertDescription>
      </Alert>
    )
  }

  if (languages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
        No language servers configured.
      </p>
    )
  }

  const groups = groupByServer(languages)
  const available = groups.filter((g) => g.entry.available)
  const missing = groups.filter((g) => !g.entry.available)
  const findJob = (group: ServerGroup) =>
    jobs?.find((j) => group.languages.includes(j.language))

  return (
    <div className="flex flex-col gap-8">
      {missing.length > 0 && (
        <ServerGroupSection
          title="Not installed"
          count={missing.length}
          groups={missing}
          findJob={findJob}
        />
      )}

      {available.length > 0 && (
        <ServerGroupSection
          title="Available"
          count={available.length}
          groups={available}
          findJob={findJob}
        />
      )}

      <p className="text-xs/relaxed text-muted-foreground">
        Language servers are looked up on your <code>PATH</code>. Use{" "}
        <strong>Install</strong> on a missing server, or install it yourself and
        reopen the file to enable diagnostics, hover, and go-to-definition.
      </p>
    </div>
  )
}

function ServerGroupSection({
  title,
  count,
  groups,
  findJob,
}: {
  title: string
  count: number
  groups: ServerGroup[]
  findJob: (group: ServerGroup) => LspInstallJob | undefined
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <LanguageRow
            key={group.entry.language}
            entry={group.entry}
            label={group.label}
            job={findJob(group)}
          />
        ))}
      </div>
    </section>
  )
}

interface ServerGroup {
  /** Representative entry — install state is identical across the group. */
  entry: LspRegistryEntry
  /** Display label, e.g. "typescript, javascript". */
  label: string
  /** All languageIds served by this command (for matching install jobs). */
  languages: string[]
}

/**
 * One registry entry exists per LSP languageId, but several ids often share a
 * server binary (typescript/typescriptreact/javascript/…). Collapse those into
 * a single row keyed by the spawn command so the list reads one row per server.
 */
function groupByServer(languages: LspRegistryEntry[]): ServerGroup[] {
  const groups = new Map<string, ServerGroup>()
  for (const entry of languages) {
    const key = `${entry.command} ${entry.args.join(" ")}`
    const existing = groups.get(key)
    // The "react" variants add nothing to the label: typescriptreact → typescript.
    const name = entry.language.replace(/react$/, "")
    if (!existing) {
      groups.set(key, {
        entry: { ...entry, extensions: [...entry.extensions] },
        label: name,
        languages: [entry.language],
      })
      continue
    }
    existing.entry.extensions.push(...entry.extensions)
    existing.languages.push(entry.language)
    if (!existing.label.split(", ").includes(name)) {
      existing.label += `, ${name}`
    }
  }
  return Array.from(groups.values())
}

function LanguageRow({
  entry,
  label,
  job,
}: {
  entry: LspRegistryEntry
  label: string
  job?: LspInstallJob
}) {
  const activeFallback =
    !entry.installed && entry.fallbacks.find((fb) => fb.installed)
  const activeCommand = entry.installed
    ? entry.command
    : activeFallback
      ? activeFallback.command
      : entry.command
  const activeArgs = entry.installed
    ? entry.args
    : activeFallback
      ? activeFallback.args
      : entry.args

  const installing = job?.status === "running"
  const installFailed = !entry.available && job?.status === "error"

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors",
        entry.available
          ? "border-border/60"
          : "border-border/60 hover:border-border"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/40",
            !entry.available && "opacity-60 saturate-50"
          )}
        >
          <FileIcon filename={`file.${entry.extensions[0]}`} className="size-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium capitalize">
              {label}
            </span>
            <div className="flex flex-wrap gap-1">
              {entry.extensions.map((ext) => (
                <Badge
                  key={ext}
                  variant="outline"
                  className="font-mono text-3xs text-muted-foreground"
                >
                  .{ext}
                </Badge>
              ))}
            </div>
          </div>

          <CommandLine
            command={activeCommand}
            args={activeArgs}
            installed={entry.installed || !!activeFallback}
            isFallback={!entry.installed && !!activeFallback}
          />
          {!entry.installed &&
            entry.fallbacks
              .filter((fb) => !fb.installed)
              .map((fb) => (
                <CommandLine
                  key={fb.command}
                  command={fb.command}
                  args={fb.args}
                  installed={false}
                  isFallback
                />
              ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!entry.available && !installing && <InstallButton entry={entry} />}
          <StatusBadge available={entry.available} installing={installing} />
        </div>
      </div>

      {installFailed && job && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription className="min-w-0">
            <span>
              Install failed (<code>{job.commandLine}</code>).
            </span>
            {job.output.trim() && (
              <pre className="mt-1 max-h-32 overflow-auto font-mono text-3xs break-all whitespace-pre-wrap">
                {job.output.trim()}
              </pre>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function InstallButton({ entry }: { entry: LspRegistryEntry }) {
  const install = useInstallLspServer()

  if (!entry.installable) {
    if (!entry.requiredTool) return null
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className="text-muted-foreground">
              requires {entry.requiredTool}
            </Badge>
          }
        />
        <TooltipContent>
          Install <code>{entry.requiredTool}</code> first; the in-app install
          uses it to fetch the language server.
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            disabled={install.isPending}
            onClick={() => install.mutate(entry.language)}
          >
            {install.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            Install
          </Button>
        }
      />
      <TooltipContent>
        <code>{entry.installCommand}</code>
      </TooltipContent>
    </Tooltip>
  )
}

function StatusBadge({
  available,
  installing,
}: {
  available: boolean
  installing: boolean
}) {
  if (installing) {
    return (
      <Badge variant="secondary" className="shrink-0">
        <Loader2 data-icon="inline-start" className="animate-spin" />
        Installing…
      </Badge>
    )
  }
  if (available) {
    return (
      <Badge
        variant="secondary"
        className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <Check data-icon="inline-start" />
        Installed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground">
      Not installed
    </Badge>
  )
}

function CommandLine({
  command,
  args,
  installed,
  isFallback,
}: {
  command: string
  args: string[]
  installed: boolean
  isFallback: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 truncate font-mono text-xs text-muted-foreground",
        !installed && "opacity-50"
      )}
    >
      {isFallback && <SectionLabel>fallback</SectionLabel>}
      <span className="truncate">
        {command}
        {args.length > 0 ? ` ${args.join(" ")}` : ""}
      </span>
    </div>
  )
}
