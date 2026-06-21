import { useMemo, useState } from "react"
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Server,
  Trash2,
} from "lucide-react"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useOpenExternal } from "@/features/electron"
import { getProviderMeta } from "@/shared/lib/provider-meta"
import type {
  LocalProviderApi,
  LocalProviderConfig,
  ProviderCompat,
  ThinkingFormat,
} from "../api"
import { useLocalProviders } from "../queries"
import { useDeleteLocalProvider, useSaveLocalProvider } from "../mutations"
import { SettingsGroup, SettingsRow } from "../components/settings-ui"

// ── Presets ─────────────────────────────────────────────────────────────────

interface Preset {
  id: string
  label: string
  baseUrl: string
  api: LocalProviderApi
  apiKey: string
  modelPlaceholder: string
  docsUrl?: string
  /** Whether the provider id can be edited (custom only). */
  custom?: boolean
}

const PRESETS: Preset[] = [
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    apiKey: "ollama",
    modelPlaceholder: "qwen2.5-coder:7b\nllama3.1:8b",
    docsUrl: "https://ollama.com/download",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    api: "openai-completions",
    apiKey: "lmstudio",
    modelPlaceholder: "qwen2.5-coder-7b-instruct",
    docsUrl: "https://lmstudio.ai/",
  },
  {
    id: "vllm",
    label: "vLLM",
    baseUrl: "http://localhost:8000/v1",
    api: "openai-completions",
    apiKey: "vllm",
    modelPlaceholder: "Qwen/Qwen2.5-Coder-7B-Instruct",
    docsUrl: "https://docs.vllm.ai/en/latest/",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    api: "openai-completions",
    apiKey: "",
    modelPlaceholder: "model-id",
    custom: true,
  },
]

const API_OPTIONS: { value: LocalProviderApi; label: string }[] = [
  { value: "openai-completions", label: "OpenAI Chat Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
]

/**
 * How a reasoning model receives its thinking controls. "auto" is the
 * default `reasoning_effort` behaviour (stored as no `thinkingFormat`). The
 * rest map Pi's thinking levels into provider-specific request fields — most
 * relevant for self-hosted vLLM / Hugging Face servers. See the pi-coding-agent
 * `docs/models.md` "OpenAI Compatibility" table.
 */
const AUTO_THINKING_FORMAT = "auto" as const

const THINKING_FORMAT_OPTIONS: {
  value: ThinkingFormat | typeof AUTO_THINKING_FORMAT
  label: string
}[] = [
  { value: AUTO_THINKING_FORMAT, label: "Auto (reasoning_effort)" },
  { value: "deepseek", label: "DeepSeek (thinking + reasoning_effort)" },
  { value: "qwen", label: "Qwen (enable_thinking)" },
  { value: "qwen-chat-template", label: "Qwen chat template" },
  { value: "chat-template", label: "Chat template (custom)" },
]

/** Sensible starting point for DeepSeek V3.x behind vLLM. */
const DEFAULT_CHAT_TEMPLATE_KWARGS = JSON.stringify(
  { thinking: { $var: "thinking.enabled" } },
  null,
  2
)

function presetForId(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]
}

// ── Configure dialog ──────────────────────────────────────────────────────────

interface EditTarget {
  id: string
  config: LocalProviderConfig
}

interface ConfigureProviderDialogProps {
  /** Existing provider being edited, or null when adding. */
  edit: EditTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
}

function ConfigureProviderDialog({
  edit,
  open,
  onOpenChange,
  onClose,
}: ConfigureProviderDialogProps) {
  const saveMutation = useSaveLocalProvider()

  const initialPreset = edit ? presetForId(edit.id) : PRESETS[0]
  const [presetId, setPresetId] = useState(initialPreset.id)
  const [providerId, setProviderId] = useState(edit?.id ?? PRESETS[0].id)
  const [baseUrl, setBaseUrl] = useState(
    edit?.config.baseUrl ?? PRESETS[0].baseUrl
  )
  const [api, setApi] = useState<LocalProviderApi>(
    edit?.config.api ?? PRESETS[0].api
  )
  const [apiKey, setApiKey] = useState(edit?.config.apiKey ?? PRESETS[0].apiKey)
  const [modelsText, setModelsText] = useState(
    edit ? edit.config.models.map((m) => m.id).join("\n") : ""
  )
  const [reasoning, setReasoning] = useState(
    edit ? (edit.config.models.some((m) => m.reasoning) ?? false) : false
  )
  const [thinkingFormat, setThinkingFormat] = useState<
    ThinkingFormat | typeof AUTO_THINKING_FORMAT
  >(edit?.config.compat?.thinkingFormat ?? AUTO_THINKING_FORMAT)
  const [chatTemplateKwargs, setChatTemplateKwargs] = useState(() =>
    edit?.config.compat?.chatTemplateKwargs
      ? JSON.stringify(edit.config.compat.chatTemplateKwargs, null, 2)
      : DEFAULT_CHAT_TEMPLATE_KWARGS
  )
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const preset = presetForId(presetId)
  const isCustom = preset.custom ?? false
  const isEditing = edit !== null

  function applyPreset(id: string) {
    setPresetId(id)
    const p = presetForId(id)
    setProviderId(p.custom ? "" : p.id)
    setBaseUrl(p.baseUrl)
    setApi(p.api)
    setApiKey(p.apiKey)
  }

  const modelIds = useMemo(
    () =>
      modelsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [modelsText]
  )

  function handleSave() {
    setError(null)
    setWarning(null)
    const id = providerId.trim()
    if (!id) {
      setError("Provider id is required.")
      return
    }
    if (!baseUrl.trim()) {
      setError("Base URL is required.")
      return
    }
    if (modelIds.length === 0) {
      setError("Add at least one model id.")
      return
    }

    const config: LocalProviderConfig = {
      baseUrl: baseUrl.trim(),
      api,
      models: modelIds.map((mid) => ({
        id: mid,
        ...(reasoning ? { reasoning: true } : {}),
      })),
    }
    if (apiKey.trim()) config.apiKey = apiKey.trim()
    // OpenAI-compatible local servers (Ollama, vLLM, …) commonly reject the
    // `developer` role and `reasoning_effort` used for reasoning models.
    if (reasoning && api === "openai-completions") {
      const compat: ProviderCompat = {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      }
      if (thinkingFormat !== AUTO_THINKING_FORMAT) {
        compat.thinkingFormat = thinkingFormat
      }
      if (thinkingFormat === "chat-template") {
        let parsed: unknown
        try {
          parsed = JSON.parse(chatTemplateKwargs)
        } catch {
          setError("Chat template kwargs must be valid JSON.")
          return
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setError("Chat template kwargs must be a JSON object.")
          return
        }
        if (Object.keys(parsed).length === 0) {
          setError("Add at least one chat template kwarg.")
          return
        }
        compat.chatTemplateKwargs =
          parsed as ProviderCompat["chatTemplateKwargs"]
      }
      config.compat = compat
    }

    saveMutation.mutate(
      { id, config },
      {
        onSuccess: (res) => {
          if (res?.error) {
            setError(res.error)
            return
          }
          // The provider is persisted, but the endpoint didn't respond — keep
          // the dialog open so the user can correct the base URL (re-saving a
          // reachable URL clears this and closes).
          if (res?.warning) {
            setWarning(res.warning)
            return
          }
          onClose()
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : String(err)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit ${edit.id}` : "Add local provider"}
          </DialogTitle>
          <DialogDescription>
            Saved to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-2xs">
              ~/.pi/agent/models.json
            </code>
            . Models appear in the model picker immediately.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="py-1">
          {!isEditing && (
            <Field>
              <FieldLabel htmlFor="local-preset">Provider</FieldLabel>
              <Select
                value={presetId}
                onValueChange={(v) => {
                  if (typeof v === "string") applyPreset(v)
                }}
              >
                <SelectTrigger id="local-preset">
                  <SelectValue>{preset.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}

          {isCustom && !isEditing && (
            <Field>
              <FieldLabel htmlFor="local-id">Provider id</FieldLabel>
              <Input
                id="local-id"
                value={providerId}
                onChange={(e) =>
                  setProviderId(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                  )
                }
                placeholder="my-local"
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription>
                Lowercase identifier used as the provider key.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="local-base-url">Base URL</FieldLabel>
            <Input
              id="local-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="local-api">API type</FieldLabel>
            <Select
              value={api}
              onValueChange={(v) => {
                if (typeof v === "string") setApi(v as LocalProviderApi)
              }}
            >
              <SelectTrigger id="local-api">
                <SelectValue>
                  {API_OPTIONS.find((o) => o.value === api)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {API_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Most local servers (Ollama, LM Studio, vLLM) speak OpenAI Chat
              Completions.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="local-models">Models</FieldLabel>
            <Textarea
              id="local-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              placeholder={preset.modelPlaceholder}
              className="min-h-20 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <FieldDescription>
              One model id per line — exactly as the server reports it (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-2xs">
                ollama list
              </code>
              ).
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor="local-reasoning">
                Models support reasoning
              </FieldLabel>
              <FieldDescription>
                Enables thinking levels. Sends the system prompt as a system
                message for OpenAI-compatible servers.
              </FieldDescription>
            </div>
            <Switch
              id="local-reasoning"
              checked={reasoning}
              onCheckedChange={setReasoning}
            />
          </Field>

          {reasoning && api === "openai-completions" && (
            <Field>
              <FieldLabel htmlFor="local-thinking-format">
                Thinking format
              </FieldLabel>
              <Select
                value={thinkingFormat}
                onValueChange={(v) => {
                  if (typeof v === "string")
                    setThinkingFormat(
                      v as ThinkingFormat | typeof AUTO_THINKING_FORMAT
                    )
                }}
              >
                <SelectTrigger id="local-thinking-format">
                  <SelectValue>
                    {
                      THINKING_FORMAT_OPTIONS.find(
                        (o) => o.value === thinkingFormat
                      )?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THINKING_FORMAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                How thinking levels reach the server. Pick{" "}
                <strong>Chat template</strong> for vLLM / Hugging Face models
                that read <code className="text-2xs">chat_template_kwargs</code>{" "}
                (e.g. DeepSeek V3.x).
              </FieldDescription>
            </Field>
          )}

          {reasoning &&
            api === "openai-completions" &&
            thinkingFormat === "chat-template" && (
              <Field>
                <FieldLabel htmlFor="local-chat-template-kwargs">
                  Chat template kwargs
                </FieldLabel>
                <Textarea
                  id="local-chat-template-kwargs"
                  value={chatTemplateKwargs}
                  onChange={(e) => setChatTemplateKwargs(e.target.value)}
                  className="min-h-24 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>
                  JSON sent as{" "}
                  <code className="text-2xs">chat_template_kwargs</code>. Bind a
                  Pi-controlled value with{" "}
                  <code className="text-2xs">
                    {'{ "$var": "thinking.enabled" }'}
                  </code>{" "}
                  or{" "}
                  <code className="text-2xs">
                    {'{ "$var": "thinking.effort" }'}
                  </code>
                  .
                </FieldDescription>
              </Field>
            )}

          <Field>
            <FieldLabel htmlFor="local-key">API key (optional)</FieldLabel>
            <Input
              id="local-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ollama"
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <FieldDescription>
              Required by the SDK but ignored by most local servers — any value
              works.
            </FieldDescription>
          </Field>

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{error}</span>
            </p>
          )}

          {warning && !error && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{warning}</span>
            </p>
          )}
        </FieldGroup>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={saveMutation.isPending}
          >
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 data-icon="inline-start" className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save data-icon="inline-start" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Setup guide ────────────────────────────────────────────────────────────────

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-3xs font-medium text-muted-foreground">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-2xs">
      {children}
    </code>
  )
}

function SetupGuide() {
  const openExternal = useOpenExternal()
  const open = (url: string) => {
    void openExternal.mutateAsync(url).catch(() => window.open(url, "_blank"))
  }

  return (
    <Accordion>
      <AccordionItem>
        <AccordionTrigger>Set up Ollama</AccordionTrigger>
        <AccordionContent>
          <ol className="flex flex-col gap-2 text-muted-foreground">
            <GuideStep n={1}>
              Install Ollama from{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => open("https://ollama.com/download")}
              >
                ollama.com/download <ExternalLink className="inline h-3 w-3" />
              </button>
              .
            </GuideStep>
            <GuideStep n={2}>
              Pull a model: <Code>ollama pull qwen2.5-coder:7b</Code>. The
              server runs at <Code>http://localhost:11434</Code>.
            </GuideStep>
            <GuideStep n={3}>
              List installed models with <Code>ollama list</Code>.
            </GuideStep>
            <GuideStep n={4}>
              Click <strong>Add provider</strong> below, choose{" "}
              <strong>Ollama</strong>, and paste your model ids.
            </GuideStep>
          </ol>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem>
        <AccordionTrigger>Set up LM Studio</AccordionTrigger>
        <AccordionContent>
          <ol className="flex flex-col gap-2 text-muted-foreground">
            <GuideStep n={1}>
              Install LM Studio from{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => open("https://lmstudio.ai/")}
              >
                lmstudio.ai <ExternalLink className="inline h-3 w-3" />
              </button>
              .
            </GuideStep>
            <GuideStep n={2}>
              Download a model from the in-app catalog (Search tab).
            </GuideStep>
            <GuideStep n={3}>
              Open the <strong>Developer</strong> tab and{" "}
              <strong>Start Server</strong>. It listens on{" "}
              <Code>http://localhost:1234</Code>.
            </GuideStep>
            <GuideStep n={4}>
              Click <strong>Add provider</strong> below, choose{" "}
              <strong>LM Studio</strong>, and paste the model id shown in the
              server panel.
            </GuideStep>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// ── Provider row ────────────────────────────────────────────────────────────────

function ProviderRow({
  id,
  config,
  onEdit,
  onDelete,
  isDeleting,
}: {
  id: string
  config: LocalProviderConfig
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const { icon } = getProviderMeta(id)
  return (
    <SettingsRow
      className="items-start"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {icon ?? <Server className="h-4 w-4 text-muted-foreground" />}
          </span>
          <span className="truncate font-medium">{id}</span>
          <Badge variant="secondary">{config.models.length} models</Badge>
        </span>
      }
      description={
        <>
          <span className="block truncate font-mono text-2xs">
            {config.baseUrl}
          </span>
          <span className="mt-0.5 block truncate">
            {config.models.map((m) => m.id).join(", ")}
          </span>
        </>
      }
    >
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`Remove ${id}`}
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </SettingsRow>
  )
}

// ── Section ──────────────────────────────────────────────────────────────────

export function LocalModelsSection() {
  const { data, isLoading } = useLocalProviders()
  const deleteMutation = useDeleteLocalProvider()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const providers = data?.providers ?? {}
  const entries = Object.entries(providers)

  function openAdd() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  function openEdit(id: string, config: LocalProviderConfig) {
    setEditTarget({ id, config })
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    deleteMutation.mutate(id, {
      onSettled: () => setDeletingId(null),
    })
  }

  return (
    <>
      <SettingsGroup
        title="Configuration steps"
        description="Run a local model server, then register its models below. No API key or internet connection required."
      >
        <div className="pt-2">
          <SetupGuide />
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Configured providers"
        action={
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus data-icon="inline-start" />
            Add provider
          </Button>
        }
      >
        {isLoading ? (
          <p className="py-3.5 text-xs text-muted-foreground">Loading…</p>
        ) : data?.error ? (
          <p className="my-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{data.error}</span>
          </p>
        ) : entries.length === 0 ? (
          <p className="my-2 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
            No local providers configured yet.
          </p>
        ) : (
          entries.map(([id, config]) => (
            <ProviderRow
              key={id}
              id={id}
              config={config}
              onEdit={() => openEdit(id, config)}
              onDelete={() => handleDelete(id)}
              isDeleting={deletingId === id}
            />
          ))
        )}
      </SettingsGroup>

      {dialogOpen && (
        <ConfigureProviderDialog
          key={editTarget?.id ?? "new"}
          edit={editTarget}
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) setDialogOpen(false)
          }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}
