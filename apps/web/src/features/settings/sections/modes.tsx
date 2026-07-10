import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  Globe2Icon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
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
  DefinitionList,
  DefinitionRow,
  DefinitionRowSkeleton,
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
    // A safe, useful starting point: Ask-like read-only research plus
    // delegation to the read-only explore agent.
    tools: [
      "read",
      "grep",
      "find",
      "ls",
      "question",
      "memory",
      "delegate",
      "lsp",
      "web_fetch",
      "semantic_search",
    ],
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
      onValueChange={(next) => {
        if (!next || next === "global") {
          onChange({ scope: "global" })
          return
        }
        onChange({ scope: "local", workspaceId: next })
      }}
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
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate">
              {isWorkspacePage
                ? `${activeWorkspace?.name ?? "Workspace"} — ${
                    isLoading && visibleModes.length === 0
                      ? "loading…"
                      : `${visibleModes.length} local mode${visibleModes.length === 1 ? "" : "s"}`
                  }`
                : isLoading && visibleModes.length === 0
                  ? "Loading…"
                  : `${visibleModes.length} mode${visibleModes.length === 1 ? "" : "s"}`}
            </span>
            <span aria-hidden="true">·</span>
            <code className="font-mono text-2xs">
              {isWorkspacePage ? ".lamda/modes" : "~/.lamda/modes"}
            </code>
          </p>
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

        {isLoading && visibleModes.length === 0 ? (
          <DefinitionList>
            <DefinitionRowSkeleton />
            <DefinitionRowSkeleton />
            <DefinitionRowSkeleton />
          </DefinitionList>
        ) : visibleModes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 px-6 py-8 text-center">
            <SparklesIcon className="size-5 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {isWorkspacePage ? "No workspace modes" : "No global modes"}
              </p>
              <p className="text-xs text-muted-foreground">
                Create one with New mode.
              </p>
            </div>
          </div>
        ) : (
          <DefinitionList>
            {visibleModes.map((mode) => (
              <DefinitionRow
                key={`${mode.source}:${mode.id}`}
                icon={mode.icon}
                color={mode.color}
                name={mode.label}
                id={mode.id}
                builtin={mode.builtin}
                workspace={mode.source === "local"}
                description={mode.description}
                meta={modeMeta(mode)}
                onEdit={() => openEditor(mode.id)}
                onDelete={
                  mode.source !== "builtin"
                    ? () => setPendingDelete(mode)
                    : undefined
                }
                deleting={remove.isPending}
              />
            ))}
          </DefinitionList>
        )}
      </section>

      {!isWorkspacePage && workspaces.length > 0 && (
        <section className="flex flex-col gap-3">
          <header className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium tracking-tight">
              Workspace overrides
            </h2>
            <p className="text-xs/relaxed text-muted-foreground">
              Workspace-local mode files override or extend the global set. Open
              a workspace to edit them.
            </p>
          </header>
          <DefinitionList>
            {workspaces.map((workspace) => (
              <DefinitionRow
                key={workspace.id}
                icon="sparkles"
                color="slate"
                name={workspace.name}
                id="workspace"
                builtin={false}
                workspace
                description={workspace.path}
                meta=".lamda/modes"
                onEdit={() =>
                  void navigate({
                    to: "/settings/$section",
                    params: { section: "modes" },
                    search: { ws: workspace.id },
                    replace: true,
                  })
                }
              />
            ))}
          </DefinitionList>
        </section>
      )}

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
  const [draftForm, setForm] = useState<ModeFormState | null>(() =>
    isNew ? { ...emptyForm(), scope: ws ? "local" : "global" } : null
  )
  const form = draftForm ?? (!isNew && mode ? formFromMode(mode) : null)
  const [editorMode, setEditorMode] = useState<"form" | "raw">("form")
  const [rawContent, setRawContent] = useState("")
  const rawMode = useMemo(
    () => parseRawModeDefinition(rawContent),
    [rawContent]
  )

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

      <div className="flex justify-end pt-2.5">
        <RawEditorToggle value={editorMode} onChange={switchEditorMode} />
      </div>

      {editorMode === "form" ? (
        <div className="flex flex-col divide-y divide-border/50">
          <FieldSection
            className="py-5"
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
            className="py-5"
            title="Allowed tools"
            hint="Only what's checked here is active in this mode. “All + future” trusts a whole server, including tools it adds later."
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
            className="py-5"
            title="Allowed subagents"
            hint="Which agents the delegate tool may launch here. Read-only modes should only allow read-only agents."
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
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-2xs transition-colors",
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
                            active ? "text-primary" : "opacity-0"
                          )}
                        />
                        {agent.id}
                      </button>
                    )
                  })}
                </div>
                {form.agents === null && modeCanEdit === false && (
                  <span className="text-3xs text-muted-foreground">
                    This mode is read-only but allows every agent; agents with
                    edit or shell access would bypass its limits.
                  </span>
                )}
              </>
            )}
          </FieldSection>

          <FieldSection
            className="py-5"
            title="Preamble"
            hint="Prepended to every user message in the mode. State the mode's role, how to work, and its boundaries."
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
        <FieldSection
          className="py-5"
          title="Raw definition"
          hint="Edit the markdown file exactly as it will be saved."
        >
          <RawDefinitionEditor
            value={rawContent}
            diagnostics={rawMode.diagnostics}
            onChange={setRawContent}
          />
        </FieldSection>
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
