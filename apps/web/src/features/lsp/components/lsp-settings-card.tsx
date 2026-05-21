import { Code2, Check, AlertCircle, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Card, CardContent } from "@/shared/ui/card"
import { Separator } from "@/shared/ui/separator"
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
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Language servers</p>
              <p className="text-xs text-muted-foreground">
                Servers detected on your PATH power diagnostics, hover, and
                go-to-definition.
              </p>
            </div>
          </div>
        </div>

        <Separator />

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
          <div className="flex flex-col gap-2">
            {languages.map((entry) => (
              <LanguageRow key={entry.language} entry={entry} />
            ))}
          </div>
        )}

        <Alert>
          <Info />
          <AlertDescription>
            Language servers are looked up on your <code>PATH</code> at startup.
            Install a missing server (e.g. <code>npm i -g typescript-language-server typescript</code>)
            and reopen the file to enable its features.
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
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium capitalize">
            {entry.language}
          </span>
          <div className="flex flex-wrap gap-1">
            {entry.extensions.map((ext) => (
              <Badge key={ext} variant="outline" className="font-mono text-[10px]">
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
      <Badge
        variant="outline"
        className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <Check className="mr-1 h-3 w-3" />
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
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
          fallback
        </span>
      )}
      <span className="truncate">
        {command}
        {args.length > 0 ? ` ${args.join(" ")}` : ""}
      </span>
    </div>
  )
}
