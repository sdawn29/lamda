import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
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
  X,
  Search,
  Palette,
  MessageSquare,
  Key,
  GitBranch,
  Keyboard,
  Database,
  ChevronRight,
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
import {
  useShowThinkingSetting,
  useThinkingPhrases,
  DEFAULT_THINKING_PHRASES,
} from "@/shared/lib/thinking-visibility"
import { useWorkspace } from "@/features/workspace"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import { useTheme } from "@/shared/components/theme-provider"
import { useKeyboardShortcuts } from "@/shared/components/keyboard-shortcuts-provider"
import { ShortcutKbd } from "@/shared/ui/kbd"
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  SHORTCUT_ACTION_ORDER,
  DEFAULT_SHORTCUTS,
  eventToBinding,
  type ShortcutAction,
} from "@/shared/lib/keyboard-shortcuts"
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
import { cn } from "@/shared/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "system"

// ── Constants ──────────────────────────────────────────────────────────────────

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

interface SettingsSection {
  id: string
  label: string
  icon: React.ElementType
  description: string
  keywords: string[]
}

const SECTIONS: SettingsSection[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Theme and visual preferences",
    keywords: ["theme", "dark", "light", "system", "color", "mode"],
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    description: "Response display and thinking indicators",
    keywords: [
      "thinking",
      "reasoning",
      "phrases",
      "loading",
      "indicator",
      "model",
      "visible",
      "hidden",
    ],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: Key,
    description: "OAuth sign-in for Claude Pro, GitHub Copilot, etc.",
    keywords: ["oauth", "subscription", "sign in", "claude pro", "copilot", "login"],
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: Key,
    description: "Provider API keys stored in auth.json",
    keywords: [
      "api key",
      "anthropic",
      "openai",
      "google",
      "mistral",
      "groq",
      "xai",
      "provider",
      "secret",
      "token",
    ],
  },
  {
    id: "git",
    label: "Git",
    icon: GitBranch,
    description: "AI-generated commit messages",
    keywords: ["commit", "message", "diff", "prompt", "ai", "git", "staged"],
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: Keyboard,
    description: "Keyboard bindings for all actions",
    keywords: [
      "keyboard",
      "hotkey",
      "keybinding",
      "shortcut",
      "binding",
      "keys",
    ],
  },
  {
    id: "data",
    label: "Data",
    icon: Database,
    description: "Manage and delete application data",
    keywords: ["delete", "reset", "workspace", "thread", "message", "data", "wipe"],
  },
]

function sectionMatches(section: SettingsSection, query: string): boolean {
  const q = query.toLowerCase()
  return (
    section.label.toLowerCase().includes(q) ||
    section.description.toLowerCase().includes(q) ||
    section.keywords.some((k) => k.includes(q))
  )
}

// ── Main Settings Page ─────────────────────────────────────────────────────────

export function SettingsPage() {
  const { resetAll } = useWorkspace()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [search, setSearch] = useState("")
  const [activeSection, setActiveSection] = useState<string>("appearance")
  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const isScrollingTo = useRef(false)

  const visibleSections = useMemo(
    () =>
      search.trim()
        ? SECTIONS.filter((s) => sectionMatches(s, search.trim()))
        : SECTIONS,
    [search]
  )

  // Track active section by finding the last section whose top is above 40% of the container height
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    function updateActive() {
      if (isScrollingTo.current) return
      const containerRect = container!.getBoundingClientRect()
      const threshold = containerRect.top + containerRect.height * 0.4

      let active: string | null = null
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top <= threshold) {
          active = section.id
        }
      }
      if (active) setActiveSection(active)
    }

    container.addEventListener("scroll", updateActive, { passive: true })
    updateActive()
    return () => container.removeEventListener("scroll", updateActive)
  }, [visibleSections])

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id]
    if (!el) return
    isScrollingTo.current = true
    setActiveSection(id)
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    setTimeout(() => {
      isScrollingTo.current = false
    }, 700)
  }, [])

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
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar nav ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r">
        {/* Search */}
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search settings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-4">
          {visibleSections.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No results</p>
          ) : (
            visibleSections.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{section.label}</span>
                </button>
              )
            })
          )}
        </nav>

        {/* Footer */}
        <div className="mt-auto border-t px-3 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            λ<span className="font-mono">Code</span>
            <Badge variant="outline" className="ml-auto">Alpha</Badge>
          </div>
        </div>
      </aside>

      {/* ── Content area ── */}
      <main ref={contentRef} className="flex-1 overflow-y-auto scroll-smooth">
        {visibleSections.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No settings match <strong>"{search}"</strong>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-10 px-8 py-8">
            {/* ── Appearance ── */}
            {visibleSections.some((s) => s.id === "appearance") && (
              <section
                id="appearance"
                ref={(el) => { sectionRefs.current["appearance"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Palette}
                  title="Appearance"
                  description="Choose how the application looks and feels."
                />
                <AppearanceCard />
              </section>
            )}

            {/* ── Chat ── */}
            {visibleSections.some((s) => s.id === "chat") && (
              <section
                id="chat"
                ref={(el) => { sectionRefs.current["chat"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={MessageSquare}
                  title="Chat"
                  description="Control how assistant responses are displayed."
                />
                <ChatPreferencesCard />
              </section>
            )}

            {/* ── Subscriptions ── */}
            {visibleSections.some((s) => s.id === "subscriptions") && (
              <section
                id="subscriptions"
                ref={(el) => { sectionRefs.current["subscriptions"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Key}
                  title="Subscriptions"
                  description="Sign in with Claude Pro, GitHub Copilot, and more. Credentials stored in auth.json."
                />
                <SubscriptionsCard />
              </section>
            )}

            {/* ── API Keys ── */}
            {visibleSections.some((s) => s.id === "api-keys") && (
              <section
                id="api-keys"
                ref={(el) => { sectionRefs.current["api-keys"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Key}
                  title="API Keys"
                  description="Configure API keys for each provider. Stored in ~/.pi/agent/auth.json."
                />
                <ApiKeysCard />
              </section>
            )}

            {/* ── Git ── */}
            {visibleSections.some((s) => s.id === "git") && (
              <section
                id="git"
                ref={(el) => { sectionRefs.current["git"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={GitBranch}
                  title="Git"
                  description="Customize the AI prompt for generating commit messages. Use {diff} for the staged diff."
                />
                <CommitPromptCard />
              </section>
            )}

            {/* ── Keyboard Shortcuts ── */}
            {visibleSections.some((s) => s.id === "shortcuts") && (
              <section
                id="shortcuts"
                ref={(el) => { sectionRefs.current["shortcuts"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Keyboard}
                  title="Keyboard Shortcuts"
                  description="Customize bindings for all actions. Click a binding to record a new one."
                />
                <KeyboardShortcutsCard />
              </section>
            )}

            {/* ── Data ── */}
            {visibleSections.some((s) => s.id === "data") && (
              <section
                id="data"
                ref={(el) => { sectionRefs.current["data"] = el }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Database}
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
            )}
          </div>
        )}
      </main>

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

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ── Appearance card ────────────────────────────────────────────────────────────

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const { shortcuts } = useKeyboardShortcuts()
  const activeTheme = THEMES.find(({ value }) => value === theme) ?? THEMES[0]
  const ActiveThemeIcon = activeTheme.icon

  return (
    <Card>
      <CardContent className="p-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Theme</FieldTitle>
            <FieldDescription>
              {shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME] && (
                <>
                  Press <ShortcutKbd binding={shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME]} /> to toggle quickly.
                </>
              )}
            </FieldDescription>
          </FieldContent>
          <Select
            value={theme}
            onValueChange={(value) => {
              if (typeof value === "string") setTheme(value as Theme)
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
  )
}

// ── Chat preferences card ──────────────────────────────────────────────────────

function ChatPreferencesCard() {
  const showThinking = useShowThinkingSetting()
  const updateSetting = useUpdateAppSetting()
  const { data: settings } = useAppSettings()
  const persistedPhrasesRaw =
    settings?.[APP_SETTINGS_KEYS.THINKING_PHRASES] ??
    DEFAULT_THINKING_PHRASES.join("\n")
  const [phrasesValue, setPhrasesValue] = useState(persistedPhrasesRaw)
  const [phrasesSaved, setPhrasesSaved] = useState(false)

  const prevPersistedPhrasesRef = React.useRef(persistedPhrasesRaw)
  React.useEffect(() => {
    if (
      prevPersistedPhrasesRef.current !== persistedPhrasesRaw &&
      phrasesValue === prevPersistedPhrasesRef.current
    ) {
      prevPersistedPhrasesRef.current = persistedPhrasesRaw
      setPhrasesValue(persistedPhrasesRaw)
    }
  }, [persistedPhrasesRaw, phrasesValue])

  const handleToggle = (pressed: boolean) => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.SHOW_THINKING,
      value: pressed ? "1" : "0",
    })
  }

  function handleSavePhrases() {
    const trimmed = phrasesValue.trim()
    updateSetting.mutate({ key: APP_SETTINGS_KEYS.THINKING_PHRASES, value: trimmed })
    setPhrasesSaved(true)
    setTimeout(() => setPhrasesSaved(false), 1500)
  }

  function handleResetPhrases() {
    const defaultRaw = DEFAULT_THINKING_PHRASES.join("\n")
    setPhrasesValue(defaultRaw)
    updateSetting.mutate({ key: APP_SETTINGS_KEYS.THINKING_PHRASES, value: defaultRaw })
  }

  const isDefaultPhrases = phrasesValue.trim() === DEFAULT_THINKING_PHRASES.join("\n")

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Show model thinking</FieldTitle>
            <FieldDescription>
              Display streamed reasoning blocks in chat when the selected model emits thinking deltas.
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

        <Separator />

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="thinking-phrases">Agent working phrases</FieldLabel>
            <FieldDescription>
              Phrases cycled in the loading indicator while the agent is working. One phrase per line.
            </FieldDescription>
            <Textarea
              id="thinking-phrases"
              value={phrasesValue}
              onChange={(e) => {
                setPhrasesValue(e.target.value)
                setPhrasesSaved(false)
              }}
              className="mt-1.5 min-h-28 font-mono text-xs"
              spellCheck={false}
            />
          </Field>
          <div className="flex justify-end gap-2">
            {!isDefaultPhrases && (
              <Button variant="ghost" size="sm" onClick={handleResetPhrases} title="Reset to defaults">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleSavePhrases} disabled={phrasesSaved}>
              {phrasesSaved ? (
                <Check data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {phrasesSaved ? "Saved" : "Save"}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

// ── Keyboard Shortcuts card ────────────────────────────────────────────────────

function ShortcutRecorder({
  action,
  binding,
  onSave,
}: {
  action: ShortcutAction
  binding: string
  onSave: (action: ShortcutAction, newBinding: string) => void
}) {
  const [recording, setRecording] = React.useState(false)

  React.useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === "Escape") {
        setRecording(false)
        return
      }

      const newBinding = eventToBinding(e)
      if (!newBinding) return
      onSave(action, newBinding)
      setRecording(false)
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [recording, action, onSave])

  const isDefault = binding === DEFAULT_SHORTCUTS[action]

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setRecording(true)}
        className={cn(
          "flex min-w-24 items-center justify-center rounded-md border px-2 py-1 text-xs transition-colors",
          recording
            ? "border-ring bg-primary/10 text-primary animate-pulse"
            : "border-border bg-transparent hover:border-ring hover:bg-muted/50"
        )}
        title="Click to record a new shortcut"
      >
        {recording ? (
          <span className="text-xs">Press key…</span>
        ) : binding ? (
          <ShortcutKbd binding={binding} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </button>
      {!isDefault && (
        <button
          type="button"
          title="Reset to default"
          onClick={() => onSave(action, DEFAULT_SHORTCUTS[action])}
          className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {binding && (
        <button
          type="button"
          title="Clear shortcut"
          onClick={() => onSave(action, "")}
          className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function KeyboardShortcutsCard() {
  const { shortcuts, updateShortcut, resetShortcuts } = useKeyboardShortcuts()
  const isAllDefault = SHORTCUT_ACTION_ORDER.every(
    (a) => (shortcuts[a] ?? DEFAULT_SHORTCUTS[a]) === DEFAULT_SHORTCUTS[a]
  )

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-0">
          {SHORTCUT_ACTION_ORDER.map((action, i) => (
            <div
              key={action}
              className={cn(
                "flex items-center justify-between py-2",
                i < SHORTCUT_ACTION_ORDER.length - 1 && "border-b border-border/50"
              )}
            >
              <span className="text-sm">{SHORTCUT_LABELS[action]}</span>
              <ShortcutRecorder
                action={action}
                binding={shortcuts[action] ?? DEFAULT_SHORTCUTS[action]}
                onSave={updateShortcut}
              />
            </div>
          ))}
        </div>
        {!isAllDefault && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetShortcuts}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset all to defaults
            </Button>
          </div>
        )}
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
      if (!opened) window.open(url, "_blank")
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
      setLoginState({ status: "error", providerId, message: err instanceof Error ? err.message : String(err) })
      return
    }

    let es: EventSource
    try {
      es = await openOAuthEventSourceMutation.mutateAsync(loginId)
    } catch (err) {
      setLoginState({ status: "error", providerId, message: err instanceof Error ? err.message : String(err) })
      return
    }

    let completed = false
    esRef.current = es

    es.addEventListener("auth_url", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & { type: "auth_url" }
      setLoginState({ status: "waiting_auth", providerId, loginId, url: event.url, instructions: event.instructions })
      void handleOpenExternal(event.url)
    })

    es.addEventListener("prompt", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as OAuthSseEvent & { type: "prompt" }
      setPromptValue("")
      setLoginState({ status: "waiting_prompt", providerId, loginId, promptId: event.promptId, message: event.message, placeholder: event.placeholder })
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
        const event = JSON.parse(e.data) as OAuthSseEvent & { type: "error" }
        completed = true
        closeEventSource()
        setLoginState({ status: "error", providerId, message: event.message })
      } else {
        closeEventSource()
        if (!completed) {
          setLoginState({ status: "error", providerId, message: "Connection lost" })
        }
      }
    })
  }

  async function handlePromptSubmit() {
    if (loginState.status !== "waiting_prompt") return
    const { loginId, promptId, providerId } = loginState
    setLoginState((s) => ({ ...s, status: "connecting" }) as LoginState)
    try {
      await respondToOAuthPromptMutation.mutateAsync({ loginId, promptId, value: promptValue })
      setPromptValue("")
    } catch (err) {
      setLoginState({ status: "error", providerId, message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleAbort() {
    closeEventSource()
    if (loginState.status === "waiting_auth" || loginState.status === "waiting_prompt" || loginState.status === "connecting") {
      try {
        await abortOAuthLoginMutation.mutateAsync((loginState as { loginId?: string }).loginId ?? "")
      } catch {
        // ignore
      }
    }
    setLoginState({ status: "idle" })
  }

  async function handleLogout(providerId: string) {
    try {
      await oauthLogoutMutation.mutateAsync(providerId)
    } catch {
      // ignore
    }
  }

  const activeProviderId = loginState.status !== "idle" ? (loginState as { providerId: string }).providerId : null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !providers?.length ? (
          <p className="text-xs text-muted-foreground">No OAuth providers available.</p>
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
                        <span className="text-[10px] text-destructive">{loginState.message}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.loggedIn && !isActive ? (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleLogout(p.id)}>
                          <LogOut data-icon="inline-start" />
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
                            <Loader2 data-icon="inline-start" className="animate-spin" />
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
                          <p className="text-xs font-medium">Browser opened for authentication</p>
                          {loginState.instructions && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{loginState.instructions}</p>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto justify-start px-0"
                            onClick={() => void handleOpenExternal(loginState.url)}
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
                      <p className="mb-2 text-xs font-medium">{loginState.message}</p>
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={promptValue}
                          onChange={(e) => setPromptValue(e.target.value)}
                          placeholder={loginState.placeholder ?? "Enter code…"}
                          className="h-7 font-mono text-xs"
                          onKeyDown={(e) => { if (e.key === "Enter") handlePromptSubmit() }}
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
                onKeyDown={(e) => { if (e.key === "Enter") onSave(provider.id, value) }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide API key" : "Show API key"}>
                  {visible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>

        <DialogFooter>
          {savedKey && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => onSave(provider.id, "")} disabled={isSaving}>
              Remove key
            </Button>
          )}
          <DialogClose render={<Button variant="outline" />} disabled={isSaving}>
            Cancel
          </DialogClose>
          <Button onClick={() => onSave(provider.id, value)} disabled={isSaving || value === savedKey}>
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

  const configuredCount = API_KEY_PROVIDERS.filter((p) => !!savedKeys?.[p.id]).length

  function handleSave(id: string, key: string) {
    saveProviders({ ...savedKeys, [id]: key }, { onSuccess: () => setOpenFor(null) })
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
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
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
                <p className="py-3 text-center text-xs text-muted-foreground">No providers match</p>
              ) : (
                filteredProviders.map(({ id, label, placeholder }, i) => {
                  const hasKey = !!savedKeys?.[id]
                  return (
                    <div
                      key={id}
                      className={cn(
                        "flex items-center justify-between px-1 py-2",
                        i < filteredProviders.length - 1 && "border-b border-border/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm">{label}</p>
                        {hasKey && <SuccessBadge>Configured</SuccessBadge>}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpenFor(id)}>
                        {hasKey ? "Edit" : "Configure"}
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
                })
              )}
            </div>
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

  const prevPersistedRef = React.useRef(persistedValue)
  React.useEffect(() => {
    if (prevPersistedRef.current !== persistedValue && value === prevPersistedRef.current) {
      prevPersistedRef.current = persistedValue
      setValue(persistedValue)
    }
  }, [persistedValue, value])

  function handleSave() {
    updateSetting.mutate({ key: APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT, value: value.trim() })
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
            <FieldLabel htmlFor="commit-message-prompt">Prompt template</FieldLabel>
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
          <Button variant="ghost" size="sm" className="px-2" disabled={isDefault} onClick={handleReset}>
            <RotateCcw data-icon="inline-start" />
            Reset to default
          </Button>
          <Button size="sm" className="px-3" disabled={!hasDiffPlaceholder || saved} onClick={handleSave}>
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
