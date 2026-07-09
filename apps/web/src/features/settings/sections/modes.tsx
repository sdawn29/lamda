import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  Globe2Icon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"
import {
  deleteMode,
  saveMode,
  saveRawModeDefinition,
  type ModeDto,
  type SaveModeBody,
  type SaveRawDefinitionBody,
  type WorkspaceDto,
} from "@/features/workspace/api"
import {
  modeKeys,
  useAgents,
  useModes,
  useToolCatalog,
  useWorkspaces,
} from "@/features/workspace/queries"
import {
  DefinitionEditorFooter,
  DefinitionEditorHeader,
  DefinitionEditorPage,
  DeleteDefinitionDialog,
  FieldSection,
  KEBAB_ID_PATTERN,
} from "../components/editor-ui"
import {
  parseRawModeDefinition,
  RawDefinitionEditor,
  RawEditorToggle,
  serializeRawModeDefinition,
} from "../components/raw-definition-editor"
import { ToolPicker } from "../components/tool-picker"
import {
  colorStyle,
  resolveModeIcon,
} from "@/features/chat/components/mode-combobox"

interface ModeFormState {
  /** Derived from the name until the user edits it; fixed while editing. */
  id: string
  /** True once the user has typed in the id field, stopping name→id syncing. */
  idEdited: boolean
  isNew: boolean
  scope: "global" | "local"
  name: string
  description: string
  /** The complete allowlist — names and `*` prefix globs in one array. */
  tools: string[]
  /** Subagent ids the delegate tool may launch; null means all agents. */
  agents: string[] | null
  color: string
  icon: string
  preamble: string
}

function formFromMode(mode: ModeDto): ModeFormState {
  return {
    id: mode.id,
    idEdited: true,
    isNew: false,
    // Built-ins resolve as source "global" once seeded; editing one writes its
    // resolved file back.
    scope: mode.source === "local" ? "local" : "global",
    name: mode.label,
    description: mode.description,
    tools: [...mode.tools],
    agents: mode.agents ? [...mode.agents] : null,
    color: mode.color,
    icon: mode.icon,
    preamble: mode.preamble,
  }
}

function emptyForm(): ModeFormState {
  return {
    id: "",
    idEdited: false,
    isNew: true,
    scope: "global",
    name: "",
    description: "",
    // A safe, useful starting point: read-only research plus delegation to
    // the read-only explore agent.
    tools: ["read", "grep", "find", "ls", "question", "memory", "delegate"],
    agents: ["explore"],
    color: "violet",
    icon: "sparkles",
    preamble: "",
  }
}

/** One-glance summary for the list: tool count and subagent reach. */
function modeMeta(mode: ModeDto): string {
  const agents =
    mode.agents === null
      ? "all subagents"
      : mode.agents.length === 0
        ? "no subagents"
        : `${mode.agents.length} subagent${mode.agents.length === 1 ? "" : "s"}`
  return `${mode.tools.length} tool${mode.tools.length === 1 ? "" : "s"} · ${agents}`
}

function DefinitionCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-xl bg-muted" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <div className="h-3.5 w-32 rounded bg-muted" />
          <div className="h-3 w-56 rounded bg-muted/70" />
        </div>
      </div>
    </div>
  )
}

function WorkspaceScopeCard({
  workspace,
  count,
  onSelect,
}: {
  workspace: WorkspaceDto
  count?: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
          <SparklesIcon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm leading-snug font-medium">
            {workspace.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {workspace.path}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {count !== undefined && (
          <span className="text-3xs text-muted-foreground">
            {count} mode{count === 1 ? "" : "s"}
          </span>
        )}
        <ArrowRightIcon className="size-3.5 text-muted-foreground/40" />
      </span>
    </button>
  )
}

function ModeCreateLocationSelect({
  workspaces,
  workspaceId,
  scope,
  onChange,
}: {
  workspaces: WorkspaceDto[]
  workspaceId?: string
  scope: "global" | "local"
  onChange: (next: { scope: "global" | "local"; workspaceId?: string }) => void
}) {
  const value = scope === "local" && workspaceId ? workspaceId : "global"
  const label =
    value === "global"
      ? "Global"
      : (workspaces.find((workspace) => workspace.id === value)?.name ??
        "Workspace")

  return (
    <Select
      value={value}
      onValueChange={(next) =>
        onChange(
          next === "global"
            ? { scope: "global" }
            : { scope: "local", workspaceId: next }
        )
      }
    >
      <SelectTrigger size="sm" className="h-8 max-w-52 min-w-40">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="global">
          <Globe2Icon className="size-3.5 text-muted-foreground" />
          Global
        </SelectItem>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            <SparklesIcon className="size-3.5 text-muted-foreground" />
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ModeCard({
  mode,
  meta,
  onOpen,
  onDelete,
  deleting,
}: {
  mode: ModeDto
  meta: string
  onOpen: () => void
  onDelete?: () => void
  deleting: boolean
}) {
  const visual = useMemo(
    () => ({ Icon: resolveModeIcon(mode.icon) }),
    [mode.icon]
  )
  const style = colorStyle(mode.color)
  const DeleteIcon = mode.builtin ? RotateCcwIcon : Trash2Icon
  return (
    <div className="group relative rounded-2xl border border-border/70 bg-card/70 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md">
      <button
        type="button"
        aria-label={`Edit ${mode.label}`}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
      />
      <div className="pointer-events-none relative flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/40 shadow-sm",
            style.softBg,
            style.iconAccent
          )}
        >
          <visual.Icon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-sm leading-snug font-medium">
              {mode.label}
            </span>
            <code className="shrink-0 rounded bg-muted px-1 py-px font-mono text-3xs text-muted-foreground">
              {mode.id}
            </code>
            {mode.builtin && (
              <Badge variant="secondary" className="h-4 px-1.5 text-3xs">
                built-in
              </Badge>
            )}
            {mode.source === "local" && (
              <Badge variant="outline" className="h-4 px-1.5 text-3xs">
                workspace
              </Badge>
            )}
          </span>
          <span className="line-clamp-2 text-xs/relaxed text-muted-foreground">
            {mode.description || "No description"}
          </span>
          <span className="text-3xs text-muted-foreground/70">{meta}</span>
        </span>
        <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </div>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-9 bottom-2.5 z-10 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
          onClick={onDelete}
          disabled={deleting}
          title={mode.builtin ? "Reset to the built-in default" : "Delete"}
        >
          <DeleteIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

export function ModesSection() {
  const { mode } = useSearch({ from: "/settings/$section" })
  // The editor takes over the full page (the route skips SettingsContent
  // whenever ?mode= is set). Keyed so switching targets resets the form.
  if (mode) return <ModeEditorPage key={mode} modeParam={mode} />
  return <ModeListPage />
}

function ModeListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const activeWorkspace = workspaces.find((w) => w.id === ws)
  const isWorkspacePage = !!ws
  const effectiveWorkspaceId = ws
  const { data: modes = [], isLoading } = useModes(effectiveWorkspaceId)
  const visibleModes = isWorkspacePage
    ? modes.filter((mode) => mode.source === "local")
    : modes.filter((mode) => mode.source !== "local")
  const [pendingDelete, setPendingDelete] = useState<ModeDto | null>(null)

  const remove = useMutation({
    mutationFn: (input: { id: string; scope: "global" | "local" }) =>
      deleteMode(input.id, input.scope, effectiveWorkspaceId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: modeKeys.all }),
    onError: (err) => {
      toast.error("Couldn't delete the mode", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  const openEditor = (modeId: string) =>
    void navigate({
      to: "/settings/$section",
      params: { section: "modes" },
      search: ws ? { mode: modeId, ws } : { mode: modeId },
    })

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
              <SparklesIcon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-medium tracking-tight">
                {isWorkspacePage
                  ? `${activeWorkspace?.name ?? "Workspace"} modes`
                  : "Global modes"}
              </h2>
              <p className="max-w-2xl text-xs/relaxed text-muted-foreground">
                {isWorkspacePage
                  ? "Workspace-local modes live in this project's .lamda/modes folder."
                  : "Global modes are available in every workspace. Choose a workspace below to manage local modes."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isWorkspacePage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/settings/$section",
                    params: { section: "modes" },
                    search: {},
                  })
                }
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Global
              </Button>
            )}
            <Button size="sm" onClick={() => openEditor("new")}>
              <PlusIcon data-icon="inline-start" />
              New mode
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground">
            {isLoading && visibleModes.length === 0
              ? "Loading..."
              : `${visibleModes.length} mode${visibleModes.length === 1 ? "" : "s"}`}
          </span>
          <span className="truncate text-3xs text-muted-foreground/70">
            {isWorkspacePage ? ".lamda/modes" : "~/.lamda/modes"}
          </span>
        </div>
      </section>

      {!isWorkspacePage && workspaces.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Workspaces
            </h3>
            <span className="text-3xs text-muted-foreground/70">
              Open a workspace to manage its local mode files.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {workspaces.map((workspace) => (
              <WorkspaceScopeCard
                key={workspace.id}
                workspace={workspace}
                onSelect={() =>
                  void navigate({
                    to: "/settings/$section",
                    params: { section: "modes" },
                    search: { ws: workspace.id },
                    replace: true,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2.5">
          {isLoading && visibleModes.length === 0 ? (
            <>
              <DefinitionCardSkeleton />
              <DefinitionCardSkeleton />
              <DefinitionCardSkeleton />
            </>
          ) : visibleModes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 px-6 py-9 text-center">
              <SparklesIcon className="size-5 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {isWorkspacePage
                    ? "No local modes yet"
                    : "No global modes yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Create one with New mode.
                </p>
              </div>
            </div>
          ) : (
            visibleModes.map((mode) => (
              <ModeCard
                key={`${mode.source}:${mode.id}`}
                meta={modeMeta(mode)}
                mode={mode}
                onOpen={() => openEditor(mode.id)}
                // Source "builtin" means no file on disk — nothing to
                // delete/reset.
                onDelete={
                  mode.source !== "builtin"
                    ? () => setPendingDelete(mode)
                    : undefined
                }
                deleting={remove.isPending}
              />
            ))
          )}
        </div>
        <p className="text-2xs/relaxed text-muted-foreground/70">
          {isWorkspacePage
            ? "These modes are scoped to the selected workspace and stored in its .lamda/modes folder."
            : "Global modes are stored in ~/.lamda/modes and apply across workspaces."}
        </p>
      </section>

      <DeleteDefinitionDialog
        kind="mode"
        target={
          pendingDelete
            ? { name: pendingDelete.label, builtin: pendingDelete.builtin }
            : null
        }
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          remove.mutate({
            id: pendingDelete.id,
            scope: pendingDelete.source === "local" ? "local" : "global",
          })
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

function ModeEditorPage({ modeParam }: { modeParam: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const effectiveWorkspaceId = ws ?? workspaces[0]?.id
  const { data: modes = [], isLoading } = useModes(effectiveWorkspaceId)
  const { data: agents = [] } = useAgents(effectiveWorkspaceId)
  const { data: catalog = [], isLoading: catalogLoading } =
    useToolCatalog(effectiveWorkspaceId)

  const isNew = modeParam === "new"
  const mode = isNew ? null : (modes.find((m) => m.id === modeParam) ?? null)
  const [form, setForm] = useState<ModeFormState | null>(() =>
    isNew ? { ...emptyForm(), scope: ws ? "local" : "global" } : null
  )
  const [editorMode, setEditorMode] = useState<"form" | "raw">("form")
  const [rawContent, setRawContent] = useState("")
  const rawMode = useMemo(
    () => parseRawModeDefinition(rawContent),
    [rawContent]
  )

  // Editing an existing mode loads async — adopt it into the form once the
  // list arrives.
  useEffect(() => {
    if (!isNew && form === null && mode) setForm(formFromMode(mode))
  }, [isNew, form, mode])

  const goBack = () =>
    void navigate({
      to: "/settings/$section",
      params: { section: "modes" },
      search: { ws },
    })

  const save = useMutation({
    mutationFn: (
      input:
        | { id: string; body: SaveModeBody }
        | { id: string; raw: SaveRawDefinitionBody }
    ) =>
      "raw" in input
        ? saveRawModeDefinition(input.id, input.raw)
        : saveMode(input.id, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modeKeys.all })
      goBack()
    },
    onError: (err) => {
      toast.error("Couldn't save the mode", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  if (!form) {
    return (
      <DefinitionEditorPage backLabel="Modes" onBack={goBack}>
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `No mode named “${modeParam}” here.`}
        </p>
      </DefinitionEditorPage>
    )
  }

  const idInvalid = form.isNew && !!form.id && !KEBAB_ID_PATTERN.test(form.id)

  // The first thing still blocking the save, surfaced in the footer so the
  // disabled button is never a mystery.
  const formMissingHint = !form.name.trim()
    ? "Name the mode to continue."
    : !form.id
      ? "Give it a file id."
      : idInvalid
        ? "Ids use lowercase letters, digits, and dashes."
        : !form.description.trim()
          ? "Add a one-line description for the mode picker."
          : !form.preamble.trim()
            ? "Write the mode's preamble."
            : form.tools.length === 0
              ? "Allow at least one tool."
              : null
  const rawMissingHint =
    rawMode.ok === false
      ? (rawMode.diagnostics.find((d) => d.severity === "error")?.message ??
        "Fix the raw definition before saving.")
      : null
  const missingHint = editorMode === "raw" ? rawMissingHint : formMissingHint

  const canSubmit = missingHint === null && !save.isPending

  const delegateEnabled = form.tools.includes("delegate")
  const modeCanEdit = ["edit", "write", "bash"].some((tool) =>
    form.tools.includes(tool)
  )

  const submit = () => {
    if (!canSubmit) return
    if (editorMode === "raw") {
      if (!rawMode.ok) return
      save.mutate({
        id: form.id,
        raw: {
          scope: form.scope,
          workspaceId:
            form.scope === "local" ? effectiveWorkspaceId : undefined,
          content: rawContent,
        },
      })
      return
    }
    save.mutate({
      id: form.id,
      body: {
        scope: form.scope,
        workspaceId: form.scope === "local" ? effectiveWorkspaceId : undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        tools: form.tools,
        agents: form.agents,
        color: form.color,
        icon: form.icon.trim() || "sparkles",
        preamble: form.preamble.trim(),
      },
    })
  }

  const switchEditorMode = (next: "form" | "raw") => {
    if (next === editorMode) return
    if (next === "raw") {
      setRawContent(
        serializeRawModeDefinition({
          name: form.name,
          description: form.description,
          tools: form.tools,
          agents: form.agents,
          color: form.color,
          icon: form.icon,
          preamble: form.preamble,
        })
      )
      setEditorMode("raw")
      return
    }

    if (!rawMode.ok) {
      toast.error("Fix the raw definition before returning to the form")
      return
    }
    setForm({ ...form, ...rawMode.value })
    setEditorMode("form")
  }

  const changeCreateLocation = (next: {
    scope: "global" | "local"
    workspaceId?: string
  }) => {
    setForm({ ...form, scope: next.scope })
    void navigate({
      to: "/settings/$section",
      params: { section: "modes" },
      search:
        next.scope === "local" && next.workspaceId
          ? { mode: modeParam, ws: next.workspaceId }
          : { mode: modeParam },
      replace: true,
    })
  }

  return (
    <DefinitionEditorPage backLabel="Modes" onBack={goBack}>
      <DefinitionEditorHeader
        identity={form}
        namePlaceholder="Untitled mode"
        idPlaceholder="mode-id"
        dirGlobal="~/.lamda/modes"
        dirLocal=".lamda/modes"
        idInvalid={idInvalid}
        canScopeLocal={!!effectiveWorkspaceId}
        scopeControl={
          form.isNew ? (
            <ModeCreateLocationSelect
              workspaces={workspaces}
              workspaceId={ws}
              scope={form.scope}
              onChange={changeCreateLocation}
            />
          ) : undefined
        }
        onPatch={(patch) => setForm({ ...form, ...patch })}
      />

      <div className="flex justify-end pt-3">
        <RawEditorToggle value={editorMode} onChange={switchEditorMode} />
      </div>

      {editorMode === "form" ? (
        <div className="flex flex-col gap-3 pt-3">
          <FieldSection
            title="Description"
            hint="One line shown under the mode's name in the mode picker."
          >
            <Input
              value={form.description}
              placeholder='e.g. "Inspect code and report findings; never modifies files."'
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </FieldSection>

          <FieldSection
            title="Allowed tools"
            hint="Only what's checked here is active in this mode — the preamble steers, this enforces. “All + future” trusts a whole server, including tools it adds later."
          >
            {catalogLoading ? (
              <span className="text-2xs text-muted-foreground">
                Loading tools…
              </span>
            ) : (
              <ToolPicker
                groups={catalog}
                selected={form.tools}
                onChange={(tools) => setForm({ ...form, tools })}
              />
            )}
          </FieldSection>

          <FieldSection
            title="Allowed subagents"
            hint="Which agents the delegate tool may launch here. A read-only mode must only allow read-only agents — delegation would bypass its tool limits otherwise."
            action={
              delegateEnabled ? (
                <button
                  type="button"
                  aria-pressed={form.agents === null}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-3xs font-medium transition-colors",
                    form.agents === null
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                  onClick={() =>
                    setForm({
                      ...form,
                      agents:
                        form.agents === null
                          ? agents.map((agent) => agent.id)
                          : null,
                    })
                  }
                >
                  All agents
                </button>
              ) : undefined
            }
          >
            {!delegateEnabled ? (
              <span className="text-2xs text-muted-foreground">
                Enable the `delegate` tool above to let this mode launch
                subagents.
              </span>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {agents.map((agent) => {
                    const active =
                      form.agents === null || form.agents.includes(agent.id)
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        title={agent.description}
                        aria-pressed={active}
                        disabled={form.agents === null}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-2xs transition-colors",
                          active
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                          form.agents === null && "opacity-70"
                        )}
                        onClick={() =>
                          setForm({
                            ...form,
                            agents:
                              form.agents === null
                                ? form.agents
                                : form.agents.includes(agent.id)
                                  ? form.agents.filter((id) => id !== agent.id)
                                  : [...form.agents, agent.id],
                          })
                        }
                      >
                        <CheckIcon
                          className={cn(
                            "size-3",
                            active ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {agent.id}
                      </button>
                    )
                  })}
                </div>
                {form.agents === null && modeCanEdit === false && (
                  <span className="text-3xs text-amber-600 dark:text-amber-500">
                    This mode is read-only but allows every agent — agents with
                    edit or shell access would bypass its limits.
                  </span>
                )}
              </>
            )}
          </FieldSection>

          <FieldSection
            title="Preamble"
            hint="Prepended to every message sent in this mode. State the mode's role, how to work, and its boundaries."
          >
            <Textarea
              value={form.preamble}
              rows={10}
              placeholder={
                "Review mode — inspect code and report findings; never modify files.\n\n- Ground every claim in code you actually read…"
              }
              className="font-mono text-xs"
              onChange={(e) => setForm({ ...form, preamble: e.target.value })}
            />
          </FieldSection>
        </div>
      ) : (
        <div className="pt-3">
          <RawDefinitionEditor
            value={rawContent}
            diagnostics={rawMode.diagnostics}
            onChange={setRawContent}
          />
        </div>
      )}

      <DefinitionEditorFooter
        hint={
          missingHint ??
          "Saved as a markdown file — later edits to it apply live."
        }
        submitLabel={
          save.isPending
            ? "Saving…"
            : form.isNew
              ? "Create mode"
              : "Save changes"
        }
        canSubmit={canSubmit}
        onCancel={goBack}
        onSubmit={submit}
      />
    </DefinitionEditorPage>
  )
}
