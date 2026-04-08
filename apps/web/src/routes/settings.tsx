import { useState, useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Sun, Moon, Monitor, Trash2, AlertTriangle, Eye, EyeOff, Check, Save,
  LogIn, LogOut, Loader2, ExternalLink, RotateCcw,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useWorkspace } from "@/hooks/workspace-context"
import { COMMIT_PROMPT_STORAGE_KEY } from "@/components/commit-dialog"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { useProviders } from "@/queries/use-providers"
import { useUpdateProviders } from "@/mutations/use-update-providers"
import { useOAuthProviders } from "@/queries/use-oauth-providers"
import { oauthProvidersQueryKey } from "@/queries/use-oauth-providers"
import {
  startOAuthLogin, openOAuthEventSource, respondToOAuthPrompt,
  abortOAuthLogin, oauthLogout, type OAuthSseEvent,
} from "@/api/oauth"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

const API_KEY_PROVIDERS: { id: string; label: string; placeholder: string }[] = [
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

function SettingsPage() {
  const { resetAll } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

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
      <div className="mx-auto w-full max-w-2xl px-6 pb-12 pt-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your preferences and application data.
          </p>
        </div>

        <div className="space-y-8">
          {/* Appearance */}
          <section className="space-y-3">
            <SectionHeader
              title="Appearance"
              description="Choose how the application looks."
            />
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">Theme</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Press{" "}
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        D
                      </kbd>{" "}
                      to toggle quickly.
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-lg border border-border p-1">
                    {THEMES.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          theme === value
                            ? "bg-foreground text-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Subscriptions (OAuth) */}
          <section className="space-y-3">
            <SectionHeader
              title="Subscriptions"
              description="Sign in with your existing subscriptions (Claude Pro, GitHub Copilot, etc.). Credentials stored in auth.json."
            />
            <SubscriptionsCard />
          </section>

          {/* API Keys */}
          <section className="space-y-3">
            <SectionHeader
              title="API Keys"
              description="Configure API keys for each provider. Stored in ~/.pi/agent/auth.json."
            />
            <ApiKeysCard />
          </section>

          {/* AI Commit Messages */}
          <section className="space-y-3" id="commit-prompt">
            <SectionHeader
              title="AI Commit Messages"
              description="Customize the prompt used to generate commit messages. Use {diff} where the staged diff should be inserted."
            />
            <CommitPromptCard />
          </section>

          {/* Data */}
          <section className="space-y-3">
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
                          Permanently removes all workspaces, threads, and messages. This cannot be undone.
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

          {/* About */}
          <section className="space-y-3">
            <SectionHeader
              title="About"
              description="Application information."
            />
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Row label="Version" value="0.0.1" />
                  <Separator />
                  <Row label="Runtime" value="Electron + React 19" />
                  <Separator />
                  <Row label="Data location" value="Local storage" />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all workspaces, threads, and messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={resetting}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Subscriptions (OAuth) card ─────────────────────────────────────────────────

type LoginState =
  | { status: "idle" }
  | { status: "connecting"; providerId: string }
  | { status: "waiting_auth"; providerId: string; loginId: string; url: string; instructions?: string }
  | { status: "waiting_prompt"; providerId: string; loginId: string; promptId: string; message: string; placeholder?: string }
  | { status: "done"; providerId: string }
  | { status: "error"; providerId: string; message: string }

function SubscriptionsCard() {
  const queryClient = useQueryClient()
  const { data: providers, isLoading } = useOAuthProviders()
  const [loginState, setLoginState] = useState<LoginState>({ status: "idle" })
  const [promptValue, setPromptValue] = useState("")
  const esRef = useRef<EventSource | null>(null)

  function closeEventSource() {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }

  async function handleLogin(providerId: string) {
    closeEventSource()
    setLoginState({ status: "connecting", providerId })

    let loginId: string
    try {
      loginId = await startOAuthLogin(providerId)
    } catch (err) {
      setLoginState({ status: "error", providerId, message: err instanceof Error ? err.message : String(err) })
      return
    }

    const es = openOAuthEventSource(loginId)
    esRef.current = es

    es.addEventListener("auth_url", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & { type: "auth_url" }
      setLoginState({ status: "waiting_auth", providerId, loginId, url: event.url, instructions: event.instructions })
      // Open in browser via Electron
      window.electronAPI?.openExternal(event.url)
        ?? window.open(event.url, "_blank")
    })

    es.addEventListener("prompt", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & { type: "prompt" }
      setPromptValue("")
      setLoginState({ status: "waiting_prompt", providerId, loginId, promptId: event.promptId, message: event.message, placeholder: event.placeholder })
    })

    es.addEventListener("done", () => {
      closeEventSource()
      setLoginState({ status: "done", providerId })
      queryClient.invalidateQueries({ queryKey: oauthProvidersQueryKey })
      setTimeout(() => setLoginState({ status: "idle" }), 2000)
    })

    es.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        // SSE message with event: error — auth flow error from server
        const event = JSON.parse(e.data) as OAuthSseEvent & { type: "error" }
        closeEventSource()
        setLoginState({ status: "error", providerId, message: event.message })
      } else {
        // EventSource connection error
        closeEventSource()
        if (loginState.status !== "done") {
          setLoginState({ status: "error", providerId, message: "Connection lost" })
        }
      }
    })
  }

  async function handlePromptSubmit() {
    if (loginState.status !== "waiting_prompt") return
    const { loginId, promptId } = loginState
    setLoginState((s) => ({ ...s, status: "connecting" } as LoginState))
    await respondToOAuthPrompt(loginId, promptId, promptValue)
    setPromptValue("")
  }

  async function handleAbort() {
    closeEventSource()
    if (loginState.status === "waiting_auth" || loginState.status === "waiting_prompt" || loginState.status === "connecting") {
      try { await abortOAuthLogin((loginState as { loginId?: string }).loginId ?? "") } catch {}
    }
    setLoginState({ status: "idle" })
  }

  async function handleLogout(providerId: string) {
    try {
      await oauthLogout(providerId)
      queryClient.invalidateQueries({ queryKey: oauthProvidersQueryKey })
    } catch {}
  }

  const activeProviderId =
    loginState.status !== "idle" ? (loginState as { providerId: string }).providerId : null

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : !providers?.length ? (
            <p className="text-xs text-muted-foreground">No OAuth providers available.</p>
          ) : (
            <div className="space-y-3">
              {providers.map((p, i) => {
                const isActive = activeProviderId === p.id
                const isPending = isActive && (loginState.status === "connecting")
                const isDone = isActive && loginState.status === "done"

                return (
                  <div key={p.id}>
                    {i > 0 && <Separator className="mb-3" />}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{p.name}</p>
                        {p.loggedIn && !isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                            <Check className="h-2.5 w-2.5" />
                            Signed in
                          </span>
                        )}
                        {isDone && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                            <Check className="h-2.5 w-2.5" />
                            Signed in
                          </span>
                        )}
                        {isActive && loginState.status === "error" && (
                          <span className="text-[10px] text-destructive">{loginState.message}</span>
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
                            <LogOut className="mr-1.5 h-3 w-3" />
                            Sign out
                          </Button>
                        ) : isActive && loginState.status !== "idle" && loginState.status !== "done" && loginState.status !== "error" ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAbort}>
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={isPending || (activeProviderId !== null && activeProviderId !== p.id)}
                            onClick={() => handleLogin(p.id)}
                          >
                            {isPending ? (
                              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            ) : (
                              <LogIn className="mr-1.5 h-3 w-3" />
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
                            <p className="text-xs font-medium">Browser opened for authentication</p>
                            {loginState.instructions && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{loginState.instructions}</p>
                            )}
                            <button
                              onClick={() => {
                                window.electronAPI?.openExternal(loginState.url)
                                  ?? window.open(loginState.url, "_blank")
                              }}
                              className="mt-1 flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open again
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prompt input state */}
                    {isActive && loginState.status === "waiting_prompt" && (
                      <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                        <p className="mb-2 text-xs font-medium">{loginState.message}</p>
                        <div className="flex gap-2">
                          <Input
                            autoFocus
                            value={promptValue}
                            onChange={(e) => setPromptValue(e.target.value)}
                            placeholder={loginState.placeholder ?? "Enter code…"}
                            className="h-7 text-xs font-mono"
                            onKeyDown={(e) => { if (e.key === "Enter") handlePromptSubmit() }}
                          />
                          <Button size="sm" className="h-7 shrink-0 text-xs" onClick={handlePromptSubmit} disabled={!promptValue.trim()}>
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

function ConfigureKeyDialog({ provider, savedKey, open, onOpenChange, onSave, isSaving }: ConfigureKeyDialogProps) {
  const [value, setValue] = useState(savedKey)
  const [visible, setVisible] = useState(false)

  // Sync when dialog opens
  useEffect(() => {
    if (open) {
      setValue(savedKey)
      setVisible(false)
    }
  }, [open, savedKey])

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
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/.pi/agent/auth.json</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="relative">
            <Input
              autoFocus
              type={visible ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={provider.placeholder}
              className="pr-9 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

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
          <DialogClose render={<Button variant="outline" />} disabled={isSaving}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving || value === savedKey}>
            {isSaving ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
            ) : (
              <><Save className="mr-1.5 h-3.5 w-3.5" />Save</>
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
      { ...(savedKeys ?? {}), [id]: key },
      { onSuccess: () => setOpenFor(null) },
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-1">
            {API_KEY_PROVIDERS.map(({ id, label, placeholder }) => {
              const hasKey = !!(savedKeys?.[id])
              return (
                <div key={id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {hasKey && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                        <Check className="h-2.5 w-2.5" />
                        Configured
                      </span>
                    )}
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
                      onOpenChange={(open) => { if (!open) setOpenFor(null) }}
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

const DEFAULT_COMMIT_PROMPT =
  `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`

function CommitPromptCard() {
  const [value, setValue] = useState(
    () => localStorage.getItem(COMMIT_PROMPT_STORAGE_KEY) ?? DEFAULT_COMMIT_PROMPT
  )
  const [saved, setSaved] = useState(false)

  function handleSave() {
    const trimmed = value.trim()
    if (trimmed === DEFAULT_COMMIT_PROMPT) {
      localStorage.removeItem(COMMIT_PROMPT_STORAGE_KEY)
    } else {
      localStorage.setItem(COMMIT_PROMPT_STORAGE_KEY, trimmed)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function handleReset() {
    setValue(DEFAULT_COMMIT_PROMPT)
    localStorage.removeItem(COMMIT_PROMPT_STORAGE_KEY)
  }

  const isDefault = value.trim() === DEFAULT_COMMIT_PROMPT
  const hasDiffPlaceholder = value.includes("{diff}")

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false) }}
          rows={6}
          className="w-full resize-y rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          spellCheck={false}
        />
        {!hasDiffPlaceholder && (
          <p className="text-xs text-destructive">
            Prompt must contain <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code> — it will be replaced with the staged diff.
          </p>
        )}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={isDefault}
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </Button>
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={!hasDiffPlaceholder || saved}
            onClick={handleSave}
          >
            {saved ? (
              <><Check className="mr-1.5 h-3 w-3" />Saved</>
            ) : (
              <><Save className="mr-1.5 h-3 w-3" />Save</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  )
}
