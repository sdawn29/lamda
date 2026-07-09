import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FileTextIcon,
  Layers3Icon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import { Progress } from "@/shared/ui/progress"
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
  useTriggerSemanticReindex,
  useUpdateSemanticIndexConfig,
  type SemanticIndexStatus,
  type SemanticIndexConfigUpdate,
} from "@/features/semantic-search"
import type { WorkspaceDto } from "@/features/workspace/api"
import { cn } from "@/shared/lib/utils"

function formatTimestamp(ms: number | null): string {
  if (!ms) return "never"
  return new Date(ms).toLocaleString()
}

function formatPercent(status: SemanticIndexStatus | undefined): number | null {
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

function WorkspaceIndexCard({
  workspace,
  selected,
  onOpen,
}: {
  workspace: WorkspaceDto
  selected: boolean
  onOpen: () => void
}) {
  const { data: status } = useSemanticIndexStatus(workspace.id)
  const embedProgress = formatPercent(status)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        selected && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
            <SearchIcon className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm leading-snug font-medium">
              {workspace.name}
            </span>
            <span className="line-clamp-1 text-xs/relaxed text-muted-foreground">
              {workspace.path}
            </span>
          </span>
        </div>
        <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {embedProgress !== null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
              <span>Local semantic vectors</span>
              <span className="tabular-nums">{embedProgress}%</span>
            </div>
            <Progress value={embedProgress} className="h-1.5" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <MiniStat
            icon={<FileTextIcon />}
            label="Files"
            value={status?.fileCount ?? "—"}
          />
          <MiniStat
            icon={<Layers3Icon />}
            label="Chunks"
            value={status?.chunkCount ?? "—"}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full border px-2 text-[0.65rem] font-medium",
              statusTone(status)
            )}
          >
            {statusLabel(status)}
          </span>
          <span className="text-[0.65rem] text-muted-foreground">
            {status?.lastIndexedAt
              ? formatTimestamp(status.lastIndexedAt)
              : "Not indexed yet"}
          </span>
        </div>
        {status?.lastError && (
          <p className="line-clamp-2 text-[0.65rem] leading-snug text-destructive">
            {status.lastError.message}
          </p>
        )}
      </div>
    </button>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5">
      <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[0.65rem] text-muted-foreground">{label}</span>
        <span className="truncate text-xs font-medium tabular-nums">
          {value}
        </span>
      </span>
    </div>
  )
}

function OverviewPage({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceDto[]
  activeWorkspaceId?: string
}) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
            <DatabaseIcon className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-sm font-medium tracking-tight">
              Semantic code search
            </h2>
            <p className="max-w-2xl text-xs/relaxed text-muted-foreground">
              Each workspace keeps its own local index. Open a workspace to tune
              indexing, inspect coverage, and rebuild the semantic vectors.
            </p>
          </div>
        </div>
      </section>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 px-6 py-9 text-center">
          <SearchIcon className="size-5 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No workspaces yet</p>
            <p className="text-xs text-muted-foreground">
              Add a workspace before configuring code search.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {workspaces.map((workspace) => (
            <WorkspaceIndexCard
              key={workspace.id}
              workspace={workspace}
              selected={workspace.id === activeWorkspaceId}
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

function WorkspaceDetailPage({ workspace }: { workspace: WorkspaceDto }) {
  const navigate = useNavigate()
  const { data: status } = useSemanticIndexStatus(workspace.id)
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

  const embedProgress = formatPercent(status)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
              <SearchIcon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-medium tracking-tight">
                  {workspace.name}
                </h2>
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full border px-2 text-[0.65rem] font-medium",
                    statusTone(status)
                  )}
                >
                  {statusLabel(status)}
                </span>
              </div>
              <p className="text-xs/relaxed break-all text-muted-foreground">
                {workspace.path}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              void navigate({
                to: "/settings/$section",
                params: { section: "code-search" },
                search: {},
              })
            }
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Workspaces
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <MiniStat
            icon={<FileTextIcon />}
            label="Files"
            value={status?.fileCount ?? "—"}
          />
          <MiniStat
            icon={<Layers3Icon />}
            label="Chunks"
            value={status?.chunkCount ?? "—"}
          />
          <MiniStat
            icon={<CheckCircle2Icon />}
            label="Embedded"
            value={status?.embeddedCount ?? "—"}
          />
          <MiniStat
            icon={<DatabaseIcon />}
            label="Last indexed"
            value={status ? formatTimestamp(status.lastIndexedAt) : "—"}
          />
        </div>

        {embedProgress !== null && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Local semantic vector coverage
              </span>
              <span className="font-medium tabular-nums">{embedProgress}%</span>
            </div>
            <Progress value={embedProgress} className="h-1.5" />
          </div>
        )}

        {status?.lastError && (
          <div
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Last indexing error</span>
              <span className="break-words text-destructive/90">
                {status.lastError.message}
              </span>
              <span className="text-[0.65rem] text-destructive/70">
                {formatTimestamp(status.lastError.occurredAt)}
              </span>
            </div>
          </div>
        )}
      </section>

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

      {status && (
        <SettingsGroup
          title="Index details"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={reindex.isPending}
              onClick={() => reindex.mutate(workspace.id)}
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={reindex.isPending ? "animate-spin" : undefined}
              />
              Reindex
            </Button>
          }
        >
          <SettingsRow
            title="Files indexed"
            description="Chunked and up to date."
          >
            <span className="text-sm tabular-nums">{status.fileCount}</span>
          </SettingsRow>
          <SettingsRow title="Chunks" description="Total indexed code chunks.">
            <span className="text-sm tabular-nums">{status.chunkCount}</span>
          </SettingsRow>
          <SettingsRow
            title="Semantic ranking"
            description={
              status.vecAvailable && status.embeddingsEnabled
                ? embedProgress !== null
                  ? `${status.embeddedCount} / ${status.chunkCount} chunks embedded`
                  : "Ready"
                : "Vector search unavailable in this build; keyword search still works."
            }
          >
            {status.vecAvailable &&
              status.embeddingsEnabled &&
              embedProgress !== null && (
                <Progress value={embedProgress} className="h-1.5 w-28" />
              )}
          </SettingsRow>
          <SettingsRow title="Last indexed">
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(status.lastIndexedAt)}
            </span>
          </SettingsRow>
        </SettingsGroup>
      )}
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

  return <OverviewPage workspaces={workspaces} activeWorkspaceId={ws} />
}
