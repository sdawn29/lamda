import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  CheckIcon,
  EyeIcon,
  FilePenLineIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareTerminalIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  ModelCombobox,
  type ModelGroup,
} from "@/features/chat/components/model-combobox"
import { useModels } from "@/features/chat/queries"
import {
  deleteAgent,
  saveAgent,
  type AgentDto,
  type SaveAgentBody,
} from "@/features/workspace/api"
import {
  agentKeys,
  useAgents,
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

/**
 * Builtin tools a subagent may be granted — mirrors SUBAGENT_TOOL_NAMES
 * server-side. The form's single `tools` array also carries workspace custom
 * tool names (memory, MCP, LSP, git-host) alongside these.
 */
const BUILTIN_AGENT_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
] as const

function isBuiltinTool(name: string): boolean {
  return (BUILTIN_AGENT_TOOLS as readonly string[]).includes(name)
}

/**
 * The three access levels users actually reason in. Each is a complete
 * builtin toolset; picking one swaps the builtin subset of the allowlist and
 * leaves workspace custom tools untouched.
 */
const ACCESS_PRESETS = [
  {
    id: "read",
    label: "Read-only",
    blurb: "Searches and reads code. Can't change anything.",
    Icon: EyeIcon,
    tools: ["read", "grep", "find", "ls"],
  },
  {
    id: "edit",
    label: "Read & edit",
    blurb: "Also creates and edits files. No shell access.",
    Icon: FilePenLineIcon,
    tools: ["read", "grep", "find", "ls", "edit", "write"],
  },
  {
    id: "full",
    label: "Full access",
    blurb: "Edits files and runs shell commands.",
    Icon: SquareTerminalIcon,
    tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
  },
] as const

type AccessPresetId = (typeof ACCESS_PRESETS)[number]["id"]

/** The preset whose builtin toolset exactly matches `tools`, or null if custom. */
function presetForTools(tools: string[]): AccessPresetId | null {
  const builtins = new Set(tools.filter(isBuiltinTool))
  const match = ACCESS_PRESETS.find(
    (preset) =>
      preset.tools.length === builtins.size &&
      preset.tools.every((tool) => builtins.has(tool))
  )
  return match?.id ?? null
}

interface AgentFormState {
  /** Derived from the name until the user edits it; fixed while editing. */
  id: string
  /** True once the user has typed in the id field, stopping name→id syncing. */
  idEdited: boolean
  isNew: boolean
  scope: "global" | "local"
  name: string
  description: string
  model: string | null
  /** The complete allowlist — builtin and custom tool names in one array. */
  tools: string[]
  color: string
  icon: string
  prompt: string
}

function formFromAgent(agent: AgentDto): AgentFormState {
  return {
    id: agent.id,
    idEdited: true,
    isNew: false,
    // Built-ins resolve as source "global" once seeded; editing one writes its
    // resolved file back.
    scope: agent.source === "local" ? "local" : "global",
    name: agent.label,
    description: agent.description,
    model: agent.model,
    tools: [...agent.tools],
    color: agent.color,
    icon: agent.icon,
    prompt: agent.prompt,
  }
}

function emptyForm(): AgentFormState {
  return {
    id: "",
    idEdited: false,
    isNew: true,
    scope: "global",
    name: "",
    description: "",
    model: null,
    tools: ["read", "grep", "find", "ls"],
    color: "violet",
    icon: "bot",
    prompt: "",
  }
}

/**
 * One-glance summary for the list: access level (preset name when the builtin
 * toolset matches one), extra workspace tools, and a pinned model if any —
 * silence on the model means it inherits the conversation's.
 */
function agentMeta(agent: AgentDto): string {
  const preset = presetForTools(agent.tools)
  const presetLabel = ACCESS_PRESETS.find((p) => p.id === preset)?.label
  const builtinCount = agent.tools.filter(isBuiltinTool).length
  const customCount = agent.tools.length - builtinCount
  const access =
    presetLabel ?? `${builtinCount} builtin tool${builtinCount === 1 ? "" : "s"}`
  const parts = [
    customCount > 0
      ? `${access} +${customCount} tool${customCount === 1 ? "" : "s"}`
      : access,
  ]
  if (agent.model) {
    const idx = agent.model.indexOf("::")
    parts.push(idx === -1 ? agent.model : agent.model.slice(idx + 2))
  }
  return parts.join(" · ")
}

/**
 * Access section: the three preset cards plus a per-tool escape hatch. The
 * chips stay hidden until the user asks for them (or the toolset no longer
 * matches any preset, e.g. an agent file edited by hand).
 */
function AccessPicker({
  tools,
  onChange,
}: {
  tools: string[]
  onChange: (tools: string[]) => void
}) {
  const preset = presetForTools(tools)
  const [customizeOpen, setCustomizeOpen] = useState(preset === null)
  const showChips = customizeOpen || preset === null

  const customNames = tools.filter((tool) => !isBuiltinTool(tool))

  return (
    <FieldSection
      title="Access level"
      hint="What the agent is physically able to do — the prompt only steers, this enforces."
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-2xs text-muted-foreground"
          onClick={() => setCustomizeOpen((open) => !open)}
        >
          {showChips ? "Hide tools" : "Customize tools"}
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {ACCESS_PRESETS.map(({ id, label, blurb, Icon }) => {
          const active = preset === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 hover:border-border hover:bg-accent/40"
              )}
              onClick={() =>
                onChange([
                  ...(ACCESS_PRESETS.find((p) => p.id === id)?.tools ?? []),
                  ...customNames,
                ])
              }
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  !active && "text-muted-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                />
                {label}
                {active && <CheckIcon className="size-3 text-primary" />}
              </span>
              <span className="text-3xs leading-relaxed font-normal text-muted-foreground">
                {blurb}
              </span>
            </button>
          )
        })}
      </div>
      {showChips && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border/60 p-2.5">
          <span className="text-3xs font-medium text-muted-foreground">
            {preset === null
              ? "Custom toolset — doesn't match a preset"
              : "Individual tools"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_AGENT_TOOLS.map((tool) => {
              const active = tools.includes(tool)
              return (
                <button
                  key={tool}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-2xs transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                  onClick={() =>
                    onChange(
                      active
                        ? tools.filter((t) => t !== tool)
                        : [...tools, tool]
                    )
                  }
                >
                  {tool}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </FieldSection>
  )
}

export function AgentsSection() {
  const { agent } = useSearch({ from: "/settings/$section" })
  // The editor takes over the full page (the route skips SettingsContent
  // whenever ?agent= is set). Keyed so switching targets resets the form.
  if (agent) return <AgentEditorPage key={agent} agentParam={agent} />
  return <AgentListPage />
}

function AgentListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const effectiveWorkspaceId = ws ?? workspaces[0]?.id
  const { data: agents = [], isLoading } = useAgents(effectiveWorkspaceId)
  const [pendingDelete, setPendingDelete] = useState<AgentDto | null>(null)

  const remove = useMutation({
    mutationFn: (input: { id: string; scope: "global" | "local" }) =>
      deleteAgent(input.id, input.scope, effectiveWorkspaceId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: agentKeys.all }),
    onError: (err) => {
      toast.error("Couldn't delete the agent", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  const openEditor = (agentId: string) =>
    void navigate({
      to: "/settings/$section",
      params: { section: "agents" },
      search: { agent: agentId, ws },
    })

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {isLoading && agents.length === 0
              ? "Loading…"
              : `${agents.length} subagent${agents.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-2">
            {workspaces.length > 1 && (
              <Select
                value={effectiveWorkspaceId ?? ""}
                onValueChange={(v) =>
                  void navigate({
                    to: "/settings/$section",
                    params: { section: "agents" },
                    search: { ws: v ?? undefined },
                    replace: true,
                  })
                }
              >
                <SelectTrigger size="sm" className="h-7 w-44 text-xs">
                  {/* Base UI's Value renders the raw value (the workspace id)
                      unless given children — resolve it to the name. */}
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
              New agent
            </Button>
          </div>
        </div>
        <DefinitionList>
          {isLoading && agents.length === 0 ? (
            <>
              <DefinitionRowSkeleton />
              <DefinitionRowSkeleton />
              <DefinitionRowSkeleton />
            </>
          ) : agents.length === 0 ? (
            <p className="px-2.5 py-8 text-center text-xs text-muted-foreground">
              No subagents yet — create one with “New agent”.
            </p>
          ) : (
            agents.map((agent) => (
              <DefinitionRow
                key={`${agent.source}:${agent.id}`}
                icon={agent.icon}
                color={agent.color}
                name={agent.label}
                id={agent.id}
                builtin={agent.builtin}
                workspace={agent.source === "local"}
                description={agent.description}
                meta={agentMeta(agent)}
                onEdit={() => openEditor(agent.id)}
                onDelete={() => setPendingDelete(agent)}
                deleting={remove.isPending}
              />
            ))
          )}
        </DefinitionList>
        <p className="text-2xs/relaxed text-muted-foreground/70">
          Subagents are launched by the delegate tool. Definitions are markdown
          files in <code>~/.lamda/agents</code> (global) or a workspace's{" "}
          <code>.lamda/agents</code> — edits to the files apply live.
        </p>
      </section>

      <DeleteDefinitionDialog
        kind="agent"
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

function AgentEditorPage({ agentParam }: { agentParam: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { ws } = useSearch({ from: "/settings/$section" })
  const { data: workspaces = [] } = useWorkspaces()
  const effectiveWorkspaceId = ws ?? workspaces[0]?.id
  const { data: agents = [], isLoading } = useAgents(effectiveWorkspaceId)
  const { data: catalog = [], isLoading: catalogLoading } =
    useToolCatalog(effectiveWorkspaceId)

  const isNew = agentParam === "new"
  const agent = isNew ? null : (agents.find((a) => a.id === agentParam) ?? null)
  const [form, setForm] = useState<AgentFormState | null>(() =>
    isNew ? emptyForm() : null
  )

  // Editing an existing agent loads async — adopt it into the form once the
  // list arrives.
  useEffect(() => {
    if (!isNew && form === null && agent) setForm(formFromAgent(agent))
  }, [isNew, form, agent])

  // Groups a subagent may pick from: everything except the builtins (the
  // access presets above manage those), keeping only subagent-grantable
  // tools. Empty connected groups are dropped; a still-connecting MCP server
  // stays visible so the user knows its tools are coming.
  const subagentGroups = useMemo(
    () =>
      catalog
        .filter((group) => group.id !== "builtin")
        .map((group) => ({
          ...group,
          tools: group.tools.filter((tool) => tool.subagent),
        }))
        .filter((group) => group.tools.length > 0 || group.connected === false),
    [catalog]
  )

  const { data: modelsData } = useModels()
  const models = useMemo(() => modelsData?.models ?? [], [modelsData])
  const modelGroups = useMemo<ModelGroup>(
    () =>
      Object.entries(
        models.reduce<Record<string, typeof models>>((acc, m) => {
          ;(acc[m.provider] ??= []).push(m)
          return acc
        }, {})
      ),
    [models]
  )

  const formModel = form?.model ?? null
  const selectedModel = useMemo(() => {
    if (!formModel) return null
    const idx = formModel.indexOf("::")
    if (idx === -1) return null
    const provider = formModel.slice(0, idx)
    const id = formModel.slice(idx + 2)
    return models.find((m) => m.provider === provider && m.id === id) ?? null
  }, [formModel, models])

  const goBack = () =>
    void navigate({
      to: "/settings/$section",
      params: { section: "agents" },
      search: { ws },
    })

  const save = useMutation({
    mutationFn: (input: { id: string; body: SaveAgentBody }) =>
      saveAgent(input.id, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all })
      goBack()
    },
    onError: (err) => {
      toast.error("Couldn't save the agent", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  if (!form) {
    return (
      <DefinitionEditorPage backLabel="Agents" onBack={goBack}>
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `No agent named “${agentParam}” here.`}
        </p>
      </DefinitionEditorPage>
    )
  }

  const idInvalid = form.isNew && !!form.id && !KEBAB_ID_PATTERN.test(form.id)

  // The first thing still blocking the save, surfaced in the footer so the
  // disabled button is never a mystery.
  const missingHint = !form.name.trim()
    ? "Name the agent to continue."
    : !form.id
      ? "Give it a file id."
      : idInvalid
        ? "Ids use lowercase letters, digits, and dashes."
        : !form.description.trim()
          ? "Describe when the assistant should pick it."
          : !form.prompt.trim()
            ? "Write the agent's instructions."
            : form.tools.length === 0
              ? "Pick an access level."
              : null

  const canSubmit = missingHint === null && !save.isPending

  const submit = () => {
    if (!canSubmit) return
    save.mutate({
      id: form.id,
      body: {
        scope: form.scope,
        workspaceId: form.scope === "local" ? effectiveWorkspaceId : undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model,
        tools: form.tools,
        color: form.color,
        icon: form.icon.trim() || "bot",
        prompt: form.prompt.trim(),
      },
    })
  }

  return (
    <DefinitionEditorPage backLabel="Agents" onBack={goBack}>
      <DefinitionEditorHeader
        identity={form}
        namePlaceholder="Untitled agent"
        idPlaceholder="agent-id"
        dirGlobal="~/.lamda/agents"
        dirLocal=".lamda/agents"
        idInvalid={idInvalid}
        canScopeLocal={!!effectiveWorkspaceId}
        onPatch={(patch) => setForm({ ...form, ...patch })}
      />

      <div className="flex flex-col gap-6 pt-6">
        <FieldSection
          title="When should the assistant use it?"
          hint="Read by the assistant when routing a task — say what this agent does and when to prefer it."
        >
          <Textarea
            value={form.description}
            rows={2}
            placeholder='e.g. "Reviews a diff for correctness issues. Prefer over general when no changes should be made."'
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </FieldSection>

        <AccessPicker
          tools={form.tools}
          onChange={(tools) => setForm({ ...form, tools })}
        />

        <FieldSection
          title="Workspace tools"
          hint="Memory, MCP, LSP, and git-host tools this agent may also use. “All + future” trusts a whole server, including tools it adds later."
        >
          {catalogLoading ? (
            <span className="text-2xs text-muted-foreground">
              Loading workspace tools…
            </span>
          ) : subagentGroups.length === 0 ? (
            <span className="text-2xs text-muted-foreground">
              No workspace tools are available here.
            </span>
          ) : (
            <ToolPicker
              groups={subagentGroups}
              selected={form.tools}
              onChange={(tools) => setForm({ ...form, tools })}
            />
          )}
        </FieldSection>

        <FieldSection
          title="Model"
          hint="Leave on inherit unless this agent should run on a specific (e.g. cheaper) model."
        >
          <div className="flex items-center gap-1">
            <ModelCombobox
              groups={modelGroups}
              selected={selectedModel}
              onSelect={(compositeKey) =>
                setForm({ ...form, model: compositeKey })
              }
              disabled={models.length === 0}
              placeholder="Inherit conversation model"
              side="bottom"
              triggerClassName="h-7 w-full max-w-none justify-between rounded-md border border-input bg-input/20 px-2 text-xs font-normal [&_svg]:size-3.5 hover:bg-input/30 dark:bg-input/30 dark:hover:bg-input/50"
            />
            {form.model && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                onClick={() => setForm({ ...form, model: null })}
                title="Inherit the conversation's model"
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </FieldSection>

        <FieldSection
          title="Instructions"
          hint="The agent's system prompt. It runs headlessly: it can't ask questions, and only its final message comes back."
        >
          <Textarea
            value={form.prompt}
            rows={10}
            placeholder={
              "You are a meticulous code reviewer. Examine the code you are pointed at and report defects…\n\nEnd with: you run headlessly — write a complete, self-contained report."
            }
            className="font-mono text-xs"
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          />
        </FieldSection>
      </div>

      <DefinitionEditorFooter
        hint={
          missingHint ??
          "Saved as a markdown file — later edits to it apply live."
        }
        submitLabel={
          save.isPending
            ? "Saving…"
            : form.isNew
              ? "Create agent"
              : "Save changes"
        }
        canSubmit={canSubmit}
        onCancel={goBack}
        onSubmit={submit}
      />
    </DefinitionEditorPage>
  )
}
