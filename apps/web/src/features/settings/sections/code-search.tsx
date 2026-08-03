import { useEffect, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  InfoIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import { Progress } from "@/shared/ui/progress"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useWorkspaces } from "@/features/workspace/queries"
import { SettingsGroup, SettingsRow } from "../components/settings-ui"
import {
  useSemanticIndexStatus,
  useSemanticSearch,
  useTriggerSemanticReindex,
  useUpdateSemanticIndexConfig,
  type SemanticIndexStatus,
  type SemanticIndexConfigUpdate,
  type SemanticSearchMode,
} from "@/features/semantic-search"
import type { WorkspaceDto } from "@/features/workspace/api"
import { cn } from "@/shared/lib/utils"

function formatRelativeTime(ms: number | null): string {
  if (!ms) return "never"
  const diff = Date.now() - ms
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

function coveragePercent(
  status: SemanticIndexStatus | undefined
): number | null {
  if (!status || status.chunkCount === 0) return null
  return Math.round((status.embeddedCount / status.chunkCount) * 100)
}

function statusLabel(status: SemanticIndexStatus | undefined): string {
  if (!status) return "Loading"
  if (status.lastError) return "Error"
  if (!status.enabled) return "Disabled"
  if (!status.vecAvailable || !status.embeddingsEnabled) return "Keyword only"
  if (status.chunkCount === 0) return "Waiting for index"
  if (status.embeddedCount < status.chunkCount) return "Embedding"
  return "Ready"
}

function statusTone(status: SemanticIndexStatus | undefined): string {
  if (!status) return "border-border bg-muted/40 text-muted-foreground"
  if (status.lastError) {
    return "border-destructive/30 bg-destructive/10 text-destructive"
  }
  if (!status.enabled) return "border-border bg-muted/40 text-muted-foreground"
  if (!status.vecAvailable || !status.embeddingsEnabled) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  }
  if (status.chunkCount === 0 || status.embeddedCount < status.chunkCount) {
    return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
}

function StatusPill({ status }: { status: SemanticIndexStatus | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-3xs font-medium",
        statusTone(status)
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

function searchModeLabel(mode: SemanticSearchMode): string | null {
  if (mode === "hybrid") return "semantic + keyword"
  if (mode === "fts") return "keyword (FTS)"
  if (mode === "like") return "substring scan"
  return null
}

function WorkspaceIndexRow({
  workspace,
  onOpen,
}: {
  workspace: WorkspaceDto
  onOpen: () => void
}) {
  const { data: status } = useSemanticIndexStatus(workspace.id)
  const pct = coveragePercent(status)

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <button
        type="button"
        aria-label={`Open ${workspace.name} code search settings`}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={onOpen}
      />
      <span className="pointer-events-none relative flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
        <SearchIcon className="size-3.5" />
      </span>
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm leading-snug">
            {workspace.name}
          </span>
          <StatusPill status={status} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {workspace.path}
        </span>
      </span>
      <div className="pointer-events-none relative hidden shrink-0 items-center gap-2 sm:flex">
        {status && (
          <span className="text-3xs text-muted-foreground tabular-nums">
            {status.fileCount.toLocaleString()} files ·{" "}
            {status.chunkCount.toLocaleString()} chunks
          </span>
        )}
        {pct !== null && (
          <div className="flex items-center gap-1.5">
            <Progress value={pct} className="h-1 w-16" />
            <span className="text-3xs text-muted-foreground tabular-nums">
              {pct}%
            </span>
          </div>
        )}
      </div>
      <ChevronRightIcon className="pointer-events-none relative size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </div>
  )
}

function OverviewPage({ workspaces }: { workspaces: WorkspaceDto[] }) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">
        {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} · each
        keeps its own local index
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 px-6 py-8 text-center">
          <SearchIcon className="size-5 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No workspaces yet</p>
            <p className="text-xs text-muted-foreground">
              Add a workspace before configuring code search.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-card/50">
          {workspaces.map((workspace) => (
            <WorkspaceIndexRow
              key={workspace.id}
              workspace={workspace}
              onOpen={() =>
                void navigate({
                  to: "/settings/$section",
                  params: { section: "code-search" },
                  search: { ws: workspace.id },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SearchPlayground({
  workspace,
  status,
}: {
  workspace: WorkspaceDto
  status: SemanticIndexStatus | undefined
}) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isLoading, isFetching, isError } = useSemanticSearch(
    workspace.id,
    debounced
  )

  const trimmed = query.trim()
  const modeLabel =
    data && data.mode !== "none" ? searchModeLabel(data.mode) : null

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-medium">Search this index</h3>
          <p className="text-xs/relaxed text-muted-foreground">
            Run a real query against the local index — the same search the
            assistant uses.
          </p>
        </div>
        {modeLabel && (
          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border/60 bg-background px-2 text-3xs font-medium text-muted-foreground">
            {modeLabel}
          </span>
        )}
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "where do we validate tool allowlists?"'
          className="h-8 pl-7 text-xs"
        />
      </div>

      {trimmed.length < 3 ? (
        <p className="text-2xs text-muted-foreground">
          {status?.chunkCount === 0
            ? "The index is empty — enable indexing or run Reindex first."
            : "Type at least 3 characters to search."}
        </p>
      ) : isLoading || (!data && debounced.trim() !== trimmed) ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : isError ? (
        <p className="text-2xs text-destructive">Search failed — try again.</p>
      ) : !data || data.results.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          No matches. If embedding is still in progress, semantic recall
          improves as coverage grows.
        </p>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-1.5 transition-opacity",
            isFetching && "opacity-60"
          )}
        >
          {data.results.slice(0, 8).map((hit, index) => (
            <button
              key={`${hit.filePath}:${hit.startLine}:${index}`}
              type="button"
              className="group flex flex-col gap-1 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent/40"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${hit.filePath}:${hit.startLine}`
                )
                toast.success("Path copied", {
                  description: `${hit.filePath}:${hit.startLine}`,
                })
              }}
            >
              <span className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-2xs text-foreground">
                  {hit.filePath}:{hit.startLine}–{hit.endLine}
                </code>
                <span
                  className="shrink-0 font-mono text-3xs text-muted-foreground/70 tabular-nums"
                  title="Relevance score"
                >
                  {hit.score.toFixed(2)}
                </span>
                <CopyIcon className="size-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
              </span>
              <p className="line-clamp-3 font-mono text-3xs leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
                {hit.content}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceDetailPage({ workspace }: { workspace: WorkspaceDto }) {
  const navigate = useNavigate()
  const { data: status } = useSemanticIndexStatus(workspace.id, {
    poll: true,
  })
  const reindex = useTriggerSemanticReindex()
  const updateConfig = useUpdateSemanticIndexConfig()

  function setConfig(update: SemanticIndexConfigUpdate) {
    updateConfig.mutate(
      { workspaceId: workspace.id, update },
      {
        onError: (err) => {
          toast.error("Couldn't update code search settings", {
            description:
              err instanceof Error ? err.message : "Please try again.",
          })
        },
      }
    )
  }

  const pct = coveragePercent(status)

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 w-fit gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        onClick={() =>
          void navigate({
            to: "/settings/$section",
            params: { section: "code-search" },
            search: {},
          })
        }
      >
        <ArrowLeftIcon className="size-3.5" />
        <span className="text-xs font-medium">Workspaces</span>
      </Button>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground">
              <SearchIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  {workspace.name}
                </h2>
                <StatusPill status={status} />
              </div>
              <p className="text-xs break-all text-muted-foreground">
                {workspace.path}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={reindex.isPending}
            onClick={() =>
              reindex.mutate(workspace.id, {
                onSuccess: () => {
                  toast.success("Reindex started", {
                    description: "The index rebuilds in the background.",
                  })
                },
                onError: (err) => {
                  toast.error("Couldn't start reindex", {
                    description:
                      err instanceof Error ? err.message : "Please try again.",
                  })
                },
              })
            }
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={reindex.isPending ? "animate-spin" : undefined}
            />
            Reindex
          </Button>
        </div>

        {status ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2">
              <span className="text-3xs text-muted-foreground">Files</span>
              <span className="truncate text-sm font-medium tabular-nums">
                {status.fileCount.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2">
              <span className="text-3xs text-muted-foreground">Chunks</span>
              <span className="truncate text-sm font-medium tabular-nums">
                {status.chunkCount.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2">
              <span className="text-3xs text-muted-foreground">Embedded</span>
              <span className="truncate text-sm font-medium tabular-nums">
                {status.embeddedCount.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2">
              <span className="text-3xs text-muted-foreground">
                Last indexed
              </span>
              <span
                className="truncate text-sm font-medium"
                title={
                  status.lastIndexedAt
                    ? new Date(status.lastIndexedAt).toLocaleString()
                    : undefined
                }
              >
                {formatRelativeTime(status.lastIndexedAt)}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[3.25rem] rounded-lg" />
            ))}
          </div>
        )}

        {status &&
          status.vecAvailable &&
          status.embeddingsEnabled &&
          status.chunkCount > 0 &&
          pct !== null && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Semantic vector coverage
                </span>
                <span className="font-medium tabular-nums">
                  {status.embeddedCount.toLocaleString()} /{" "}
                  {status.chunkCount.toLocaleString()} · {pct}%
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
              {status.embeddedCount < status.chunkCount && (
                <span className="text-3xs text-muted-foreground">
                  Embedding in progress — this page refreshes automatically.
                </span>
              )}
            </div>
          )}

        {status && (!status.vecAvailable || !status.embeddingsEnabled) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Semantic ranking is unavailable in this build. Keyword search
              still works and stays up to date.
            </span>
          </div>
        )}

        {status?.lastError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Last indexing error</span>
              <span className="break-words text-destructive/90">
                {status.lastError.message}
              </span>
              <span
                className="text-3xs text-destructive/70"
                title={new Date(status.lastError.occurredAt).toLocaleString()}
              >
                {formatRelativeTime(status.lastError.occurredAt)}
              </span>
            </div>
          </div>
        )}
      </div>

      <SearchPlayground workspace={workspace} status={status} />

      <SettingsGroup
        title="Indexing behavior"
        description="Control how this workspace is indexed and whether retrieved snippets are injected into prompts."
      >
        <SettingsRow
          title="Enable code search"
          description="Chunks and indexes workspace files in the background. Semantic ranking runs locally and is fused with keyword search."
        >
          <Switch
            checked={status?.enabled ?? true}
            onCheckedChange={(checked) => setConfig({ enabled: checked })}
            aria-label="Enable code search"
          />
        </SettingsRow>
        <SettingsRow
          title="Inject relevant code into prompts"
          description="Automatically surface a few relevant code snippets when you send a message, similar to memory retrieval."
        >
          <Switch
            checked={status?.injectionEnabled ?? true}
            onCheckedChange={(checked) =>
              setConfig({ injectionEnabled: checked })
            }
            aria-label="Inject relevant code into prompts"
          />
        </SettingsRow>
        <SettingsRow
          title="Workspace indexing"
          description="Auto skips very large workspaces; force it on if you want it indexed anyway."
        >
          <Select
            value={status?.override ?? "auto"}
            onValueChange={(v) =>
              setConfig({ override: v as "auto" | "on" | "off" })
            }
          >
            <SelectTrigger size="sm" className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="on">Always on</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

export function CodeSearchSection() {
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const activeWorkspace = workspaces.find((workspace) => workspace.id === ws)

  if (ws && activeWorkspace) {
    return <WorkspaceDetailPage workspace={activeWorkspace} />
  }

  return <OverviewPage workspaces={workspaces} />
}
