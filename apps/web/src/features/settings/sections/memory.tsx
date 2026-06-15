import { useMemo, useState } from "react"
import {
  Brain,
  Calendar,
  Check,
  Clock,
  FolderGit2,
  Gauge,
  Globe,
  Pencil,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { Badge } from "@/shared/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { useWorkspaces } from "@/features/workspace/queries"

import { useAppSettings, useMemories } from "../queries"
import {
  useUpdateAppSetting,
  useUpdateMemory,
  useDeleteMemory,
} from "../mutations"
import { SettingsGroup, SettingsRow } from "../components/settings-ui"
import type { MemoryItem, MemoryKind, MemorySource } from "../api"

// ── Self-healing settings ─────────────────────────────────────────────────────

interface HealingSettings {
  enabled: boolean
  maxAttempts: number
}

const DEFAULT_HEALING: HealingSettings = { enabled: false, maxAttempts: 2 }
const HEALING_KEY = "healing"

function parseHealing(raw: string | undefined): HealingSettings {
  if (!raw) return DEFAULT_HEALING
  try {
    const parsed = JSON.parse(raw) as Partial<HealingSettings>
    return {
      enabled: parsed.enabled === true,
      maxAttempts:
        typeof parsed.maxAttempts === "number" && parsed.maxAttempts > 0
          ? Math.min(Math.floor(parsed.maxAttempts), 5)
          : DEFAULT_HEALING.maxAttempts,
    }
  } catch {
    return DEFAULT_HEALING
  }
}

// ── Source metadata ───────────────────────────────────────────────────────────

const SOURCE_META: Record<
  MemorySource,
  { label: string; short: string; dot: string }
> = {
  user: { label: "You", short: "You", dot: "bg-emerald-500" },
  agent: { label: "Agent", short: "Agent", dot: "bg-sky-500" },
  healing: { label: "Self-healing", short: "Healing", dot: "bg-amber-500" },
}

// Labels for the memory `kind` taxonomy. `fact` is the default/neutral kind and
// gets no badge to keep the list uncluttered.
const KIND_META: Record<Exclude<MemoryKind, "fact">, string> = {
  preference: "Preference",
  convention: "Convention",
  decision: "Decision",
  episode: "Episode",
}

type SourceFilter = "all" | MemorySource

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`
  return `${Math.floor(diff / 31536000)}y ago`
}

// ── Section ───────────────────────────────────────────────────────────────────

export function MemorySection() {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()

  const healing = useMemo(() => parseHealing(settings?.[HEALING_KEY]), [settings])

  function saveHealing(next: HealingSettings) {
    updateSetting.mutate({ key: HEALING_KEY, value: JSON.stringify(next) })
  }

  const { data: memories = [] } = useMemories()
  const { data: workspaces = [] } = useWorkspaces()

  const [query, setQuery] = useState("")
  const [source, setSource] = useState<SourceFilter>("all")

  const workspaceName = useMemo(() => {
    const map = new Map(workspaces.map((w) => [w.id, w.name]))
    return (id: string | null) => (id ? (map.get(id) ?? id) : null)
  }, [workspaces])

  // Which sources actually appear — used to decide whether to show the filter.
  const presentSources = useMemo(() => {
    const set = new Set<MemorySource>()
    for (const m of memories) set.add(m.source)
    return set
  }, [memories])

  // Apply search + source filters, then group: user-scope first ("All
  // projects"), then one group per workspace. Newest-touched memories lead.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return memories.filter((m) => {
      if (source !== "all" && m.source !== source) return false
      if (!q) return true
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        (m.category?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [memories, query, source])

  const groups = useMemo(() => {
    const rank = (m: MemoryItem) => m.lastUsedAt ?? m.updatedAt ?? m.createdAt
    const sorted = [...filtered].sort((a, b) => {
      // Pinned (always-on core) memories lead, then most-recently-touched.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return rank(b) - rank(a)
    })

    const userMemories = sorted.filter((m) => m.scope === "user")
    const byWorkspace = new Map<string, MemoryItem[]>()
    for (const m of sorted) {
      if (m.scope !== "workspace" || !m.workspaceId) continue
      const list = byWorkspace.get(m.workspaceId) ?? []
      list.push(m)
      byWorkspace.set(m.workspaceId, list)
    }
    const result: {
      key: string
      label: string
      scope: "user" | "workspace"
      items: MemoryItem[]
    }[] = []
    if (userMemories.length) {
      result.push({
        key: "user",
        label: "All projects",
        scope: "user",
        items: userMemories,
      })
    }
    for (const [wsId, items] of byWorkspace) {
      result.push({
        key: wsId,
        label: workspaceName(wsId) ?? wsId,
        scope: "workspace",
        items,
      })
    }
    return result
  }, [filtered, workspaceName])

  const hasMemories = memories.length > 0
  const noMatches = hasMemories && filtered.length === 0

  return (
    <>
      <SettingsGroup
        title="Self-healing"
        description="When an agent turn ends in an error, automatically re-prompt the agent to diagnose and fix it. Lessons from successful recoveries are saved as workspace memories."
      >
        <SettingsRow
          title="Enable self-healing"
          description="Auto-retry failed agent turns. Errors the agent can't fix (rate limits, auth, billing) are left for you to handle."
        >
          <Switch
            checked={healing.enabled}
            onCheckedChange={(checked) =>
              saveHealing({ ...healing, enabled: checked })
            }
            aria-label="Enable self-healing"
          />
        </SettingsRow>

        {healing.enabled && (
          <SettingsRow
            title="Max healing attempts"
            description="How many times to re-prompt before giving up (1–5)."
            htmlFor="healing-max-attempts"
          >
            <Input
              id="healing-max-attempts"
              type="number"
              min={1}
              max={5}
              value={healing.maxAttempts}
              onChange={(e) => {
                const n = Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1))
                saveHealing({ ...healing, maxAttempts: n })
              }}
              className="w-24 text-right"
            />
          </SettingsRow>
        )}
      </SettingsGroup>

      <section className="flex flex-col">
        <header className="flex flex-col gap-0.5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium tracking-tight">Memories</h2>
            {hasMemories && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {memories.length} saved
              </span>
            )}
          </div>
          <p className="text-xs/relaxed text-muted-foreground">
            Durable facts the agent has learned. Workspace memories apply to one
            project; user memories apply everywhere.
          </p>
        </header>

        {!hasMemories ? (
          <EmptyMemories />
        ) : (
          <>
            {/* Toolbar: search + source filter */}
            <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  placeholder="Search memories…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 pr-8 pl-8 text-xs"
                  aria-label="Search memories"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X />
                    <span className="sr-only">Clear search</span>
                  </Button>
                )}
              </div>

              {presentSources.size > 1 && (
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[source]}
                  onValueChange={(values) => {
                    const next = values.find((v) => v !== source)
                    setSource((next as SourceFilter) ?? "all")
                  }}
                  className="self-start sm:self-auto"
                >
                  <ToggleGroupItem value="all" className="text-xs">
                    All
                  </ToggleGroupItem>
                  {(["user", "agent", "healing"] as MemorySource[])
                    .filter((s) => presentSources.has(s))
                    .map((s) => (
                      <ToggleGroupItem key={s} value={s} className="gap-1.5 text-xs">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            SOURCE_META[s].dot
                          )}
                        />
                        {SOURCE_META[s].short}
                      </ToggleGroupItem>
                    ))}
                </ToggleGroup>
              )}
            </div>

            {noMatches ? (
              <NoMatches onClear={() => (setQuery(""), setSource("all"))} />
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map((group) => (
                  <div key={group.key} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 px-0.5">
                      {group.scope === "user" ? (
                        <Globe className="size-3.5 text-muted-foreground/70" />
                      ) : (
                        <FolderGit2 className="size-3.5 text-muted-foreground/70" />
                      )}
                      <h3 className="text-xs font-medium text-foreground">
                        {group.label}
                      </h3>
                      <span className="text-xs tabular-nums text-muted-foreground/70">
                        {group.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {group.items.map((m) => (
                        <MemoryCard key={m.id} memory={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyMemories() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted/60">
        <Brain className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">No memories yet</p>
        <p className="mx-auto max-w-xs text-xs/relaxed text-muted-foreground">
          The agent saves memories as it learns your conventions — or picks them
          up from your corrections. They'll show up here once it does.
        </p>
      </div>
    </div>
  )
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
      <Search className="size-5 text-muted-foreground/70" />
      <p className="text-xs text-muted-foreground">
        No memories match your filters.
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}

// ── Single memory card ────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: MemorySource }) {
  const meta = SOURCE_META[source]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  )
}

function KindBadge({ kind }: { kind: MemoryKind }) {
  if (kind === "fact") return null
  return <Badge variant="outline">{KIND_META[kind]}</Badge>
}

function MemoryMeta({ memory }: { memory: MemoryItem }) {
  const parts: { icon: typeof Clock; label: string }[] = [
    { icon: Calendar, label: `Added ${relativeTime(memory.createdAt)}` },
  ]
  if (memory.useCount > 0) {
    parts.push({
      icon: Sparkles,
      label: `Used ${memory.useCount}${memory.useCount === 1 ? " time" : "×"}`,
    })
    if (memory.lastUsedAt) {
      parts.push({ icon: Clock, label: `Last used ${relativeTime(memory.lastUsedAt)}` })
    }
  }
  // Surface confidence only when it deviates from full strength, so reinforced
  // and not-yet-confirmed memories are distinguishable at a glance.
  if (memory.confidence < 0.999) {
    parts.push({ icon: Gauge, label: `Confidence ${Math.round(memory.confidence * 100)}%` })
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground/80">
      {parts.map((p, i) => {
        const Icon = p.icon
        return (
          <span key={i} className="inline-flex items-center gap-1">
            <Icon className="size-3" />
            {p.label}
          </span>
        )
      })}
    </div>
  )
}

function MemoryCard({ memory }: { memory: MemoryItem }) {
  const updateMemory = useUpdateMemory()
  const deleteMemory = useDeleteMemory()

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(memory.title)
  const [content, setContent] = useState(memory.content)

  function startEdit() {
    setTitle(memory.title)
    setContent(memory.content)
    setEditing(true)
  }

  function save() {
    const t = title.trim()
    const c = content.trim()
    if (!t || !c) return
    updateMemory.mutate(
      { id: memory.id, fields: { title: t, content: c } },
      { onSuccess: () => setEditing(false) }
    )
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Memory title"
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Content"
          aria-label="Memory content"
          rows={3}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X data-icon="inline-start" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={updateMemory.isPending || !title.trim() || !content.trim()}
          >
            <Check data-icon="inline-start" />
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group/mem relative flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/30 px-3.5 py-3 transition-colors hover:border-border hover:bg-card/60">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium leading-snug">
            {memory.title}
          </span>
          {memory.pinned && (
            <Badge variant="outline" className="gap-1.5">
              <Pin className="size-2.5" />
              Pinned
            </Badge>
          )}
          <KindBadge kind={memory.kind} />
          <SourceBadge source={memory.source} />
          {memory.category && <Badge variant="ghost">{memory.category}</Badge>}
        </div>
        <p className="text-xs/relaxed whitespace-pre-wrap text-muted-foreground">
          {memory.content}
        </p>
        <MemoryMeta memory={memory} />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/mem:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            updateMemory.mutate({ id: memory.id, fields: { pinned: !memory.pinned } })
          }
          disabled={updateMemory.isPending}
          aria-label={memory.pinned ? "Unpin memory" : "Pin memory"}
          className={cn(memory.pinned && "text-foreground")}
        >
          {memory.pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={startEdit}
          aria-label="Edit memory"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => deleteMemory.mutate(memory.id)}
          disabled={deleteMemory.isPending}
          aria-label="Delete memory"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
