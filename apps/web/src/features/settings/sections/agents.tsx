import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
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
  ModelCombobox,
  type ModelGroup,
} from "@/features/chat/components/model-combobox"
import {
  colorStyle,
  resolveModeIcon,
} from "@/features/chat/components/mode-combobox"
import { useModels } from "@/features/chat/queries"
import {
  deleteAgent,
  saveAgent,
  type AgentDto,
  type SaveAgentBody,
} from "@/features/workspace/api"
import {
  agentKeys,
  useAgentCustomTools,
  useAgents,
  useWorkspaces,
} from "@/features/workspace/queries"
import { SettingsGroup } from "../components/settings-ui"

/** Tools a subagent may be granted — mirrors SUBAGENT_TOOL_NAMES server-side. */
const AGENT_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
] as const

/** Mirrors MODE_COLORS in pi-sdk; swatch classes spelled out for Tailwind. */
const AGENT_COLORS: { name: string; swatch: string }[] = [
  { name: "sky", swatch: "bg-sky-500" },
  { name: "amber", swatch: "bg-amber-500" },
  { name: "emerald", swatch: "bg-emerald-500" },
  { name: "violet", swatch: "bg-violet-500" },
  { name: "rose", swatch: "bg-rose-500" },
  { name: "blue", swatch: "bg-blue-500" },
  { name: "teal", swatch: "bg-teal-500" },
  { name: "orange", swatch: "bg-orange-500" },
  { name: "fuchsia", swatch: "bg-fuchsia-500" },
  { name: "slate", swatch: "bg-slate-500" },
]

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

interface AgentFormState {
  /** Empty while creating (typed by the user); fixed while editing. */
  id: string
  isNew: boolean
  scope: "global" | "local"
  name: string
  description: string
  model: string | null
  tools: string[]
  customTools: string[] | null
  color: string
  icon: string
  prompt: string
}

function formFromAgent(agent: AgentDto): AgentFormState {
  return {
    id: agent.id,
    isNew: false,
    // Built-ins resolve as source "global" once seeded; editing one writes its
    // resolved file back.
    scope: agent.source === "local" ? "local" : "global",
    name: agent.label,
    description: agent.description,
    model: agent.model,
    tools: [...agent.tools],
    customTools: agent.customTools ? [...agent.customTools] : null,
    color: agent.color,
    icon: agent.icon,
    prompt: agent.prompt,
  }
}

function emptyForm(): AgentFormState {
  return {
    id: "",
    isNew: true,
    scope: "global",
    name: "",
    description: "",
    model: null,
    tools: ["read", "grep", "find", "ls"],
    customTools: null,
    color: "violet",
    icon: "bot",
    prompt: "",
  }
}

function AgentRow({
  agent,
  onEdit,
  onDelete,
  deleting,
}: {
  agent: AgentDto
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const visual = useMemo(
    () => ({ Icon: resolveModeIcon(agent.icon) }),
    [agent.icon]
  )
  const style = colorStyle(agent.color)
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          style.softBg,
          style.iconAccent
        )}
      >
        <visual.Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm leading-snug">{agent.label}</span>
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
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {agent.description || "No description"}
        </span>
        <span className="text-3xs text-muted-foreground/70">
          {agent.model ?? "Inherits conversation model"} ·{" "}
          {agent.tools.join(", ")}
          {" · "}
          {agent.customTools === null
            ? "all custom tools"
            : agent.customTools.length > 0
              ? `${agent.customTools.length} custom tools`
              : "no custom tools"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={onEdit}
          title="Edit agent"
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          title={
            agent.builtin
              ? "Reset to the built-in default (deletes the file)"
              : "Delete agent"
          }
        >
          {agent.builtin ? (
            <RotateCcwIcon className="size-3.5" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

export function AgentsSection() {
  const queryClient = useQueryClient()
  const { data: workspaces = [] } = useWorkspaces()
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined)
  const effectiveWorkspaceId = workspaceId ?? workspaces[0]?.id
  const { data: agents = [], isLoading } = useAgents(effectiveWorkspaceId)
  const { data: customTools = [], isLoading: customToolsLoading } =
    useAgentCustomTools(effectiveWorkspaceId)
  const [form, setForm] = useState<AgentFormState | null>(null)

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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: agentKeys.all })

  const save = useMutation({
    mutationFn: (input: { id: string; body: SaveAgentBody }) =>
      saveAgent(input.id, input.body),
    onSuccess: () => {
      void invalidate()
      setForm(null)
    },
    onError: (err) => {
      toast.error("Couldn't save the agent", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  const remove = useMutation({
    mutationFn: (input: { id: string; scope: "global" | "local" }) =>
      deleteAgent(input.id, input.scope, effectiveWorkspaceId),
    onSuccess: () => void invalidate(),
    onError: (err) => {
      toast.error("Couldn't delete the agent", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    },
  })

  const formIconName = form?.icon.trim() || "bot"
  const formVisual = useMemo(
    () => ({ Icon: resolveModeIcon(formIconName) }),
    [formIconName]
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

  const idInvalid =
    !!form && form.isNew && !!form.id && !AGENT_ID_PATTERN.test(form.id)
  const canSubmit =
    !!form &&
    !!form.id &&
    !idInvalid &&
    !!form.name.trim() &&
    !!form.description.trim() &&
    !!form.prompt.trim() &&
    form.tools.length > 0 &&
    !customToolsLoading &&
    !save.isPending

  const selectedCustomTools = useMemo(() => {
    if (!form) return []
    return form.customTools ?? customTools.map((tool) => tool.name)
  }, [customTools, form])

  const selectedCustomToolSet = useMemo(
    () => new Set(selectedCustomTools),
    [selectedCustomTools]
  )

  const submit = () => {
    if (!form || !canSubmit) return
    save.mutate({
      id: form.id,
      body: {
        scope: form.scope,
        workspaceId: form.scope === "local" ? effectiveWorkspaceId : undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model,
        tools: form.tools,
        customTools: selectedCustomTools,
        color: form.color,
        icon: form.icon.trim() || "bot",
        prompt: form.prompt.trim(),
      },
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title="Subagents"
        description="Agents the assistant can launch with the task tool. Definitions are markdown files in ~/.lamda/agents (global) or a workspace's .lamda/agents — edits there take effect live."
        action={
          <div className="flex items-center gap-2">
            {workspaces.length > 1 && (
              <Select
                value={effectiveWorkspaceId ?? ""}
                onValueChange={(v) => setWorkspaceId(v)}
              >
                <SelectTrigger size="sm" className="h-7 w-44 text-xs">
                  {/* Base UI's Value renders the raw value (the workspace id)
                      unless given children — resolve it to the name. */}
                  <SelectValue>
                    {workspaces.find((ws) => ws.id === effectiveWorkspaceId)
                      ?.name ?? "Workspace"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => setForm(emptyForm())}>
              <PlusIcon data-icon="inline-start" />
              New agent
            </Button>
          </div>
        }
      >
        {isLoading && agents.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">Loading agents…</p>
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={`${agent.source}:${agent.id}`}
              agent={agent}
              onEdit={() => setForm(formFromAgent(agent))}
              onDelete={() =>
                remove.mutate({
                  id: agent.id,
                  scope: agent.source === "local" ? "local" : "global",
                })
              }
              deleting={remove.isPending}
            />
          ))
        )}
      </SettingsGroup>

      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {form.isNew ? "New agent" : `Edit ${form.name || form.id}`}
                </DialogTitle>
                <DialogDescription>
                  {form.isNew
                    ? "Define a subagent the assistant can delegate tasks to."
                    : "Changes are written back to the agent's markdown file."}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-xs font-medium">
                    Id
                    <Input
                      value={form.id}
                      disabled={!form.isNew}
                      placeholder="code-reviewer"
                      aria-invalid={idInvalid}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          id: e.target.value.toLowerCase(),
                        })
                      }
                    />
                    {idInvalid && (
                      <span className="text-3xs font-normal text-destructive">
                        Lowercase letters, digits, and dashes only.
                      </span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-medium">
                    Name
                    <Input
                      value={form.name}
                      placeholder="Code Reviewer"
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 text-xs font-medium">
                  Description
                  <Input
                    value={form.description}
                    placeholder="When should the assistant pick this agent?"
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 text-xs font-medium">
                    Scope
                    <Select
                      value={form.scope}
                      onValueChange={(v) =>
                        setForm({ ...form, scope: v as "global" | "local" })
                      }
                      disabled={!form.isNew}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {form.scope === "local"
                            ? "This workspace (.lamda/agents)"
                            : "Global (~/.lamda/agents)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">
                          Global (~/.lamda/agents)
                        </SelectItem>
                        {effectiveWorkspaceId && (
                          <SelectItem value="local">
                            This workspace (.lamda/agents)
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs font-medium">
                    Model
                    <div className="flex items-center gap-1">
                      {form.model && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          onClick={() => setForm({ ...form, model: null })}
                          title="Inherit the conversation's model"
                        >
                          <RotateCcwIcon className="size-3.5" />
                        </Button>
                      )}
                      <ModelCombobox
                        groups={modelGroups}
                        selected={selectedModel}
                        onSelect={(compositeKey) =>
                          setForm({ ...form, model: compositeKey })
                        }
                        disabled={models.length === 0}
                        placeholder="Inherit conversation model"
                        side="bottom"
                        // Match the SelectTrigger chrome of the Scope field
                        // beside it (the default trigger is a ghost button).
                        triggerClassName="h-7 w-full max-w-none justify-between rounded-md border border-input bg-input/20 px-2 text-xs font-normal [&_svg]:size-3.5 hover:bg-input/30 dark:bg-input/30 dark:hover:bg-input/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs font-medium">
                  Tools
                  <div className="flex flex-wrap gap-1.5">
                    {AGENT_TOOLS.map((tool) => {
                      const active = form.tools.includes(tool)
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
                            setForm({
                              ...form,
                              tools: active
                                ? form.tools.filter((t) => t !== tool)
                                : [...form.tools, tool],
                            })
                          }
                        >
                          {tool}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs font-medium">
                  <div className="flex items-center justify-between gap-3">
                    <span>Custom tools</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        onClick={() =>
                          setForm({
                            ...form,
                            customTools: customTools.map((tool) => tool.name),
                          })
                        }
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        onClick={() => setForm({ ...form, customTools: [] })}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {customToolsLoading ? (
                      <span className="text-2xs font-normal text-muted-foreground">
                        Loading custom tools…
                      </span>
                    ) : customTools.length === 0 ? (
                      <span className="text-2xs font-normal text-muted-foreground">
                        No custom tools are available for this workspace.
                      </span>
                    ) : (
                      customTools.map((tool) => {
                        const active = selectedCustomToolSet.has(tool.name)
                        return (
                          <button
                            key={tool.name}
                            type="button"
                            title={tool.description}
                            className={cn(
                              "rounded-md border px-2 py-1 text-left font-mono text-2xs transition-colors",
                              active
                                ? "border-primary/40 bg-primary/10 text-foreground"
                                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                            )}
                            onClick={() =>
                              setForm({
                                ...form,
                                customTools: active
                                  ? selectedCustomTools.filter(
                                      (name) => name !== tool.name
                                    )
                                  : [...selectedCustomTools, tool.name],
                              })
                            }
                          >
                            {tool.name}
                          </button>
                        )
                      })
                    )}
                  </div>
                  <span className="text-3xs font-normal text-muted-foreground">
                    Select memory, MCP, LSP, GitHub, or other workspace tools
                    this subagent may use.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 text-xs font-medium">
                    Color
                    <div className="flex flex-wrap gap-1.5">
                      {AGENT_COLORS.map(({ name, swatch }) => (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          className={cn(
                            "size-5 rounded-full transition-transform",
                            swatch,
                            form.color === name
                              ? "scale-110 ring-2 ring-foreground/60 ring-offset-1 ring-offset-background"
                              : "opacity-60 hover:opacity-100"
                          )}
                          onClick={() => setForm({ ...form, color: name })}
                        />
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-xs font-medium">
                    Icon (Lucide name)
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          colorStyle(form.color).softBg,
                          colorStyle(form.color).iconAccent
                        )}
                      >
                        <formVisual.Icon className="size-4" />
                      </span>
                      <Input
                        value={form.icon}
                        placeholder="bot"
                        onChange={(e) =>
                          setForm({ ...form, icon: e.target.value })
                        }
                      />
                    </div>
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 text-xs font-medium">
                  System prompt
                  <Textarea
                    value={form.prompt}
                    rows={8}
                    placeholder="You are a meticulous code reviewer…"
                    className="font-mono text-xs"
                    onChange={(e) =>
                      setForm({ ...form, prompt: e.target.value })
                    }
                  />
                  <span className="text-3xs font-normal text-muted-foreground">
                    Subagents run headlessly: they can't ask the user questions,
                    and only their final message is returned to the assistant.
                  </span>
                </label>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={!canSubmit}>
                  {save.isPending
                    ? "Saving…"
                    : form.isNew
                      ? "Create agent"
                      : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
