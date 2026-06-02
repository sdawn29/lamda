import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Plus,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle,
  XCircle,
  Terminal,
  ChevronDown,
  FileJson,
  Settings2,
  Wrench,
  Play,
  Square,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react"

import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { cn } from "@/shared/lib/utils"
import type { McpServerConfig, ServerFormState } from "../types"
import { createEmptyServerForm, formStateToConfig, configToFormState } from "../types"
import { useMcpSettings } from "../queries"
import { useSaveMcpSettings, useTestMcpConnection, useStartMcpServer, useStopMcpServer } from "../mutations"

// ── Environment Variable Row ──────────────────────────────────────────────────

interface EnvVarRowProps {
  envVar: { key: string; value: string }
  index: number
  onChange: (field: "key" | "value", value: string) => void
  onRemove: () => void
}

function EnvVarRow({ envVar, index, onChange, onRemove }: EnvVarRowProps) {
  const isSecret =
    envVar.key.toLowerCase().includes("token") ||
    envVar.key.toLowerCase().includes("key") ||
    envVar.key.toLowerCase().includes("secret")

  return (
    <div className="group flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
        {index + 1}
      </span>
      <Input
        value={envVar.key}
        onChange={(e) => onChange("key", e.target.value)}
        placeholder="VARIABLE_NAME"
        className="h-6 flex-1 font-mono text-xs"
      />
      <span className="shrink-0 select-none text-xs text-muted-foreground">=</span>
      <Input
        value={envVar.value}
        onChange={(e) => onChange("value", e.target.value)}
        placeholder="value"
        className="h-6 flex-1 text-xs"
        type={isSecret ? "password" : "text"}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 />
        <span className="sr-only">Remove variable</span>
      </Button>
    </div>
  )
}

// ── JSON Config Import ────────────────────────────────────────────────────────

interface JsonImportProps {
  onImport: (config: McpServerConfig) => void
}

function JsonImport({ onImport }: JsonImportProps) {
  const [jsonText, setJsonText] = useState("")
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState(false)

  function handleImport() {
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed.name && parsed.command) {
        onImport(parsed as McpServerConfig)
        setJsonText("")
        setExpanded(false)
        setError("")
      } else {
        setError("Config must include 'name' and 'command' fields")
      }
    } catch {
      setError("Invalid JSON format")
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium transition-colors",
          expanded
            ? "bg-muted/50 text-foreground"
            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-2">
          <FileJson className="h-3.5 w-3.5" />
          Import from JSON config
        </div>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          <Textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setError("")
            }}
            placeholder={'{\n  "name": "my-server",\n  "command": "npx",\n  "args": ["-y", "package-name"]\n}'}
            className="min-h-[96px] resize-none font-mono text-xs"
            rows={5}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleImport} disabled={!jsonText.trim()}>
              Import
            </Button>
            {jsonText && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setJsonText("")
                  setError("")
                }}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Server Form Fields (shared body) ──────────────────────────────────────────

interface ServerFormFieldsProps {
  /** The existing server when editing; null when adding a new one */
  server: McpServerConfig | null
  formState: ServerFormState
  setFormState: (state: ServerFormState) => void
  formErrors: Record<string, string>
  setFormErrors: (errors: Record<string, string>) => void
}

function ServerFormFields({
  server,
  formState,
  setFormState,
  formErrors,
  setFormErrors,
}: ServerFormFieldsProps) {
  const testConnection = useTestMcpConnection()
  const [showAdvanced, setShowAdvanced] = useState(() => formState.envVars.length > 0)

  function updateField<K extends keyof ServerFormState>(key: K, value: ServerFormState[K]) {
    setFormState({ ...formState, [key]: value })
    const next = { ...formErrors }
    delete (next as Record<string, string>)[key as string]
    setFormErrors(next)
  }

  function addEnvVar() {
    setFormState({
      ...formState,
      envVars: [...formState.envVars, { key: "", value: "" }],
    })
    setShowAdvanced(true)
  }

  function updateEnvVar(index: number, field: "key" | "value", value: string) {
    setFormState({
      ...formState,
      envVars: formState.envVars.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    })
  }

  function removeEnvVar(index: number) {
    setFormState({
      ...formState,
      envVars: formState.envVars.filter((_, i) => i !== index),
    })
  }

  const canTest = formState.name.trim() && formState.command.trim()

  return (
    <div className="space-y-5">
      {/* JSON Quick Import */}
      <JsonImport onImport={(config) => setFormState(configToFormState(config))} />

      {/* Core configuration */}
      <FieldGroup>
        {/* Name + Command in a 2-col grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={formErrors.name ? true : undefined}>
            <FieldLabel htmlFor="server-name">
              Name <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldDescription>Unique identifier for this server.</FieldDescription>
            <Input
              id="server-name"
              value={formState.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="my-mcp-server"
              disabled={!!server}
              autoFocus
              className="mt-1.5"
            />
            {formErrors.name && <FieldError>{formErrors.name}</FieldError>}
          </Field>

          <Field data-invalid={formErrors.command ? true : undefined}>
            <FieldLabel htmlFor="server-command">
              Command <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldDescription>Executable to run — e.g. npx, uvx.</FieldDescription>
            <Input
              id="server-command"
              value={formState.command}
              onChange={(e) => updateField("command", e.target.value)}
              placeholder="npx"
              className="mt-1.5 font-mono"
            />
            {formErrors.command && <FieldError>{formErrors.command}</FieldError>}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="server-args">Arguments</FieldLabel>
          <FieldDescription>
            Space-separated arguments passed to the command.
          </FieldDescription>
          <Input
            id="server-args"
            value={formState.args}
            onChange={(e) => updateField("args", e.target.value)}
            placeholder="-y @modelcontextprotocol/server-filesystem ./path"
            className="mt-1.5 font-mono text-xs"
          />
        </Field>

        {/* Command preview — shown when command is filled */}
        {formState.command && (
          <div className="rounded-md bg-muted/50 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </p>
            <code className="break-all font-mono text-xs">
              {formState.command}
              {formState.args && ` ${formState.args}`}
            </code>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="server-description">Description</FieldLabel>
          <FieldDescription>Short summary of what this server provides.</FieldDescription>
          <Input
            id="server-description"
            value={formState.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="File system access with read/write capabilities"
            className="mt-1.5"
          />
        </Field>
      </FieldGroup>

      {/* Advanced Options */}
      <div className="overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            "flex w-full items-center justify-between px-4 py-3 text-xs font-medium transition-colors hover:bg-muted/50",
            showAdvanced
              ? "bg-muted/50 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            Advanced Options
            {formState.envVars.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                {formState.envVars.length}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              showAdvanced && "rotate-180"
            )}
          />
        </button>

        {showAdvanced && (
          <div className="space-y-5 border-t p-4">
            <Field>
              <FieldLabel htmlFor="server-cwd">Working Directory</FieldLabel>
              <FieldDescription>
                Directory where the server process is launched.
              </FieldDescription>
              <Input
                id="server-cwd"
                value={formState.cwd}
                onChange={(e) => updateField("cwd", e.target.value)}
                placeholder="/path/to/directory"
                className="mt-1.5 font-mono text-xs"
              />
            </Field>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Environment Variables</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    API keys, tokens, and secrets passed to the server process.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addEnvVar}
                  className="shrink-0"
                >
                  <Plus />
                  Add Variable
                </Button>
              </div>

              {formState.envVars.length > 0 ? (
                <div className="space-y-1.5">
                  {formState.envVars.map((envVar, index) => (
                    <EnvVarRow
                      key={index}
                      envVar={envVar}
                      index={index}
                      onChange={(field, value) => updateEnvVar(index, field, value)}
                      onRemove={() => removeEnvVar(index)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-4 py-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    No environment variables configured
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Test Connection */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between gap-4 bg-muted/20 px-4 py-3">
          <div>
            <p className="text-xs font-medium">Test Connection</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Verify the server starts and lists its tools.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testConnection.mutate(formStateToConfig(formState))}
            disabled={testConnection.isPending || !canTest}
            className="shrink-0"
          >
            {testConnection.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Terminal />
                Run Test
              </>
            )}
          </Button>
        </div>

        {testConnection.data && (
          <div className="border-t">
            <Alert
              variant={testConnection.data.success ? "default" : "destructive"}
              className="animate-in fade-in-50 rounded-none rounded-b-lg border-0"
            >
              {testConnection.data.success ? (
                <CheckCircle className="text-green-500" />
              ) : (
                <XCircle />
              )}
              <AlertDescription>
                {testConnection.data.success ? (
                  <div>
                    <p className="font-medium text-foreground">Connection successful</p>
                    {testConnection.data.toolCount > 0 ? (
                      <p className="mt-0.5">
                        {testConnection.data.toolCount} tool
                        {testConnection.data.toolCount !== 1 ? "s" : ""} available
                        {testConnection.data.tools && testConnection.data.tools.length > 0 && (
                          <span className="text-muted-foreground">
                            {" — "}
                            {testConnection.data.tools.map((t) => t.name).join(", ")}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-0.5">No tools exposed by this server.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">Connection failed</p>
                    <p className="mt-0.5 break-all">{testConnection.data.error}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Server Form Page ──────────────────────────────────────────────────────────

interface ServerFormPageProps {
  /** "new" to add a server, otherwise the name of the server being edited */
  serverName: string
}

export function ServerFormPage({ serverName }: ServerFormPageProps) {
  const navigate = useNavigate()
  const { data: settings } = useMcpSettings()
  const saveSettings = useSaveMcpSettings()

  const servers = settings?.servers ?? []
  const isNew = serverName === "new"
  const server = isNew
    ? null
    : (servers.find((s) => s.name === serverName) ?? null)

  const [formState, setFormState] = useState<ServerFormState>(() =>
    server ? configToFormState(server) : createEmptyServerForm()
  )
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function goBack() {
    navigate({
      to: "/settings/$section",
      params: { section: "mcp" },
      search: {},
    })
  }

  function handleSave() {
    const errors = validateForm(formState)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const newConfig = formStateToConfig(formState)
    const updatedServers = server
      ? servers.map((s) => (s.name === server.name ? newConfig : s))
      : [...servers.filter((s) => s.name !== newConfig.name), newConfig]

    saveSettings.mutate(
      { settings: { servers: updatedServers } },
      { onSuccess: goBack }
    )
  }

  const canSave =
    formState.name.trim() &&
    formState.command.trim() &&
    Object.keys(formErrors).length === 0

  return (
    <div className="mx-auto w-full max-w-2xl px-8 pt-6 pb-24">
      {/* Page header */}
      <Button
        variant="ghost"
        size="sm"
        onClick={goBack}
        className="mb-4 -ml-2 h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        <span className="text-xs font-medium">All servers</span>
      </Button>

      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-primary/5">
          <Terminal className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight tracking-tight">
            {server ? "Edit MCP Server" : "Add MCP Server"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {server
              ? `Update the configuration for ${server.name}.`
              : "Connect an MCP server to extend the agent with additional tools."}
          </p>
        </div>
      </header>

      <ServerFormFields
        server={server}
        formState={formState}
        setFormState={setFormState}
        formErrors={formErrors}
        setFormErrors={setFormErrors}
      />

      {/* Actions */}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={goBack}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave || saveSettings.isPending}>
          {saveSettings.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : server ? (
            "Update Server"
          ) : (
            "Add Server"
          )}
        </Button>
      </div>
    </div>
  )
}

// ── Server List Item ──────────────────────────────────────────────────────────

interface ServerListItemProps {
  server: McpServerConfig
  status?: { connected: boolean; toolCount: number; error?: string; enabled?: boolean }
  tools?: Array<{ name: string; description?: string }>
  onEdit: () => void
  onDelete: () => void
}

export function ServerListItem({
  server,
  status,
  tools,
  onEdit,
  onDelete,
}: ServerListItemProps) {
  const startServer = useStartMcpServer()
  const stopServer = useStopMcpServer()
  const [showTools, setShowTools] = useState(false)

  const hasTools = tools && tools.length > 0
  const isEnabled = status?.enabled ?? true
  const isConnected = status?.connected ?? false
  const isLoading = startServer.isPending || stopServer.isPending

  function handleStartStop() {
    if (isConnected) {
      stopServer.mutate({ serverName: server.name })
    } else {
      startServer.mutate({ serverName: server.name })
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card transition-opacity", !isEnabled && "opacity-60")}>
      {/* Content */}
      <div className="flex items-start gap-3 px-3 pt-3 pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-tight">{server.name}</p>
          <code className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/55">
            {server.command}
            {server.args?.length ? ` ${server.args.join(" ")}` : ""}
          </code>
          {server.description && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {server.description}
            </p>
          )}
          {status?.error && (
            <p className="mt-1 text-[10px] text-destructive">{status.error}</p>
          )}
        </div>
      </div>

      {/* Status + Actions bar */}
      <div className="flex h-9 items-center gap-1 border-t bg-muted/20 px-2">
        {/* Status indicator */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5">
          {isConnected ? (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
            </span>
          ) : status?.error ? (
            <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/70" />
          ) : (
            <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/25" />
          )}
          <span
            className={cn(
              "text-[10px]",
              !isEnabled
                ? "text-muted-foreground"
                : status === undefined
                  ? "animate-pulse text-muted-foreground"
                  : isConnected
                    ? "font-medium text-green-600 dark:text-green-400"
                    : status.error
                      ? "text-destructive"
                      : "text-muted-foreground"
            )}
          >
            {!isEnabled
              ? "disabled"
              : status === undefined
                ? "connecting…"
                : isConnected
                  ? "connected"
                  : status.error
                    ? "error"
                    : "stopped"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          {hasTools && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTools(!showTools)}
              className={cn(
                "h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground",
                showTools && "bg-background text-foreground shadow-sm ring-1 ring-border/60 hover:bg-background"
              )}
            >
              <Wrench className="h-3 w-3" />
              {tools.length} tool{tools.length !== 1 ? "s" : ""}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleStartStop}
            disabled={!isEnabled || isLoading}
            title={isConnected ? "Stop server" : "Start server"}
            className="text-muted-foreground"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" />
            ) : isConnected ? (
              <Square className="text-orange-500" />
            ) : (
              <Play className="text-green-500" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            title="Edit server"
            className="text-muted-foreground hover:text-foreground"
          >
            <Edit2 />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title="Remove server"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Collapsible tool list */}
      {showTools && hasTools && (
        <div className="border-t">
          <div className="flex h-8 items-center gap-2 bg-muted/30 px-3">
            <Wrench className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
              {tools.length} Tool{tools.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="p-1.5">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="my-1 flex items-center gap-2.5 rounded-md border border-border/40 bg-muted/10 px-2.5 py-2 first:mt-0 last:mb-0"
              >
                <div className="min-w-0">
                  <code className="font-mono text-[10px] font-semibold text-foreground/80">
                    {tool.name}
                  </code>
                  {tool.description && (
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                      {tool.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected with no tools */}
      {isEnabled && isConnected && !hasTools && status?.toolCount === 0 && (
        <div className="flex items-center gap-1.5 border-t bg-muted/10 px-3 py-2">
          <Wrench className="h-3 w-3 text-muted-foreground/40" />
          <p className="text-[10px] text-muted-foreground">No tools exposed by this server</p>
        </div>
      )}
    </div>
  )
}

// ── Delete Confirmation Dialog ────────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  open: boolean
  serverName: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({
  open,
  serverName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel()
      }}
    >
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <DialogTitle>Remove server?</DialogTitle>
          <DialogDescription>
            <code className="font-mono font-medium text-foreground">{serverName}</code> will be
            disconnected and its tools removed from the agent. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Form Validation ───────────────────────────────────────────────────────────

export function validateForm(form: ServerFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!form.name.trim()) {
    errors.name = "Server name is required"
  } else if (!/^[a-zA-Z0-9_-]+$/.test(form.name)) {
    errors.name = "Only letters, numbers, underscores, and hyphens allowed"
  }

  if (!form.command.trim()) {
    errors.command = "Command is required"
  }

  return errors
}
