import React, { useState, useRef } from "react"
import {
  Sun,
  Moon,
  Monitor,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Check,
  Save,
  LogIn,
  LogOut,
  Loader2,
  ExternalLink,
  RotateCcw,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent } from "@/shared/ui/card"
import { Toggle } from "@/shared/ui/toggle"
import { useOpenExternal } from "@/features/electron"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/shared/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import { Textarea } from "@/shared/ui/textarea"
import { useShowThinkingSetting } from "@/shared/lib/thinking-visibility"
import { useWorkspace } from "@/features/workspace"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import { useTheme } from "@/shared/components/theme-provider"
import {
  useProviders,
  useOAuthProviders,
  oauthProvidersQueryKey,
} from "../queries"
import { modelsQueryKey } from "@/features/chat/queries"
import {
  useAbortOAuthLogin,
  useOAuthLogout,
  useOpenOAuthEventSource,
  useRespondToOAuthPrompt,
  useStartOAuthLogin,
  useUpdateProviders,
} from "../mutations"

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

const API_KEY_PROVIDERS: { id: string; label: string; placeholder: string }[] =
  [
    { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
    { id: "openai", label: "OpenAI", placeholder: "sk-..." },
    { id: "google", label: "Google Gemini", placeholder: "AIza..." },
    { id: "mistral", label: "Mistral", placeholder: "..." },
    { id: "groq", label: "Groq", placeholder: "gsk_..." },
    { id: "cerebras", label: "Cerebras", placeholder: "..." },
    { id: "xai", label: "xAI", placeholder: "xai-..." },
    { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
    { id: "vercel-ai-gateway", label: "Vercel AI Gateway", placeholder: "..." },
    { id: "huggingface", label: "Hugging Face", placeholder: "hf_..." },
    { id: "kimi-coding", label: "Kimi For Coding", placeholder: "..." },
    { id: "minimax", label: "MiniMax", placeholder: "..." },
    { id: "minimax-cn", label: "MiniMax (China)", placeholder: "..." },
    { id: "zai", label: "ZAI", placeholder: "..." },
    { id: "opencode", label: "OpenCode Zen", placeholder: "..." },
    { id: "opencode-go", label: "OpenCode Go", placeholder: "..." },
    { id: "azure-openai-responses", label: "Azure OpenAI", placeholder: "..." },
  ]

export function SettingsPage() {
  const { resetAll } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const activeTheme = THEMES.find(({ value }) => value === theme) ?? THEMES[0]
  const ActiveThemeIcon = activeTheme.icon

  async function handleReset() {
    setResetting(true)
    try {
      await resetAll()
      setShowConfirm(false)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pt-8 pb-12">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your preferences and application data.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          {/* Appearance */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Appearance"
              description="Choose how the application looks."
            />
            <Card>
              <CardContent className="p-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Theme</FieldTitle>
                    <FieldDescription>
                      Press{" "}
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        D
                      </kbd>{" "}
                      to toggle quickly.
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    value={theme}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setTheme(value as Theme)
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-32" aria-label="Theme">
                      <ActiveThemeIcon data-icon="inline-start" />
                      <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {THEMES.map(({ value, label, icon: Icon }) => (
                          <SelectItem key={value} value={value}>
                            <Icon />
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Chat"
              description="Control how assistant responses are displayed."
            />
            <ChatPreferencesCard />
          </section>

          {/* Subscriptions (OAuth) */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Subscriptions"
              description="Sign in with your existing subscriptions (Claude Pro, GitHub Copilot, etc.). Credentials stored in auth.json."
            />
            <SubscriptionsCard />
          </section>

          {/* API Keys */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="API Keys"
              description="Configure API keys for each provider. Stored in ~/.pi/agent/auth.json."
            />
            <ApiKeysCard />
          </section>

          {/* AI Commit Messages */}
          <section className="flex flex-col gap-3" id="commit-prompt">
            <SectionHeader
              title="AI Commit Messages"
              description="Customize the prompt used to generate commit messages. Use {diff} where the staged diff should be inserted."
            />
            <CommitPromptCard />
          </section>

          {/* Data */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Data"
              description="Manage your locally stored application data."
            />
            <Card>
              <CardContent className="p-4">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div>
                        <p className="text-sm font-medium">Delete all data</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Permanently removes all workspaces, threads, and
                          messages. This cannot be undone.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setShowConfirm(true)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete all
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <footer className="flex items-center gap-2 pt-2">
            λ<span className="font-mono text-xs">Code</span>
            <Badge variant="outline">Alpha</Badge>
          </footer>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all workspaces, threads, and
              messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
              disabled={resetting}
            >
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Subscriptions (OAuth) card ─────────────────────────────────────────────────

function ChatPreferencesCard() {
  const showThinking = useShowThinkingSetting()
  const updateSetting = useUpdateAppSetting()

  const handleToggle = (pressed: boolean) => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.SHOW_THINKING,
      value: pressed ? "1" : "0",
    })
  }

  return (
    <Card>
      <CardContent className="p-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Show model thinking</FieldTitle>
            <FieldDescription>
              Display streamed reasoning blocks in chat when the selected model
              emits thinking deltas.
            </FieldDescription>
          </FieldContent>
          <Toggle
            pressed={showThinking}
            onPressedChange={handleToggle}
            variant="outline"
            aria-label="Show model thinking"
            className="min-w-24 justify-center"
          >
            {showThinking ? (
              <Eye data-icon="inline-start" />
            ) : (
              <EyeOff data-icon="inline-start" />
            )}
            {showThinking ? "Visible" : "Hidden"}
          </Toggle>
        </Field>
      </CardContent>
    </Card>
  )
}

// ── Subscriptions (OAuth) card ─────────────────────────────────────────────────

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

type OAuthSseEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string }

function SuccessBadge({ children }: { children: string }) {
  return (
    <Badge variant="secondary">
      <Check data-icon="inline-start" />
      {children}
    </Badge>
  )
}

function SubscriptionsCard() {
  const queryClient = useQueryClient()
  const { data: providers, isLoading } = useOAuthProviders()
  const openExternalMutation = useOpenExternal()
  const startOAuthLoginMutation = useStartOAuthLogin()
  const openOAuthEventSourceMutation = useOpenOAuthEventSource()
  const respondToOAuthPromptMutation = useRespondToOAuthPrompt()
  const abortOAuthLoginMutation = useAbortOAuthLogin()
  const oauthLogoutMutation = useOAuthLogout()
  const [loginState, setLoginState] = useState<LoginState>({ status: "idle" })
  const [promptValue, setPromptValue] = useState("")
  const esRef = useRef<EventSource | null>(null)

  function closeEventSource() {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }

  async function handleOpenExternal(url: string) {
    try {
      const opened = await openExternalMutation.mutateAsync(url)
      if (!opened) {
        window.open(url, "_blank")
      }
    } catch {
      window.open(url, "_blank")
    }
  }

  async function handleLogin(providerId: string) {
    closeEventSource()
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

    let es: EventSource
    try {
      es = await openOAuthEventSourceMutation.mutateAsync(loginId)
    } catch (err) {
      setLoginState({
        status: "error",
        providerId,
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    let completed = false
    esRef.current = es

    es.addEventListener("auth_url", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & {
        type: "auth_url"
      }
      setLoginState({
        status: "waiting_auth",
        providerId,
        loginId,
        url: event.url,
        instructions: event.instructions,
      })
      void handleOpenExternal(event.url)
    })

    es.addEventListener("prompt", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & {
        type: "prompt"
      }
      setPromptValue("")
      setLoginState({
        status: "waiting_prompt",
        providerId,
        loginId,
        promptId: event.promptId,
        message: event.message,
        placeholder: event.placeholder,
      })
    })

    es.addEventListener("done", () => {
      completed = true
      closeEventSource()
      setLoginState({ status: "done", providerId })
      queryClient.invalidateQueries({ queryKey: oauthProvidersQueryKey })
      queryClient.invalidateQueries({ queryKey: modelsQueryKey })
      setTimeout(() => setLoginState({ status: "idle" }), 2000)
    })

    es.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        // SSE message with event: error — auth flow error from server
        const event = JSON.parse(e.data) as OAuthSseEvent & { type: "error" }
        completed = true
        closeEventSource()
        setLoginState({ status: "error", providerId, message: event.message })
      } else {
        // EventSource connection error
        closeEventSource()
        if (!completed) {
          setLoginState({
            status: "error",
            providerId,
            message: "Connection lost",
          })
        }
      }
    })
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
    closeEventSource()
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
        // Ignore abort failures when the login flow has already ended.
      }
    }
    setLoginState({ status: "idle" })
  }

  async function handleLogout(providerId: string) {
    try {
      await oauthLogoutMutation.mutateAsync(providerId)
    } catch {
      // Ignore logout failures and keep the current provider state visible.
    }
  }

  const activeProviderId =
    loginState.status !== "idle"
      ? (loginState as { providerId: string }).providerId
      : null

  return (
    <>
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
                        <p className="text-sm font-medium">{p.name}</p>
                        {showSignedIn && <SuccessBadge>Signed in</SuccessBadge>}
                        {isActive && loginState.status === "error" && (
                          <span className="text-[10px] text-destructive">
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

                    {/* Auth URL waiting state */}
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
                              onClick={() => {
                                void handleOpenExternal(loginState.url)
                              }}
                            >
                              <ExternalLink data-icon="inline-start" />
                              Open again
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prompt input state */}
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
                            placeholder={
                              loginState.placeholder ?? "Enter code…"
                            }
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
    </>
  )
}

// ── API Keys card ──────────────────────────────────────────────────────────────

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

  function handleSave() {
    onSave(provider.id, value)
  }

  function handleRemove() {
    onSave(provider.id, "")
  }

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
                  if (e.key === "Enter") handleSave()
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={() => setVisible((current) => !current)}
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
              onClick={handleRemove}
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
            onClick={handleSave}
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

function ApiKeysCard() {
  const { data: savedKeys, isLoading } = useProviders()
  const { mutate: saveProviders, isPending } = useUpdateProviders()
  const [openFor, setOpenFor] = useState<string | null>(null)

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
          <div className="flex flex-col gap-1">
            {API_KEY_PROVIDERS.map(({ id, label, placeholder }) => {
              const hasKey = !!savedKeys?.[id]
              return (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {hasKey && <SuccessBadge>Configured</SuccessBadge>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setOpenFor(id)}
                  >
                    Configure
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
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Commit prompt card ─────────────────────────────────────────────────────────

const DEFAULT_COMMIT_PROMPT = `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`

function CommitPromptCard() {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()
  const persistedValue = settings?.[APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT] ?? DEFAULT_COMMIT_PROMPT
  const [value, setValue] = useState(persistedValue)
  const [saved, setSaved] = useState(false)

  // Sync local state when persisted value loads without clobbering unsaved edits.
  const prevPersistedRef = React.useRef(persistedValue)
  React.useEffect(() => {
    if (
      prevPersistedRef.current !== persistedValue &&
      value === prevPersistedRef.current
    ) {
      prevPersistedRef.current = persistedValue
      setValue(persistedValue)
    }
  }, [persistedValue, value])

  function handleSave() {
    const trimmed = value.trim()
    updateSetting.mutate({ key: APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT, value: trimmed })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function handleReset() {
    setValue(DEFAULT_COMMIT_PROMPT)
    updateSetting.mutate({ key: APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT, value: DEFAULT_COMMIT_PROMPT })
  }

  const isDefault = value.trim() === DEFAULT_COMMIT_PROMPT
  const hasDiffPlaceholder = value.includes("{diff}")

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <FieldGroup>
          <Field data-invalid={!hasDiffPlaceholder || undefined}>
            <FieldLabel htmlFor="commit-message-prompt">Prompt</FieldLabel>
            <FieldDescription>
              Use{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code>{" "}
              where the staged diff should be inserted.
            </FieldDescription>
            <Textarea
              id="commit-message-prompt"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setSaved(false)
              }}
              rows={6}
              className="min-h-32 resize-y font-mono text-xs"
              spellCheck={false}
              aria-invalid={!hasDiffPlaceholder || undefined}
            />
            {!hasDiffPlaceholder && (
              <FieldError>
                Prompt must contain{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code>{" "}
                — it will be replaced with the staged diff.
              </FieldError>
            )}
          </Field>
        </FieldGroup>
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            disabled={isDefault}
            onClick={handleReset}
          >
            <RotateCcw data-icon="inline-start" />
            Reset to default
          </Button>
          <Button
            size="sm"
            className="px-3"
            disabled={!hasDiffPlaceholder || saved}
            onClick={handleSave}
          >
            {saved ? (
              <>
                <Check data-icon="inline-start" />
                Saved
              </>
            ) : (
              <>
                <Save data-icon="inline-start" />
                Save
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
