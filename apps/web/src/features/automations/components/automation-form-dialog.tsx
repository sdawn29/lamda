import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, GitBranch } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { SectionLabel } from "@/shared/ui/section-label"
import { FieldError } from "@/shared/ui/field"
import { cn } from "@/shared/lib/utils"
import {
  ModelCombobox,
  type ModelGroup,
} from "@/features/chat/components/model-combobox"
import { useModels } from "@/features/chat/queries"
import { useModes } from "@/features/workspace/queries"
import {
  buildCron,
  describeCron,
  parseCron,
  WEEKDAY_OPTIONS,
  type SchedulePreset,
} from "../schedule"
import { generateAutomationName } from "../naming"
import type {
  Automation,
  AutomationApprovalMode,
  AutomationInput,
} from "../types"

interface AutomationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  automation?: Automation | null
  workspaces: { id: string; name: string }[]
  onSave: (input: AutomationInput, workspaceId: string) => void
}

const APPROVAL_OPTIONS: { value: AutomationApprovalMode; label: string }[] = [
  { value: "all_allowed", label: "Auto-approve everything" },
  { value: "edits_allowed", label: "Auto-approve edits only" },
  { value: "ask", label: "Ask before each action" },
]

const PRESETS: { value: SchedulePreset; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
]

const pad2 = (n: number) => String(n).padStart(2, "0")
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: pad2(h),
}))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({
  value: String(m),
  label: pad2(m),
}))

export function AutomationFormDialog({
  open,
  onOpenChange,
  automation,
  workspaces,
  onSave,
}: AutomationFormDialogProps) {
  const { data: modelsData } = useModels()
  const models = useMemo(() => modelsData?.models ?? [], [modelsData])

  const [workspaceId, setWorkspaceId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [preset, setPreset] = useState<SchedulePreset>("daily")
  const [minute, setMinute] = useState(0)
  const [hour, setHour] = useState(9)
  const [weekday, setWeekday] = useState(1)
  const [custom, setCustom] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [mode, setMode] = useState("agent")
  const [approvalMode, setApprovalMode] =
    useState<AutomationApprovalMode>("all_allowed")
  const [useWorktree, setUseWorktree] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [errors, setErrors] = useState<{ prompt?: string }>({})

  // All modes available to the selected workspace: built-ins plus custom modes
  // from global (~/.lamda/modes) and workspace-local (<path>/.lamda/modes) files.
  const { data: modeDtos } = useModes(workspaceId || undefined)
  const modeOptions = (modeDtos ?? []).map((m) => ({
    value: m.id,
    label: m.label,
  }))

  const sync = () => {
    setWorkspaceId(automation?.workspaceId ?? workspaces[0]?.id ?? "")
    setPrompt(automation?.prompt ?? "")
    const c = parseCron(automation?.cron ?? "0 9 * * *")
    setPreset(c.preset)
    setMinute(c.minute)
    setHour(c.hour)
    setWeekday(c.weekday)
    setCustom(c.custom)
    setModelId(automation?.modelId ?? null)
    setMode(automation?.mode ?? "agent")
    setApprovalMode(automation?.approvalMode ?? "all_allowed")
    setUseWorktree(automation?.useWorktree ?? true)
    setEnabled(automation?.enabled ?? true)
    setErrors({})
  }

  useEffect(() => {
    if (open) sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, automation])

  const cron = buildCron(preset, { minute, hour, weekday, custom })

  const grouped = useMemo<ModelGroup>(
    () =>
      Object.entries(
        models.reduce<Record<string, typeof models>>((acc, m) => {
          ;(acc[m.provider] ??= []).push(m)
          return acc
        }, {}),
      ),
    [models],
  )

  const selectedModel = useMemo(() => {
    if (!modelId) return null
    const idx = modelId.indexOf("::")
    if (idx === -1) return null
    const provider = modelId.slice(0, idx)
    const id = modelId.slice(idx + 2)
    return models.find((m) => m.provider === provider && m.id === id) ?? null
  }, [modelId, models])

  const handleSave = () => {
    const next: { prompt?: string } = {}
    if (!prompt.trim()) next.prompt = "Prompt is required"
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSave(
      {
        name: generateAutomationName(prompt),
        prompt: prompt.trim(),
        cron,
        modelId,
        mode,
        approvalMode,
        useWorktree,
        enabled,
      },
      workspaceId,
    )
    onOpenChange(false)
  }

  const onComposerKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border/70 px-6 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <CalendarClock className="size-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-sm font-semibold">
              {automation ? "Edit automation" : "New automation"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Run a prompt through the agent on a schedule.
            </p>
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-muted/30 py-1 pr-1.5 pl-3">
            <span className="text-xs font-medium text-foreground/80">
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
        </DialogHeader>

        {/* Body — task on the left, configuration on the right */}
        <div
          className="grid grid-cols-1 items-stretch overflow-y-auto md:grid-cols-[1fr_1.15fr] md:divide-x md:divide-border/50"
          onKeyDown={onComposerKey}
        >
          {/* Left: what to do */}
          <div className="flex flex-col gap-4 px-6 py-5">
            {workspaces.length > 1 && (
              <Field label="Workspace">
                {automation ? (
                  <p className="text-xs text-muted-foreground">
                    {workspaces.find((w) => w.id === workspaceId)?.name ??
                      "Unknown workspace"}
                  </p>
                ) : (
                  <FieldSelect
                    value={workspaceId}
                    onValueChange={setWorkspaceId}
                    options={workspaces.map((w) => ({
                      value: w.id,
                      label: w.name,
                    }))}
                  />
                )}
              </Field>
            )}

            <Field
              label="Prompt"
              htmlFor="auto-prompt"
              required
              className="flex-1"
              hint="Sent to the agent on every run. The name is generated from this."
            >
              <Textarea
                id="auto-prompt"
                autoFocus
                placeholder="Check for outdated dependencies, update the safe ones, run the build, and open a PR."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                aria-invalid={!!errors.prompt}
                className="h-full min-h-[180px] flex-1 resize-none text-xs leading-relaxed"
              />
              {errors.prompt && <FieldError>{errors.prompt}</FieldError>}
            </Field>
          </div>

          {/* Right: how & when */}
          <div className="flex flex-col gap-3.5 px-6 py-5">
            {/* Schedule */}
            <Card title="Schedule">
              <Segmented
                value={preset}
                onChange={(v) => setPreset(v as SchedulePreset)}
                options={PRESETS}
              />

              {preset === "custom" ? (
                <div className="flex flex-col gap-1.5">
                  <Input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="0 2 * * *"
                    className="h-9 text-center font-mono text-sm tracking-wide"
                  />
                  <div className="grid grid-cols-5 px-1 text-center text-3xs text-muted-foreground/45">
                    <span>min</span>
                    <span>hour</span>
                    <span>day</span>
                    <span>month</span>
                    <span>weekday</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Every</span>
                  {preset === "weekly" && (
                    <FieldSelect
                      value={String(weekday)}
                      onValueChange={(v) => setWeekday(Number(v))}
                      options={WEEKDAY_OPTIONS.map((d) => ({
                        value: String(d.value),
                        label: d.label,
                      }))}
                      triggerClassName="w-auto min-w-[7rem]"
                    />
                  )}
                  {preset === "hourly" ? (
                    <>
                      <span>hour at minute</span>
                      <FieldSelect
                        value={String(minute)}
                        onValueChange={(v) => setMinute(Number(v))}
                        options={MINUTE_OPTIONS}
                        triggerClassName="w-auto min-w-[3.75rem] tabular-nums"
                      />
                    </>
                  ) : (
                    <>
                      <span>{preset === "weekly" ? "at" : "day at"}</span>
                      <div className="flex items-center gap-1">
                        <FieldSelect
                          value={String(hour)}
                          onValueChange={(v) => setHour(Number(v))}
                          options={HOUR_OPTIONS}
                          triggerClassName="w-auto min-w-[3.75rem] tabular-nums"
                        />
                        <span className="text-muted-foreground/40">:</span>
                        <FieldSelect
                          value={String(minute)}
                          onValueChange={(v) => setMinute(Number(v))}
                          options={MINUTE_OPTIONS}
                          triggerClassName="w-auto min-w-[3.75rem] tabular-nums"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2.5 rounded-lg bg-primary/5 px-3 py-2 ring-1 ring-inset ring-primary/10">
                <CalendarClock className="size-3.5 shrink-0 text-primary/70" />
                <span className="text-xs font-medium">{describeCron(cron)}</span>
                <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground/50">
                  {cron}
                </span>
              </div>
            </Card>

            {/* Agent */}
            <Card title="Agent">
              <Field label="Model">
                <ModelCombobox
                  groups={grouped}
                  selected={selectedModel}
                  onSelect={(key) => setModelId(key)}
                  disabled={models.length === 0}
                  placeholder="Default model"
                  side="bottom"
                  contentClassName="w-72"
                  triggerClassName="h-8 w-full max-w-none justify-between rounded-md border border-input bg-input/20 px-2.5 text-xs font-normal [&_svg]:size-3.5 hover:bg-input/30 dark:bg-input/30 dark:hover:bg-input/50"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Mode">
                  <FieldSelect
                    value={mode}
                    onValueChange={setMode}
                    options={modeOptions}
                  />
                </Field>
                <Field label="Permissions">
                  <FieldSelect
                    value={approvalMode}
                    onValueChange={(v) =>
                      setApprovalMode(v as AutomationApprovalMode)
                    }
                    options={APPROVAL_OPTIONS}
                  />
                </Field>
              </div>

              {approvalMode === "ask" && (
                <Callout>
                  No one is present during a scheduled run, so “Ask” will block on
                  the first approval. Choose an auto-approve mode.
                </Callout>
              )}
            </Card>

            {/* Options */}
            <Card title="Options">
              <ToggleRow
                icon={GitBranch}
                label="Isolated git worktree"
                hint="Edits land on a dedicated branch, not your working tree."
                checked={useWorktree}
                onCheckedChange={setUseWorktree}
              />
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border/70 bg-muted/20 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave}>
            {automation ? "Save changes" : "Create automation"}
            <kbd className="rounded bg-primary-foreground/15 px-1 font-sans text-3xs text-primary-foreground/70">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/15 p-3.5">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline gap-2">
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-foreground/90"
        >
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        {hint && (
          <span className="text-3xs text-muted-foreground/50">{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-background/60 p-1 ring-1 ring-inset ring-border/60">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FieldSelect({
  value,
  onValueChange,
  options,
  triggerClassName,
}: {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  triggerClassName?: string
}) {
  const selected = options.find((o) => o.value === value)
  return (
    <Select value={value} onValueChange={(v) => v != null && onValueChange(v)}>
      <SelectTrigger className={cn("h-8 w-full text-xs", triggerClassName)}>
        <SelectValue>{selected?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-3xs leading-relaxed text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          checked
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground/60",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-3xs text-muted-foreground/60">{hint}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
