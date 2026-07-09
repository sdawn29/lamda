import { useNavigate, useSearch } from "@tanstack/react-router"
import { RefreshCwIcon } from "lucide-react"
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
  type SemanticIndexConfigUpdate,
} from "@/features/semantic-search"

function formatTimestamp(ms: number | null): string {
  if (!ms) return "never"
  return new Date(ms).toLocaleString()
}

export function CodeSearchSection() {
  const navigate = useNavigate()
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const effectiveWorkspaceId = ws ?? workspaces[0]?.id

  const { data: status } = useSemanticIndexStatus(effectiveWorkspaceId)
  const reindex = useTriggerSemanticReindex()
  const updateConfig = useUpdateSemanticIndexConfig()

  function setConfig(update: SemanticIndexConfigUpdate) {
    if (!effectiveWorkspaceId) return
    updateConfig.mutate(
      { workspaceId: effectiveWorkspaceId, update },
      {
        onError: (err) => {
          toast.error("Couldn't update code search settings", {
            description: err instanceof Error ? err.message : "Please try again.",
          })
        },
      }
    )
  }

  const embedProgress =
    status && status.chunkCount > 0
      ? Math.round((status.embeddedCount / status.chunkCount) * 100)
      : null

  return (
    <div className="flex flex-col gap-8">
      {workspaces.length > 1 && (
        <div className="flex justify-end">
          <Select
            value={effectiveWorkspaceId ?? ""}
            onValueChange={(v) =>
              void navigate({
                to: "/settings/$section",
                params: { section: "code-search" },
                search: { ws: v ?? undefined },
                replace: true,
              })
            }
          >
            <SelectTrigger size="sm" className="h-7 w-44 text-xs">
              <SelectValue>
                {workspaces.find((w) => w.id === effectiveWorkspaceId)?.name ??
                  "Workspace"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <SettingsGroup
        title="Semantic code search"
        description="Indexes this workspace's files so the agent and search can find code by meaning, not just exact text."
      >
        <SettingsRow
          title="Enable code search"
          description="Chunks and indexes workspace files in the background. Requires a Voyage API key for semantic ranking; falls back to keyword search without one."
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
        {workspaces.length > 0 && (
          <SettingsRow
            title="This workspace"
            description="Auto skips indexing very large workspaces; force it on if you want it indexed anyway."
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
        )}
      </SettingsGroup>

      {effectiveWorkspaceId && status && (
        <SettingsGroup
          title="Index status"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={reindex.isPending}
              onClick={() => reindex.mutate(effectiveWorkspaceId)}
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={reindex.isPending ? "animate-spin" : undefined}
              />
              Reindex
            </Button>
          }
        >
          <SettingsRow title="Files indexed" description="Chunked and up to date.">
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
                : "Not configured — set VOYAGE_API_KEY to enable semantic ranking (keyword search still works)."
            }
          >
            {status.vecAvailable && status.embeddingsEnabled && embedProgress !== null && (
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
