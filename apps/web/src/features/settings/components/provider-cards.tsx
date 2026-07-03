import { useState, useRef, useMemo, type ReactNode } from "react"
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  Save,
  Search,
  X,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/input-group"
import { useOpenExternal } from "@/features/electron"
import { modelsQueryKey } from "@/features/chat/queries"
import {
  oauthProvidersQueryKey,
  useOAuthProviders,
  useProviders,
} from "../queries"
import {
  useAbortOAuthLogin,
  useOAuthLogout,
  useOpenOAuthWebSocket,
  useRespondToOAuthPrompt,
  useStartOAuthLogin,
  useUpdateProviders,
} from "../mutations"
import { cn } from "@/shared/lib/utils"
import { getProviderMeta } from "@/shared/lib/provider-meta"

// ── Shared ────────────────────────────────────────────────────────────────────

export interface ApiKeyProvider {
  id: string
  label: string
  placeholder: string
  /** Console page where the user can create a key. */
  keyUrl?: string
}

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Google Gemini",
    placeholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  { id: "google-vertex", label: "Google Vertex", placeholder: "..." },
  { id: "amazon-bedrock", label: "Amazon Bedrock", placeholder: "..." },
  {
    id: "mistral",
    label: "Mistral",
    placeholder: "...",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "groq",
    label: "Groq",
    placeholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
  },
  { id: "cerebras", label: "Cerebras", placeholder: "..." },
  {
    id: "xai",
    label: "xAI",
    placeholder: "xai-...",
    keyUrl: "https://console.x.ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    placeholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  { id: "vercel-ai-gateway", label: "Vercel AI Gateway", placeholder: "..." },
  {
    id: "huggingface",
    label: "Hugging Face",
    placeholder: "hf_...",
    keyUrl: "https://huggingface.co/settings/tokens",
  },
  { id: "fireworks", label: "Fireworks", placeholder: "fw_..." },
  {
    id: "fireworks-inference",
    label: "Fireworks Inference",
    placeholder: "fw_...",
  },
  { id: "kimi-coding", label: "Kimi For Coding", placeholder: "..." },
  { id: "minimax", label: "MiniMax", placeholder: "..." },
  { id: "minimax-cn", label: "MiniMax (China)", placeholder: "..." },
  { id: "zai", label: "ZAI", placeholder: "..." },
  { id: "opencode", label: "OpenCode Zen", placeholder: "..." },
  { id: "opencode-go", label: "OpenCode Go", placeholder: "..." },
  { id: "azure-openai-responses", label: "Azure OpenAI", placeholder: "..." },
  {
    id: "deepseek",
    label: "DeepSeek",
    placeholder: "sk-...",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    placeholder: "pplx-...",
    keyUrl: "https://www.perplexity.ai/settings/api",
  },
  { id: "together", label: "Together AI", placeholder: "..." },
  { id: "cohere", label: "Cohere", placeholder: "..." },
  { id: "novita", label: "Novita AI", placeholder: "..." },
  { id: "cloudflare-workers", label: "Cloudflare Workers", placeholder: "..." },
  { id: "cloudflare", label: "Cloudflare", placeholder: "..." },
  { id: "replicate", label: "Replicate", placeholder: "r8_..." },
  { id: "hyperbolic", label: "Hyperbolic", placeholder: "..." },
  { id: "tensorzero", label: "TensorZero", placeholder: "..." },
  { id: "voyage", label: "Voyage AI", placeholder: "..." },
  { id: "codestral", label: "Codestral", placeholder: "..." },
  { id: "wings-gpu", label: "Wings GPU", placeholder: "..." },
  { id: "windsurf", label: "Windsurf", placeholder: "..." },
  { id: "binarybottle", label: "BinaryBottle", placeholder: "..." },
  { id: "infercast", label: "Infercast", placeholder: "..." },
  { id: "lepton", label: "Lepton", placeholder: "..." },
]

/** Providers surfaced first when the list isn't being searched. */
const POPULAR_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "mistral",
  "groq",
  "xai",
  "deepseek",
]

function ConnectedBadge({ children }: { children: string }) {
  return (
    <Badge variant="secondary">
      <Check data-icon="inline-start" />
      {children}
    </Badge>
  )
}

/** Provider icon in the rounded tile used across settings. */
function ProviderTile({
  providerId,
  className,
}: {
  providerId: string
  className?: string
}) {
  const { icon } = getProviderMeta(providerId)
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-foreground/5",
        className
      )}
    >
      {icon}
    </span>
  )
}

function ProviderListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Inline panel shown under a provider row during a sign-in flow. */
function FlowPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5",
        className
      )}
    >
      {children}
    </div>
  )
}

// ── Subscriptions (OAuth) ─────────────────────────────────────────────────────

const OAUTH_PROVIDER_SUBTITLES: Record<string, string> = {
  anthropic: "Claude Pro and Max plans",
  "github-copilot": "GitHub Copilot subscription",
  "openai-codex": "ChatGPT Plus and Pro plans",
}

function oauthSubtitle(providerId: string): string {
  return OAUTH_PROVIDER_SUBTITLES[providerId] ?? "Sign in through your browser"
}

type LoginState =
  | { status: "idle" }
  | { status: "connecting"; providerId: string }
  | {
      status: "waiting_auth"
      providerId: string
      loginId: string
      url: string
      instructions?: string
    }
  | {
      status: "waiting_device_code"
      providerId: string
      loginId: string
      userCode: string
      verificationUri: string
    }
  | {
      status: "waiting_prompt"
      providerId: string
      loginId: string
      promptId: string
      message: string
      placeholder?: string
    }
  | {
      status: "waiting_select"
      providerId: string
      loginId: string
      promptId: string
      message: string
      options: { id: string; label: string }[]
    }
  | { status: "done"; providerId: string }
  | { status: "error"; providerId: string; message: string }

type OAuthWsEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code"
      userCode: string
      verificationUri: string
      expiresInSeconds?: number
      intervalSeconds?: number
    }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | {
      type: "select"
      promptId: string
      message: string
      options: { id: string; label: string }[]
    }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string }

function DeviceCodePanel({
  userCode,
  onOpenVerification,
}: {
  userCode: string
  onOpenVerification: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    void navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <FlowPanel>
      <div className="flex items-start gap-2.5">
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            Enter this code on the verification page
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="rounded-md bg-background px-2.5 py-1 font-mono text-sm font-semibold tracking-[0.25em] ring-1 ring-border">
              {userCode}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyCode}
              aria-label="Copy code"
            >
              {copied ? <Check className="text-primary" /> : <Copy />}
            </Button>
          </div>
          <Button
            variant="link"
            size="sm"
            className="h-auto justify-start px-0"
            onClick={onOpenVerification}
          >
            <ExternalLink data-icon="inline-start" />
            Open verification page
          </Button>
        </div>
      </div>
    </FlowPanel>
  )
}

export function SubscriptionsCard() {
  const queryClient = useQueryClient()
  const { data: providers, isLoading } = useOAuthProviders()
  const openExternalMutation = useOpenExternal()
  const startOAuthLoginMutation = useStartOAuthLogin()
  const openOAuthWebSocketMutation = useOpenOAuthWebSocket()
  const respondToOAuthPromptMutation = useRespondToOAuthPrompt()
  const abortOAuthLoginMutation = useAbortOAuthLogin()
  const oauthLogoutMutation = useOAuthLogout()
  const [loginState, setLoginState] = useState<LoginState>({ status: "idle" })
  const [promptValue, setPromptValue] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const wsMessageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null)
  const wsErrorHandlerRef = useRef<(() => void) | null>(null)
  const wsCloseHandlerRef = useRef<(() => void) | null>(null)

  function closeWebSocket() {
    if (wsRef.current) {
      if (wsMessageHandlerRef.current)
        wsRef.current.removeEventListener(
          "message",
          wsMessageHandlerRef.current
        )
      if (wsErrorHandlerRef.current)
        wsRef.current.removeEventListener("error", wsErrorHandlerRef.current)
      if (wsCloseHandlerRef.current)
        wsRef.current.removeEventListener("close", wsCloseHandlerRef.current)
      wsRef.current.close()
      wsRef.current = null
      wsMessageHandlerRef.current = null
      wsErrorHandlerRef.current = null
      wsCloseHandlerRef.current = null
    }
  }

  async function handleOpenExternal(url: string) {
    try {
      const opened = await openExternalMutation.mutateAsync(url)
      if (!opened) window.open(url, "_blank")
    } catch {
      window.open(url, "_blank")
    }
  }

  async function handleLogin(providerId: string) {
    closeWebSocket()
    setLoginState({ status: "connecting", providerId })

    let loginId: string
    try {
      loginId = await startOAuthLoginMutation.mutateAsync(providerId)
    } catch (err) {
      setLoginState({
        status: "error",
        providerId,
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    let socket: WebSocket
    try {
      socket = await openOAuthWebSocketMutation.mutateAsync(loginId)
    } catch (err) {
      setLoginState({
        status: "error",
        providerId,
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    let completed = false
    wsRef.current = socket

    const messageHandler = (e: MessageEvent) => {
      let event: OAuthWsEvent
      try {
        event = JSON.parse(e.data as string) as OAuthWsEvent
      } catch {
        return
      }

      if (event.type === "auth_url") {
        setLoginState({
          status: "waiting_auth",
          providerId,
          loginId,
          url: event.url,
          instructions: event.instructions,
        })
        void handleOpenExternal(event.url)
      } else if (event.type === "device_code") {
        setLoginState({
          status: "waiting_device_code",
          providerId,
          loginId,
          userCode: event.userCode,
          verificationUri: event.verificationUri,
        })
        void handleOpenExternal(event.verificationUri)
      } else if (event.type === "prompt") {
        setPromptValue("")
        setLoginState({
          status: "waiting_prompt",
          providerId,
          loginId,
          promptId: event.promptId,
          message: event.message,
          placeholder: event.placeholder,
        })
      } else if (event.type === "select") {
        setLoginState({
          status: "waiting_select",
          providerId,
          loginId,
          promptId: event.promptId,
          message: event.message,
          options: event.options,
        })
      } else if (event.type === "done") {
        completed = true
        closeWebSocket()
        setLoginState({ status: "done", providerId })
        queryClient.invalidateQueries({ queryKey: oauthProvidersQueryKey })
        queryClient.invalidateQueries({ queryKey: modelsQueryKey })
        setTimeout(() => setLoginState({ status: "idle" }), 2000)
      } else if (event.type === "error") {
        completed = true
        closeWebSocket()
        setLoginState({ status: "error", providerId, message: event.message })
      }
    }

    const errorHandler = () => {
      closeWebSocket()
      if (!completed) {
        setLoginState({
          status: "error",
          providerId,
          message: "Connection lost",
        })
      }
    }

    const closeHandler = () => {
      if (!completed) {
        wsRef.current = null
        setLoginState({
          status: "error",
          providerId,
          message: "Connection lost",
        })
      }
    }

    wsMessageHandlerRef.current = messageHandler
    wsErrorHandlerRef.current = errorHandler
    wsCloseHandlerRef.current = closeHandler

    socket.addEventListener("message", messageHandler)
    socket.addEventListener("error", errorHandler)
    socket.addEventListener("close", closeHandler)
  }

  async function handlePromptSubmit() {
    if (loginState.status !== "waiting_prompt") return
    const { loginId, promptId, providerId } = loginState
    setLoginState((s) => ({ ...s, status: "connecting" }) as LoginState)
    try {
      await respondToOAuthPromptMutation.mutateAsync({
        loginId,
        promptId,
        value: promptValue,
      })
      setPromptValue("")
    } catch (err) {
      setLoginState({
        status: "error",
        providerId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleSelectOption(optionId: string) {
    if (loginState.status !== "waiting_select") return
    const { loginId, promptId, providerId } = loginState
    setLoginState((s) => ({ ...s, status: "connecting" }) as LoginState)
    try {
      await respondToOAuthPromptMutation.mutateAsync({
        loginId,
        promptId,
        value: optionId,
      })
    } catch (err) {
      setLoginState({
        status: "error",
        providerId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleAbort() {
    closeWebSocket()
    if (
      loginState.status === "waiting_auth" ||
      loginState.status === "waiting_device_code" ||
      loginState.status === "waiting_prompt" ||
      loginState.status === "waiting_select" ||
      loginState.status === "connecting"
    ) {
      try {
        await abortOAuthLoginMutation.mutateAsync(
          (loginState as { loginId?: string }).loginId ?? ""
        )
      } catch {
        /* ignore */
      }
    }
    setLoginState({ status: "idle" })
  }

  async function handleLogout(providerId: string) {
    try {
      await oauthLogoutMutation.mutateAsync(providerId)
    } catch {
      /* ignore */
    }
  }

  const activeProviderId =
    loginState.status !== "idle"
      ? (loginState as { providerId: string }).providerId
      : null

  // A flow is in progress (not a terminal error/done state) — only then should
  // other providers' sign-in buttons be locked out.
  const flowBusy =
    loginState.status !== "idle" &&
    loginState.status !== "done" &&
    loginState.status !== "error"

  if (isLoading) return <ProviderListSkeleton rows={2} />

  if (!providers?.length) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
        No subscription providers available.
      </p>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {providers.map((p) => {
        const isActive = activeProviderId === p.id
        const isPending = isActive && loginState.status === "connecting"
        const isDone = isActive && loginState.status === "done"
        const isError = isActive && loginState.status === "error"
        const showSignedIn = (p.loggedIn && !isActive) || isDone

        return (
          <div key={p.id} className="flex flex-col gap-2.5 py-3">
            <div className="flex items-center gap-3">
              <ProviderTile providerId={p.id} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  {showSignedIn && <ConnectedBadge>Connected</ConnectedBadge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {isPending ? "Starting sign-in…" : oauthSubtitle(p.id)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.loggedIn && !isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLogout(p.id)}
                  >
                    <LogOut data-icon="inline-start" />
                    Sign out
                  </Button>
                ) : isActive && flowBusy ? (
                  <Button variant="outline" size="sm" onClick={handleAbort}>
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={isPending || (flowBusy && !isActive)}
                    onClick={() => handleLogin(p.id)}
                  >
                    {isPending ? (
                      <Loader2
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <LogIn data-icon="inline-start" />
                    )}
                    {isPending
                      ? "Connecting"
                      : isError
                        ? "Try again"
                        : "Sign in"}
                  </Button>
                )}
              </div>
            </div>

            {isError && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-destructive">
                      Sign-in failed
                    </p>
                    <p className="mt-0.5 text-xs/relaxed break-words text-muted-foreground">
                      {loginState.status === "error" && loginState.message}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLoginState({ status: "idle" })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss error"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {isActive && loginState.status === "waiting_auth" && (
              <FlowPanel>
                <div className="flex items-start gap-2.5">
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      Waiting for you to finish signing in
                    </p>
                    <p className="mt-0.5 text-xs/relaxed text-muted-foreground">
                      {loginState.instructions ??
                        "A sign-in page opened in your browser. Come back here when you're done."}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto justify-start px-0"
                      onClick={() => void handleOpenExternal(loginState.url)}
                    >
                      <ExternalLink data-icon="inline-start" />
                      Reopen sign-in page
                    </Button>
                  </div>
                </div>
              </FlowPanel>
            )}

            {isActive && loginState.status === "waiting_prompt" && (
              <FlowPanel>
                <p className="mb-2 text-xs font-medium">{loginState.message}</p>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    placeholder={loginState.placeholder ?? "Enter code"}
                    className="font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePromptSubmit()
                    }}
                  />
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={handlePromptSubmit}
                    disabled={!promptValue.trim()}
                  >
                    Submit
                  </Button>
                </div>
              </FlowPanel>
            )}

            {isActive && loginState.status === "waiting_device_code" && (
              <DeviceCodePanel
                userCode={loginState.userCode}
                onOpenVerification={() =>
                  void handleOpenExternal(loginState.verificationUri)
                }
              />
            )}

            {isActive && loginState.status === "waiting_select" && (
              <FlowPanel>
                <p className="mb-2 text-xs font-medium">{loginState.message}</p>
                <div className="flex flex-col gap-1.5">
                  {loginState.options.map((opt) => (
                    <Button
                      key={opt.id}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => handleSelectOption(opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </FlowPanel>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── API Keys ──────────────────────────────────────────────────────────────────

/** "sk-ant-api03-…x7Kq" style preview of a saved key. */
function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••"
  return `••••••••${key.slice(-4)}`
}

interface ConfigureKeyDialogProps {
  provider: ApiKeyProvider
  savedKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (id: string, key: string) => void
  isSaving: boolean
}

function ConfigureKeyDialog({
  provider,
  savedKey,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: ConfigureKeyDialogProps) {
  const [value, setValue] = useState(savedKey)
  const [visible, setVisible] = useState(false)
  const openExternalMutation = useOpenExternal()

  function openKeyUrl(url: string) {
    void openExternalMutation
      .mutateAsync(url)
      .then((opened) => {
        if (!opened) window.open(url, "_blank")
      })
      .catch(() => window.open(url, "_blank"))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2.5">
              <ProviderTile providerId={provider.id} className="size-7" />
              {savedKey ? "Edit" : "Add"} {provider.label} key
            </span>
          </DialogTitle>
          <DialogDescription>
            Stored locally in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-2xs">
              ~/.pi/agent/auth.json
            </code>{" "}
            — it never leaves your machine.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="py-1">
          <Field>
            <FieldLabel htmlFor={`${provider.id}-api-key`}>API key</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${provider.id}-api-key`}
                autoFocus
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={provider.placeholder}
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave(provider.id, value)
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Hide API key" : "Show API key"}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {provider.keyUrl && (
              <Button
                variant="link"
                size="sm"
                className="h-auto justify-start px-0"
                onClick={() => openKeyUrl(provider.keyUrl!)}
              >
                <ExternalLink data-icon="inline-start" />
                Get an API key from {provider.label}
              </Button>
            )}
          </Field>
        </FieldGroup>

        <DialogFooter>
          {savedKey && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => onSave(provider.id, "")}
              disabled={isSaving}
            >
              Remove key
            </Button>
          )}
          <DialogClose
            render={<Button variant="outline" />}
            disabled={isSaving}
          >
            Cancel
          </DialogClose>
          <Button
            onClick={() => onSave(provider.id, value)}
            disabled={isSaving || value === savedKey || !value.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 data-icon="inline-start" className="animate-spin" />
                Saving
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

function ApiKeyRow({
  provider,
  savedKey,
  onOpen,
}: {
  provider: ApiKeyProvider
  savedKey: string
  onOpen: () => void
}) {
  const hasKey = savedKey.length > 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/row flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ProviderTile providerId={provider.id} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm">{provider.label}</span>
          {hasKey && <ConnectedBadge>Configured</ConnectedBadge>}
        </span>
        {hasKey && (
          <span className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">
            {maskKey(savedKey)}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100">
        {hasKey ? "Edit" : "Add key"}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
    </button>
  )
}

function ApiKeyGroup({
  label,
  providers,
  savedKeys,
  onOpen,
}: {
  label?: string
  providers: ApiKeyProvider[]
  savedKeys: Record<string, string>
  onOpen: (id: string) => void
}) {
  if (providers.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      )}
      <div className="-mx-2 flex flex-col">
        {providers.map((p) => (
          <ApiKeyRow
            key={p.id}
            provider={p}
            savedKey={savedKeys[p.id] ?? ""}
            onOpen={() => onOpen(p.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function ApiKeysCard() {
  const { data: savedKeys, isLoading } = useProviders()
  const { mutate: saveProviders, isPending } = useUpdateProviders()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const keys = useMemo(() => savedKeys ?? {}, [savedKeys])
  const query = search.trim().toLowerCase()

  const { searchResults, configured, popular, more } = useMemo(() => {
    if (query) {
      return {
        searchResults: API_KEY_PROVIDERS.filter(
          (p) => p.label.toLowerCase().includes(query) || p.id.includes(query)
        ),
        configured: [],
        popular: [],
        more: [],
      }
    }
    const configured = API_KEY_PROVIDERS.filter((p) => keys[p.id])
    const rest = API_KEY_PROVIDERS.filter((p) => !keys[p.id])
    return {
      searchResults: null,
      configured,
      popular: rest.filter((p) => POPULAR_PROVIDER_IDS.includes(p.id)),
      more: rest
        .filter((p) => !POPULAR_PROVIDER_IDS.includes(p.id))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  }, [keys, query])

  function handleSave(id: string, key: string) {
    saveProviders({ ...keys, [id]: key }, { onSuccess: () => setOpenFor(null) })
  }

  if (isLoading) return <ProviderListSkeleton rows={4} />

  const openProvider = openFor
    ? API_KEY_PROVIDERS.find((p) => p.id === openFor)
    : null

  return (
    <div className="flex flex-col gap-5">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search providers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {searchResults ? (
        searchResults.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
            No providers match &ldquo;{search.trim()}&rdquo;
          </p>
        ) : (
          <ApiKeyGroup
            providers={searchResults}
            savedKeys={keys}
            onOpen={setOpenFor}
          />
        )
      ) : (
        <>
          <ApiKeyGroup
            label="Configured"
            providers={configured}
            savedKeys={keys}
            onOpen={setOpenFor}
          />
          <ApiKeyGroup
            label="Popular"
            providers={popular}
            savedKeys={keys}
            onOpen={setOpenFor}
          />
          <ApiKeyGroup
            label="More providers"
            providers={more}
            savedKeys={keys}
            onOpen={setOpenFor}
          />
        </>
      )}

      {openProvider && (
        <ConfigureKeyDialog
          key={openProvider.id}
          provider={openProvider}
          savedKey={keys[openProvider.id] ?? ""}
          open={true}
          onOpenChange={(open) => {
            if (!open) setOpenFor(null)
          }}
          onSave={handleSave}
          isSaving={isPending}
        />
      )}
    </div>
  )
}
