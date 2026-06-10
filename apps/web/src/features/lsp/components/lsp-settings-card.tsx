import { Check, AlertCircle, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Card, CardContent } from "@/shared/ui/card"
import { SectionLabel } from "@/shared/ui/section-label"
import { Skeleton } from "@/shared/ui/skeleton"
import { cn } from "@/shared/lib/utils"
import { useLspRegistry } from "../queries"
import type { LspRegistryEntry } from "../api"

/**
 * Settings card that lists the built-in LSP registry — one row per language —
 * and shows whether each language server binary is available on PATH.
 *
 * Read-only: language servers are configured in code (`packages/lsp/src/registry.ts`).
 * The user manages availability by installing the binaries on their PATH.
 */
export function LspSettingsCard() {
  const { data: languages, isLoading, isError } = useLspRegistry()

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : isError || !languages ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              Failed to load the LSP registry.
            </AlertDescription>
          </Alert>
        ) : languages.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No language servers configured.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {languages.map((entry) => (
              <LanguageRow key={entry.language} entry={entry} />
            ))}
          </div>
        )}

        <Alert>
          <Info />
          <AlertDescription>
            Language servers are looked up on your <code>PATH</code>. Install a
            missing server and reopen the file to enable diagnostics, hover,
            and go-to-definition.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function LanguageRow({ entry }: { entry: LspRegistryEntry }) {
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

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium capitalize">
            {entry.language}
          </span>
          <div className="flex flex-wrap gap-1">
            {entry.extensions.map((ext) => (
              <Badge key={ext} variant="outline" className="font-mono text-3xs">
                .{ext}
              </Badge>
            ))}
          </div>
        </div>
        <StatusBadge available={entry.available} />
      </div>

      <div className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
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
    </div>
  )
}

function StatusBadge({ available }: { available: boolean }) {
  if (available) {
    return (
      <Badge variant="secondary" className="shrink-0">
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
        "flex items-center gap-2 truncate",
        !installed && "opacity-50",
      )}
    >
      {isFallback && (
        <SectionLabel>fallback</SectionLabel>
      )}
      <span className="truncate">
        {command}
        {args.length > 0 ? ` ${args.join(" ")}` : ""}
      </span>
    </div>
  )
}
