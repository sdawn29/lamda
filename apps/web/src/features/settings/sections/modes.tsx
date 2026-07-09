import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { CheckIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  deleteMode,
  saveMode,
  type ModeDto,
  type SaveModeBody,
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
  const effectiveWorkspaceId = ws ?? workspaces[0]?.id
  const { data: modes = [], isLoading } = useModes(effectiveWorkspaceId)
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
      search: { mode: modeId, ws },
    })

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {isLoading && modes.length === 0
              ? "Loading…"
              : `${modes.length} mode${modes.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-2">
            {workspaces.length > 1 && (
              <Select
                value={effectiveWorkspaceId ?? ""}
                onValueChange={(v) =>
                  void navigate({
                    to: "/settings/$section",
                    params: { section: "modes" },
                    search: { ws: v ?? undefined },
                    replace: true,
                  })
                }
              >
                <SelectTrigger size="sm" className="h-7 w-44 text-xs">
                  <SelectValue>
                    {workspaces.find((w) => w.id === effectiveWorkspaceId)
                      ?.name ?? "Workspace"}
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
            )}
            <Button size="sm" onClick={() => openEditor("new")}>
              <PlusIcon data-icon="inline-start" />
              New mode
            </Button>
          </div>
        </div>
        <DefinitionList>
          {isLoading && modes.length === 0 ? (
            <>
              <DefinitionRowSkeleton />
              <DefinitionRowSkeleton />
              <DefinitionRowSkeleton />
            </>
          ) : modes.length === 0 ? (
            <p className="px-2.5 py-8 text-center text-xs text-muted-foreground">
              No modes yet — create one with “New mode”.
            </p>
          ) : (
            modes.map((mode) => (
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
        </DefinitionList>
        <p className="text-2xs/relaxed text-muted-foreground/70">
          Modes are markdown files in <code>~/.lamda/modes</code> (global) or a
          workspace's <code>.lamda/modes</code> — edits to the files apply live,
          including for running threads.
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
    isNew ? emptyForm() : null
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
    mutationFn: (input: { id: string; body: SaveModeBody }) =>
      saveMode(input.id, input.body),
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
  const missingHint = !form.name.trim()
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

  const canSubmit = missingHint === null && !save.isPending

  const delegateEnabled = form.tools.includes("delegate")
  const modeCanEdit = ["edit", "write", "bash"].some((tool) =>
    form.tools.includes(tool)
  )

  const submit = () => {
    if (!canSubmit) return
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
        onPatch={(patch) => setForm({ ...form, ...patch })}
      />

      <div className="flex flex-col gap-6 pt-6">
        <FieldSection
          title="Description"
          hint="One line shown under the mode's name in the mode picker."
        >
          <Input
            value={form.description}
            placeholder='e.g. "Inspect code and report findings; never modifies files."'
            onChange={(e) => setForm({ ...form, description: e.target.value })}
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

      <DefinitionEditorFooter
        hint={
          missingHint ??
          "Saved as a markdown file — later edits to it apply live."
        }
        submitLabel={
          save.isPending ? "Saving…" : form.isNew ? "Create mode" : "Save changes"
        }
        canSubmit={canSubmit}
        onCancel={goBack}
        onSubmit={submit}
      />
    </DefinitionEditorPage>
  )
}
