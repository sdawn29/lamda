import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  EyeIcon,
  FilePenLineIcon,
  Globe2Icon,
  PlusIcon,
  RotateCcwIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"
import {
  ModelCombobox,
  type ModelGroup,
} from "@/features/chat/components/model-combobox"
import { useModels } from "@/features/chat/queries"
import {
  deleteAgent,
  saveAgent,
  saveRawAgentDefinition,
  type AgentDto,
  type SaveAgentBody,
  type SaveRawDefinitionBody,
  type WorkspaceDto,
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
  DeleteDefinitionDialog,
  FieldSection,
  KEBAB_ID_PATTERN,
} from "../components/editor-ui"
import {
  parseRawAgentDefinition,
  RawDefinitionEditor,
  RawEditorToggle,
  serializeRawAgentDefinition,
} from "../components/raw-definition-editor"
import { ToolPicker } from "../components/tool-picker"
import {
  colorStyle,
  resolveModeIcon,
} from "@/features/chat/components/mode-combobox"

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
    presetLabel ??
    `${builtinCount} builtin tool${builtinCount === 1 ? "" : "s"}`
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
          <BotIcon className="size-3.5" />
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
            {count} subagent{count === 1 ? "" : "s"}
          </span>
        )}
        <ArrowRightIcon className="size-3.5 text-muted-foreground/40" />
      </span>
    </button>
  )
}

function AgentCreateLocationSelect({
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
            <BotIcon className="size-3.5 text-muted-foreground" />
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AgentCard({
  agent,
  meta,
  onOpen,
  onDelete,
  deleting,
}: {
  agent: AgentDto
  meta: string
  onOpen: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const visual = useMemo(
    () => ({ Icon: resolveModeIcon(agent.icon) }),
    [agent.icon]
  )
  const style = colorStyle(agent.color)
  const DeleteIcon = agent.builtin ? RotateCcwIcon : Trash2Icon
  return (
    <div className="group relative rounded-2xl border border-border/70 bg-card/70 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md">
      <button
        type="button"
        aria-label={`Edit ${agent.label}`}
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
              {agent.label}
            </span>
            <code className="shrink-0 rounded bg-muted px-1 py-px font-mono text-3xs text-muted-foreground">
              {agent.id}
            </code>
            {agent.builtin && (
              <Badge variant="secondary" className="h-4 px-1.5 text-3xs">
                built-in
              </Badge>
            )}
            {agent.source === "local" && (
              <Badge variant="outline" className="h-4 px-1.5 text-3xs">
                workspace
              </Badge>
            )}
          </span>
          <span className="line-clamp-2 text-xs/relaxed text-muted-foreground">
            {agent.description || "No description"}
          </span>
          <span className="text-3xs text-muted-foreground/70">{meta}</span>
        </span>
        <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-9 bottom-2.5 z-10 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        onClick={onDelete}
        disabled={deleting}
        title={agent.builtin ? "Reset to the built-in default" : "Delete"}
      >
        <DeleteIcon className="size-3.5" />
      </Button>
    </div>
  )
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
  const activeWorkspace = workspaces.find((w) => w.id === ws)
  const isWorkspacePage = !!ws
  const effectiveWorkspaceId = ws
  const { data: agents = [], isLoading } = useAgents(effectiveWorkspaceId)
  const visibleAgents = isWorkspacePage
    ? agents.filter((agent) => agent.source === "local")
    : agents.filter((agent) => agent.source !== "local")
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
      search: ws ? { agent: agentId, ws } : { agent: agentId },
    })

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm">
              <BotIcon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-medium tracking-tight">
                {isWorkspacePage
                  ? `${activeWorkspace?.name ?? "Workspace"} agents`
                  : "Global agents"}
              </h2>
              <p className="max-w-2xl text-xs/relaxed text-muted-foreground">
                {isWorkspacePage
                  ? "Workspace-local subagents live in this project's .lamda/agents folder."
                  : "Global subagents are available in every workspace. Choose a workspace below to manage local agents."}
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
                    params: { section: "agents" },
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
              New agent
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground">
            {isLoading && visibleAgents.length === 0
              ? "Loading..."
              : `${visibleAgents.length} subagent${visibleAgents.length === 1 ? "" : "s"}`}
          </span>
          <span className="truncate text-3xs text-muted-foreground/70">
            {isWorkspacePage ? ".lamda/agents" : "~/.lamda/agents"}
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
              Open a workspace to manage its local agent files.
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
                    params: { section: "agents" },
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
          {isLoading && visibleAgents.length === 0 ? (
            <>
              <DefinitionCardSkeleton />
              <DefinitionCardSkeleton />
              <DefinitionCardSkeleton />
            </>
          ) : visibleAgents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 px-6 py-9 text-center">
              <BotIcon className="size-5 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {isWorkspacePage
                    ? "No local subagents yet"
                    : "No global subagents yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Create one with New agent.
                </p>
              </div>
            </div>
          ) : (
            visibleAgents.map((agent) => (
              <AgentCard
                key={`${agent.source}:${agent.id}`}
                meta={agentMeta(agent)}
                agent={agent}
                onOpen={() => openEditor(agent.id)}
                onDelete={() => setPendingDelete(agent)}
                deleting={remove.isPending}
              />
            ))
          )}
        </div>
        <p className="text-2xs/relaxed text-muted-foreground/70">
          {isWorkspacePage
            ? "These subagents are scoped to the selected workspace and stored in its .lamda/agents folder."
            : "Global subagents are launched by the delegate tool and stored in ~/.lamda/agents."}
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
    isNew ? { ...emptyForm(), scope: ws ? "local" : "global" } : null
  )
  const [editorMode, setEditorMode] = useState<"form" | "raw">("form")
  const [rawContent, setRawContent] = useState("")
  const rawAgent = useMemo(
    () => parseRawAgentDefinition(rawContent),
    [rawContent]
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
    mutationFn: (
      input:
        | { id: string; body: SaveAgentBody }
        | { id: string; raw: SaveRawDefinitionBody }
    ) =>
      "raw" in input
        ? saveRawAgentDefinition(input.id, input.raw)
        : saveAgent(input.id, input.body),
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
  const formMissingHint = !form.name.trim()
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
  const rawMissingHint =
    rawAgent.ok === false
      ? (rawAgent.diagnostics.find((d) => d.severity === "error")?.message ??
        "Fix the raw definition before saving.")
      : null
  const missingHint = editorMode === "raw" ? rawMissingHint : formMissingHint

  const canSubmit = missingHint === null && !save.isPending

  const submit = () => {
    if (!canSubmit) return
    if (editorMode === "raw") {
      if (!rawAgent.ok) return
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
        model: form.model,
        tools: form.tools,
        color: form.color,
        icon: form.icon.trim() || "bot",
        prompt: form.prompt.trim(),
      },
    })
  }

  const switchEditorMode = (next: "form" | "raw") => {
    if (next === editorMode) return
    if (next === "raw") {
      setRawContent(
        serializeRawAgentDefinition({
          name: form.name,
          description: form.description,
          model: form.model,
          tools: form.tools,
          color: form.color,
          icon: form.icon,
          prompt: form.prompt,
        })
      )
      setEditorMode("raw")
      return
    }

    if (!rawAgent.ok) {
      toast.error("Fix the raw definition before returning to the form")
      return
    }
    setForm({ ...form, ...rawAgent.value })
    setEditorMode("form")
  }

  const changeCreateLocation = (next: {
    scope: "global" | "local"
    workspaceId?: string
  }) => {
    setForm({ ...form, scope: next.scope })
    void navigate({
      to: "/settings/$section",
      params: { section: "agents" },
      search:
        next.scope === "local" && next.workspaceId
          ? { agent: agentParam, ws: next.workspaceId }
          : { agent: agentParam },
      replace: true,
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
        scopeControl={
          form.isNew ? (
            <AgentCreateLocationSelect
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
            title="When should the assistant use it?"
            hint="Read by the assistant when routing a task — say what this agent does and when to prefer it."
          >
            <Textarea
              value={form.description}
              rows={2}
              placeholder='e.g. "Reviews a diff for correctness issues. Prefer over general when no changes should be made."'
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
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
      ) : (
        <div className="pt-3">
          <RawDefinitionEditor
            value={rawContent}
            diagnostics={rawAgent.diagnostics}
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
