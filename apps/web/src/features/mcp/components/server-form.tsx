import { useState, type ReactNode } from "react"
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
  AlertTriangle,
  ArrowLeft,
  TerminalSquare,
  Globe,
} from "lucide-react"

import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Switch } from "@/shared/ui/switch"
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
import type { McpServerConfig, McpTransportType, ServerFormState } from "../types"
import { createEmptyServerForm, formStateToConfig, configToFormState } from "../types"
import { useMcpSettings } from "../queries"
import { useSaveMcpSettings, useTestMcpConnection, useSetMcpServerEnabled } from "../mutations"

// ── Environment Variable Row ──────────────────────────────────────────────────

interface EnvVarRowProps {
  envVar: { key: string; value: string }
  index: number
  onChange: (field: "key" | "value", value: string) => void
  onRemove: () => void
  /** Placeholder for the key input. */
  keyPlaceholder?: string
  /** Placeholder for the value input. */
  valuePlaceholder?: string
  /** Separator rendered between key and value (e.g. "=" for env, ":" for headers). */
  separator?: string
}

function EnvVarRow({
  envVar,
  index,
  onChange,
  onRemove,
  keyPlaceholder = "VARIABLE_NAME",
  valuePlaceholder = "value",
  separator = "=",
}: EnvVarRowProps) {
  const lowerKey = envVar.key.toLowerCase()
  const isSecret =
    lowerKey.includes("token") ||
    lowerKey.includes("key") ||
    lowerKey.includes("secret") ||
    lowerKey.includes("authorization")

  return (
    <div className="group flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-3xs font-medium text-muted-foreground">
        {index + 1}
      </span>
      <Input
        value={envVar.key}
        onChange={(e) => onChange("key", e.target.value)}
        placeholder={keyPlaceholder}
        className="h-6 flex-1 font-mono text-xs"
      />
      <span className="shrink-0 select-none text-xs text-muted-foreground">{separator}</span>
      <Input
        value={envVar.value}
        onChange={(e) => onChange("value", e.target.value)}
        placeholder={valuePlaceholder}
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
      if (parsed.name && (parsed.command || parsed.url)) {
        onImport(parsed as McpServerConfig)
        setJsonText("")
        setExpanded(false)
        setError("")
      } else {
        setError("Config must include 'name' and either 'command' (stdio) or 'url' (http)")
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
            placeholder={'{\n  "name": "my-server",\n  "command": "npx",\n  "args": ["-y", "package-name"]\n}\n\n// or HTTP:\n{\n  "name": "remote",\n  "transport": "http",\n  "url": "https://example.com/mcp"\n}'}
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

// ── Transport Option (segmented control button) ───────────────────────────────

interface TransportOptionProps {
  active: boolean
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
}

function TransportOption({ active, icon, label, hint, onClick }: TransportOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center transition-colors",
        active
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className="text-3xs text-muted-foreground">{hint}</span>
    </button>
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
  const [showAdvanced, setShowAdvanced] = useState(
    () => formState.envVars.length > 0 || formState.headers.length > 0
  )

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

  function addHeader() {
    setFormState({
      ...formState,
      headers: [...formState.headers, { key: "", value: "" }],
    })
  }

  function updateHeader(index: number, field: "key" | "value", value: string) {
    setFormState({
      ...formState,
      headers: formState.headers.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    })
  }

  function removeHeader(index: number) {
    setFormState({
      ...formState,
      headers: formState.headers.filter((_, i) => i !== index),
    })
  }

  function setTransport(transport: McpTransportType) {
    setFormState({ ...formState, transport })
    const next = { ...formErrors }
    delete next.command
    delete next.url
    setFormErrors(next)
  }

  const isHttp = formState.transport === "http" || formState.transport === "sse"
  const canTest = isHttp
    ? Boolean(formState.name.trim() && formState.url.trim())
    : Boolean(formState.name.trim() && formState.command.trim())
  const advancedCount = isHttp ? formState.headers.length : formState.envVars.length

  return (
    <div className="space-y-5">
      {/* JSON Quick Import */}
      <JsonImport onImport={(config) => setFormState(configToFormState(config))} />

      {/* Transport selector */}
      <Field>
        <FieldLabel>Transport</FieldLabel>
        <FieldDescription>
          How to reach the server — a local process (stdio) or a remote HTTP
          endpoint.
        </FieldDescription>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <TransportOption
            active={formState.transport === "stdio"}
            icon={<TerminalSquare className="h-3.5 w-3.5" />}
            label="stdio"
            hint="Local process"
            onClick={() => setTransport("stdio")}
          />
          <TransportOption
            active={formState.transport === "http"}
            icon={<Globe className="h-3.5 w-3.5" />}
            label="HTTP"
            hint="Streamable"
            onClick={() => setTransport("http")}
          />
          <TransportOption
            active={formState.transport === "sse"}
            icon={<Globe className="h-3.5 w-3.5" />}
            label="SSE"
            hint="Legacy"
            onClick={() => setTransport("sse")}
          />
        </div>
      </Field>

      {/* Core configuration */}
      <FieldGroup>
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

        {isHttp ? (
          <Field data-invalid={formErrors.url ? true : undefined}>
            <FieldLabel htmlFor="server-url">
              Server URL <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldDescription>
              Endpoint of the remote MCP server.
            </FieldDescription>
            <Input
              id="server-url"
              value={formState.url}
              onChange={(e) => updateField("url", e.target.value)}
              placeholder="https://example.com/mcp"
              className="mt-1.5 font-mono text-xs"
            />
            {formErrors.url && <FieldError>{formErrors.url}</FieldError>}
          </Field>
        ) : (
          <>
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
                <SectionLabel className="mb-1 block">Preview</SectionLabel>
                <code className="break-all font-mono text-xs">
                  {formState.command}
                  {formState.args && ` ${formState.args}`}
                </code>
              </div>
            )}
          </>
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
            {advancedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-3xs font-semibold text-primary">
                {advancedCount}
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
            {isHttp ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">HTTP Headers</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sent with every request — e.g. an Authorization bearer token.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addHeader}
                    className="shrink-0"
                  >
                    <Plus />
                    Add Header
                  </Button>
                </div>

                {formState.headers.length > 0 ? (
                  <div className="space-y-1.5">
                    {formState.headers.map((header, index) => (
                      <EnvVarRow
                        key={index}
                        envVar={header}
                        index={index}
                        keyPlaceholder="Authorization"
                        valuePlaceholder="Bearer"
                        separator=":"
                        onChange={(field, value) => updateHeader(index, field, value)}
                        onRemove={() => removeHeader(index)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-4 py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No headers configured
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
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
              </>
            )}
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
                Testing
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

  const isHttp = formState.transport === "http" || formState.transport === "sse"
  const canSave =
    formState.name.trim() &&
    (isHttp ? formState.url.trim() : formState.command.trim()) &&
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
              Saving
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
  const setEnabled = useSetMcpServerEnabled()
  const [showTools, setShowTools] = useState(false)

  const hasTools = tools && tools.length > 0
  const isEnabled = status?.enabled ?? true
  const isConnected = status?.connected ?? false

  // Reflect the pending toggle immediately for a responsive switch.
  const checked = setEnabled.isPending
    ? (setEnabled.variables?.enabled ?? isEnabled)
    : isEnabled

  function toggleEnabled(enabled: boolean) {
    setEnabled.mutate({ serverName: server.name, enabled })
  }

  // A single quiet status word — no colored indicator dot. The switch already
  // conveys on/off, so a label only appears while the server is enabled.
  const statusLabel = !checked
    ? null
    : status === undefined
      ? "Connecting"
      : isConnected
        ? "Connected"
        : status.error
          ? "Error"
          : "Starting"

  return (
    <div className="rounded-md border border-border/40 transition-colors">
      {/* Row */}
      <div className="group flex items-center gap-3 px-3 py-2.5">
        {/* Identity */}
        <div className={cn("min-w-0 flex-1", !checked && "opacity-50")}>
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium leading-tight">{server.name}</p>
            {statusLabel && (
              <span
                className={cn(
                  "shrink-0 text-2xs leading-none",
                  status?.error ? "text-destructive" : "text-muted-foreground",
                  status === undefined && "animate-pulse"
                )}
              >
                {statusLabel}
              </span>
            )}
          </div>
          <code className="mt-1 block truncate font-mono text-2xs text-muted-foreground/60">
            {server.url
              ? server.url
              : `${server.command ?? ""}${server.args?.length ? ` ${server.args.join(" ")}` : ""}`}
          </code>
          {checked && status?.error && (
            <p className="mt-1 truncate text-2xs text-destructive">{status.error}</p>
          )}
        </div>

        {/* Tools count */}
        {hasTools && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTools(!showTools)}
            className={cn(
              "h-6 shrink-0 gap-1 px-1.5 text-2xs text-muted-foreground hover:text-foreground",
              showTools && "text-foreground"
            )}
          >
            <Wrench className="h-3 w-3" />
            {tools.length}
          </Button>
        )}

        {/* Edit / Delete */}
        <div className="flex shrink-0 items-center">
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

        {/* On/off toggle */}
        <Switch
          checked={checked}
          onCheckedChange={toggleEnabled}
          disabled={setEnabled.isPending}
          aria-label={`${checked ? "Disable" : "Enable"} ${server.name}`}
          className="shrink-0"
        />
      </div>

      {/* Collapsible tool list */}
      {showTools && hasTools && (
        <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
          {tools.map((tool) => (
            <div key={tool.name}>
              <code className="font-mono text-2xs font-medium text-foreground/80">
                {tool.name}
              </code>
              {tool.description && (
                <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              )}
            </div>
          ))}
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

  const isHttp = form.transport === "http" || form.transport === "sse"

  if (isHttp) {
    if (!form.url.trim()) {
      errors.url = "Server URL is required"
    } else {
      try {
        new URL(form.url)
      } catch {
        errors.url = "Enter a valid URL (e.g. https://example.com/mcp)"
      }
    }
  } else if (!form.command.trim()) {
    errors.command = "Command is required"
  }

  return errors
}
