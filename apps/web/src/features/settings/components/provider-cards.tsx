import { useState, useRef, useMemo } from "react"
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
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
import { Card, CardContent } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
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

export const API_KEY_PROVIDERS: {
  id: string
  label: string
  placeholder: string
}[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "google", label: "Google Gemini", placeholder: "AIza..." },
  { id: "google-vertex", label: "Google Vertex", placeholder: "..." },
  { id: "amazon-bedrock", label: "Amazon Bedrock", placeholder: "..." },
  { id: "mistral", label: "Mistral", placeholder: "..." },
  { id: "groq", label: "Groq", placeholder: "gsk_..." },
  { id: "cerebras", label: "Cerebras", placeholder: "..." },
  { id: "xai", label: "xAI", placeholder: "xai-..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
  { id: "vercel-ai-gateway", label: "Vercel AI Gateway", placeholder: "..." },
  { id: "huggingface", label: "Hugging Face", placeholder: "hf_..." },
  { id: "fireworks", label: "Fireworks", placeholder: "fw_..." },
  { id: "fireworks-inference", label: "Fireworks Inference", placeholder: "fw_..." },
  { id: "kimi-coding", label: "Kimi For Coding", placeholder: "..." },
  { id: "minimax", label: "MiniMax", placeholder: "..." },
  { id: "minimax-cn", label: "MiniMax (China)", placeholder: "..." },
  { id: "zai", label: "ZAI", placeholder: "..." },
  { id: "opencode", label: "OpenCode Zen", placeholder: "..." },
  { id: "opencode-go", label: "OpenCode Go", placeholder: "..." },
  { id: "azure-openai-responses", label: "Azure OpenAI", placeholder: "..." },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-..." },
  { id: "ollama", label: "Ollama", placeholder: "localhost" },
  { id: "sglang", label: "SGLang", placeholder: "http://localhost..." },
  { id: "lmstudio", label: "LM Studio", placeholder: "http://localhost..." },
  { id: "vllm", label: "vLLM", placeholder: "http://localhost..." },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-..." },
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

function SuccessBadge({ children }: { children: string }) {
  return (
    <Badge variant="secondary">
      <Check data-icon="inline-start" />
      {children}
    </Badge>
  )
}

function ProviderIcon({
  providerId,
  className,
}: {
  providerId: string
  className?: string
}) {
  const { icon } = getProviderMeta(providerId)
  return <span className={cn("flex shrink-0", className)}>{icon}</span>
}

// ── Subscriptions (OAuth) ─────────────────────────────────────────────────────

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
      status: "waiting_prompt"
      providerId: string
      loginId: string
      promptId: string
      message: string
      placeholder?: string
    }
  | { status: "done"; providerId: string }
  | { status: "error"; providerId: string; message: string }

type OAuthWsEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string }

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
      if (wsMessageHandlerRef.current) wsRef.current.removeEventListener("message", wsMessageHandlerRef.current)
      if (wsErrorHandlerRef.current) wsRef.current.removeEventListener("error", wsErrorHandlerRef.current)
      if (wsCloseHandlerRef.current) wsRef.current.removeEventListener("close", wsCloseHandlerRef.current)
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
        setLoginState({ status: "error", providerId, message: "Connection lost" })
      }
    }

    const closeHandler = () => {
      if (!completed) {
        wsRef.current = null
        setLoginState({ status: "error", providerId, message: "Connection lost" })
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

  async function handleAbort() {
    closeWebSocket()
    if (
      loginState.status === "waiting_auth" ||
      loginState.status === "waiting_prompt" ||
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !providers?.length ? (
          <p className="text-xs text-muted-foreground">
            No OAuth providers available.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((p, i) => {
              const isActive = activeProviderId === p.id
              const isPending = isActive && loginState.status === "connecting"
              const isDone = isActive && loginState.status === "done"
              const showSignedIn = (p.loggedIn && !isActive) || isDone

              return (
                <div key={p.id} className="flex flex-col gap-2">
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ProviderIcon providerId={p.id} className="h-4 w-4" />
                      <p className="text-sm font-medium">{p.name}</p>
                      {showSignedIn && <SuccessBadge>Signed in</SuccessBadge>}
                      {isActive && loginState.status === "error" && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {loginState.message}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.loggedIn && !isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleLogout(p.id)}
                        >
                          <LogOut data-icon="inline-start" />
                          Sign out
                        </Button>
                      ) : isActive &&
                        loginState.status !== "idle" &&
                        loginState.status !== "done" &&
                        loginState.status !== "error" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleAbort}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={
                            isPending ||
                            (activeProviderId !== null &&
                              activeProviderId !== p.id)
                          }
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
                          {isPending ? "Connecting…" : "Sign in"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isActive && loginState.status === "waiting_auth" && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">
                            Browser opened for authentication
                          </p>
                          {loginState.instructions && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {loginState.instructions}
                            </p>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto justify-start px-0"
                            onClick={() =>
                              void handleOpenExternal(loginState.url)
                            }
                          >
                            <ExternalLink data-icon="inline-start" />
                            Open again
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isActive && loginState.status === "waiting_prompt" && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                      <p className="mb-2 text-xs font-medium">
                        {loginState.message}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={promptValue}
                          onChange={(e) => setPromptValue(e.target.value)}
                          placeholder={loginState.placeholder ?? "Enter code…"}
                          className="h-7 font-mono text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handlePromptSubmit()
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-7 shrink-0 text-xs"
                          onClick={handlePromptSubmit}
                          disabled={!promptValue.trim()}
                        >
                          Submit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── API Keys ──────────────────────────────────────────────────────────────────

interface ConfigureKeyDialogProps {
  provider: { id: string; label: string; placeholder: string }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Configure {provider.label}</DialogTitle>
          <DialogDescription>
            Enter your API key for {provider.label}. It will be saved to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              ~/.pi/agent/auth.json
            </code>
            .
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
            disabled={isSaving || value === savedKey}
          >
            {isSaving ? (
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

export function ApiKeysCard() {
  const { data: savedKeys, isLoading } = useProviders()
  const { mutate: saveProviders, isPending } = useUpdateProviders()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const filteredProviders = useMemo(
    () =>
      search.trim()
        ? API_KEY_PROVIDERS.filter((p) =>
            p.label.toLowerCase().includes(search.toLowerCase())
          )
        : API_KEY_PROVIDERS,
    [search]
  )

  const configuredCount = API_KEY_PROVIDERS.filter(
    (p) => !!savedKeys?.[p.id]
  ).length

  function handleSave(id: string, key: string) {
    saveProviders(
      { ...savedKeys, [id]: key },
      { onSuccess: () => setOpenFor(null) }
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search providers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {configuredCount > 0 && (
                <Badge variant="secondary">{configuredCount} configured</Badge>
              )}
            </div>

            <div className="flex flex-col gap-0">
              {filteredProviders.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No providers match
                </p>
              ) : (
                filteredProviders.map(({ id, label, placeholder }, i) => {
                  const hasKey = !!savedKeys?.[id]
                  return (
                    <div
                      key={id}
                      className={cn(
                        "flex items-center justify-between px-1 py-2",
                        i < filteredProviders.length - 1 &&
                          "border-b border-border/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <ProviderIcon providerId={id} className="h-4 w-4" />
                        <p className="text-sm">{label}</p>
                        {hasKey && <SuccessBadge>Configured</SuccessBadge>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setOpenFor(id)}
                      >
                        {hasKey ? "Edit" : "Configure"}
                      </Button>
                      {openFor === id && (
                        <ConfigureKeyDialog
                          provider={{ id, label, placeholder }}
                          savedKey={savedKeys?.[id] ?? ""}
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
                })
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
