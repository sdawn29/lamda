import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  Sun,
  Moon,
  Monitor,
  Trash2,
  AlertTriangle,
  Check,
  Save,
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
  RefreshCw,
  Download,
  DollarSign,
  Gauge,
  FolderOpen,
  Code2,
} from "lucide-react"

import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent } from "@/shared/ui/card"
import { Progress, ProgressLabel, ProgressValue } from "@/shared/ui/progress"
import { Switch } from "@/shared/ui/switch"
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
import { useConfigureProvider } from "../configure-provider-store"
import { cn } from "@/shared/lib/utils"
import {
  useElectronUpdateStatus,
  useCheckForUpdates,
  useDownloadUpdate,
  useInstallUpdate,
  type ElectronUpdateStatus,
} from "@/features/electron"
import { LspSettingsCard } from "@/features/lsp"

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "system"

// ── Constants ──────────────────────────────────────────────────────────────────

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
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
    icon: DollarSign,
    description: "OAuth sign-in for Claude Pro, GitHub Copilot, etc.",
    keywords: [
      "oauth",
      "subscription",
      "sign in",
      "claude pro",
      "copilot",
      "login",
    ],
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
    id: "lsp",
    label: "LSP Config",
    icon: Code2,
    description: "Language server availability and commands",
    keywords: [
      "lsp",
      "language server",
      "diagnostics",
      "hover",
      "definition",
      "typescript",
      "python",
      "rust",
      "go",
      "path",
    ],
  },
  {
    id: "retry",
    label: "Retry",
    icon: Gauge,
    description: "Configure retry behavior for provider requests",
    keywords: [
      "retry",
      "timeout",
      "max retries",
      "delay",
      "provider",
      "request",
    ],
  },
  {
    id: "updates",
    label: "Updates",
    icon: RefreshCw,
    description: "App version and automatic update controls",
    keywords: [
      "update",
      "version",
      "install",
      "download",
      "upgrade",
      "release",
    ],
  },
  {
    id: "data",
    label: "Data",
    icon: Database,
    description: "Manage and delete application data",
    keywords: [
      "delete",
      "reset",
      "workspace",
      "thread",
      "message",
      "data",
      "wipe",
    ],
  },
]

const SECTION_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Interface", ids: ["appearance", "chat"] },
  { label: "AI Providers", ids: ["subscriptions", "api-keys"] },
  { label: "Customization", ids: ["git", "shortcuts"] },
  { label: "System", ids: ["lsp", "retry", "updates", "data"] },
]

function sectionMatches(section: SettingsSection, query: string): boolean {
  const q = query.toLowerCase()
  return (
    section.label.toLowerCase().includes(q) ||
    section.description.toLowerCase().includes(q) ||
    section.keywords.some((k) => k.includes(q))
  )
}

function SidebarNavButton({
  section,
  isActive,
  onClick,
}: {
  section: SettingsSection
  isActive: boolean
  onClick: (id: string) => void
}) {
  const Icon = section.icon
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onClick(section.id)}
      className={cn(
        "w-full justify-start gap-2 transition-all duration-150",
        isActive
          ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border/60 hover:bg-background"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{section.label}</span>
    </Button>
  )
}

// ── Main Settings Page ─────────────────────────────────────────────────────────

export function SettingsPage() {
  const { resetAll } = useWorkspace()
  const { openConfigure } = useConfigureProvider()
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
      const c = container!

      const atTop = c.scrollTop < 8
      if (atTop) {
        const first = visibleSections[0]
        if (first) setActiveSection(first.id)
        return
      }

      const containerRect = c.getBoundingClientRect()
      const threshold = containerRect.top + containerRect.height * 0.4

      let active: string | null = null
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top <= threshold) active = section.id
      }
      if (active) setActiveSection(active)
    }

    container.addEventListener("scroll", updateActive, { passive: true })
    updateActive()
    return () => container.removeEventListener("scroll", updateActive)
  }, [visibleSections])

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id]
    const container = contentRef.current
    if (!el || !container) return

    isScrollingTo.current = true
    setActiveSection(id)
    el.scrollIntoView({ behavior: "smooth", block: "start" })

    const release = () => {
      isScrollingTo.current = false
    }

    // scrollend fires when smooth scroll finishes; fall back to a timeout
    // for browsers that don't support it yet.
    container.addEventListener("scrollend", release, { once: true })
    const fallback = setTimeout(() => {
      container.removeEventListener("scrollend", release)
      release()
    }, 1000)

    container.addEventListener(
      "scrollend",
      () => clearTimeout(fallback),
      { once: true }
    )
  }, [])

  async function handleReset() {
    setResetting(true)
    try {
      await resetAll()
      setShowConfirm(false)
      // Restart the server (spawns fresh process with a new empty DB),
      // then hard-reload the page to clear all in-memory state.
      await window.electronAPI?.restartServer()
      window.location.reload()
    } catch {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar nav ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center border-b bg-muted/20 px-4">
          <h1 className="text-sm font-semibold">Settings</h1>
        </div>

        {/* Search */}
        <div className="p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
              >
                <X />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>
        </div>

        {/* Nav */}
        {search.trim() ? (
          <nav className="flex flex-col overflow-y-auto px-2 pb-4">
            {visibleSections.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No results
              </p>
            ) : (
              <>
                <p className="px-2 pb-1 text-[10px] text-muted-foreground/70">
                  {visibleSections.length} result
                  {visibleSections.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-col gap-0.5">
                  {visibleSections.map((section) => (
                    <SidebarNavButton
                      key={section.id}
                      section={section}
                      isActive={activeSection === section.id}
                      onClick={scrollToSection}
                    />
                  ))}
                </div>
              </>
            )}
          </nav>
        ) : (
          <nav className="flex flex-col overflow-y-auto px-2 pb-4">
            {SECTION_GROUPS.map((group) => (
              <div key={group.label} className="mt-3">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.ids.map((id) => {
                    const section = SECTIONS.find((s) => s.id === id)
                    if (!section) return null
                    return (
                      <SidebarNavButton
                        key={id}
                        section={section}
                        isActive={activeSection === section.id}
                        onClick={scrollToSection}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        )}

        {/* Footer */}
        <div className="mt-auto border-t px-3 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-black" style={{ color: "#d4a017" }}>Λ</span>
            <span className="font-medium">Lamda</span>
            {import.meta.env.DEV ? (
              <Badge variant="outline" className="ml-auto">
                dev
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto font-mono">
                v{__APP_VERSION__}
              </Badge>
            )}
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
          <div className="mx-auto w-full max-w-2xl space-y-8 px-8 pt-8 pb-[60vh]">
            {/* ── Appearance ── */}
            {visibleSections.some((s) => s.id === "appearance") && (
              <section
                id="appearance"
                ref={(el) => {
                  sectionRefs.current["appearance"] = el
                }}
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
                ref={(el) => {
                  sectionRefs.current["chat"] = el
                }}
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
                ref={(el) => {
                  sectionRefs.current["subscriptions"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={DollarSign}
                  title="Subscriptions"
                  description="Sign in with Claude Pro, GitHub Copilot, and more."
                />
                <ProviderEntryCard
                  title="OAuth providers"
                  description="Sign in with Claude Pro, GitHub Copilot, and more. Credentials stored in auth.json."
                  onClick={() => openConfigure("subscriptions")}
                />
              </section>
            )}

            {/* ── API Keys ── */}
            {visibleSections.some((s) => s.id === "api-keys") && (
              <section
                id="api-keys"
                ref={(el) => {
                  sectionRefs.current["api-keys"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Key}
                  title="API Keys"
                  description="Configure API keys for each provider."
                />
                <ProviderEntryCard
                  title="API keys"
                  description="Anthropic, OpenAI, Google, and more. Keys are stored in auth.json in your config directory."
                  onClick={() => openConfigure("api-keys")}
                />
              </section>
            )}

            {/* ── Git ── */}
            {visibleSections.some((s) => s.id === "git") && (
              <section
                id="git"
                ref={(el) => {
                  sectionRefs.current["git"] = el
                }}
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
                ref={(el) => {
                  sectionRefs.current["shortcuts"] = el
                }}
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

            {/* ── LSP Config ── */}
            {visibleSections.some((s) => s.id === "lsp") && (
              <section
                id="lsp"
                ref={(el) => {
                  sectionRefs.current["lsp"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Code2}
                  title="LSP Config"
                  description="Review language server commands and install status."
                />
                <LspSettingsCard />
              </section>
            )}

            {/* ── Retry ── */}
            {visibleSections.some((s) => s.id === "retry") && (
              <section
                id="retry"
                ref={(el) => {
                  sectionRefs.current["retry"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Gauge}
                  title="Retry"
                  description="Configure retry behavior and timeout for provider requests."
                />
                <RetrySettingsCard />
              </section>
            )}

            {/* ── Updates ── */}
            {visibleSections.some((s) => s.id === "updates") && (
              <section
                id="updates"
                ref={(el) => {
                  sectionRefs.current["updates"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={RefreshCw}
                  title="Updates"
                  description="Manage app updates and view the current version."
                />
                <UpdateCard />
              </section>
            )}

            {/* ── Data ── */}
            {visibleSections.some((s) => s.id === "data") && (
              <section
                id="data"
                ref={(el) => {
                  sectionRefs.current["data"] = el
                }}
                className="scroll-mt-8"
              >
                <SectionHeader
                  icon={Database}
                  title="Data"
                  description="Manage your locally stored application data."
                />
                <Card>
                  <CardContent className="flex flex-col gap-3 px-4 py-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Data folder</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          ~/.lambda-code
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => window.electronAPI?.openDataDir()}
                      >
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        Show in Finder
                      </Button>
                    </div>

                    <div className="rounded-lg border border-destructive/30 bg-destructive/5">
                      <div className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          <div>
                            <p className="text-sm font-medium">
                              Delete all data
                            </p>
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
            )}
          </div>
        )}
      </main>

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
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
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
      <CardContent className="px-4 py-0">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Theme</FieldTitle>
            <FieldDescription>
              {shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME] && (
                <>
                  Press{" "}
                  <ShortcutKbd
                    binding={shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME]}
                  />{" "}
                  to toggle quickly.
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
            <SelectTrigger className="min-w-32 gap-2" aria-label="Theme">
              <ActiveThemeIcon data-icon="inline-start" />
              <SelectValue>{activeTheme.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <SelectItem key={value} value={value}>
                    <Icon data-icon="inline-start" />
                    <span>{label}</span>
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
  const phrasesSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    return () => {
      if (phrasesSavedTimerRef.current)
        clearTimeout(phrasesSavedTimerRef.current)
    }
  }, [])

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

  const handleToggle = (checked: boolean) => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.SHOW_THINKING,
      value: checked ? "1" : "0",
    })
  }

  function handleSavePhrases() {
    const trimmed = phrasesValue.trim()
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.THINKING_PHRASES,
      value: trimmed,
    })
    setPhrasesSaved(true)
    if (phrasesSavedTimerRef.current) clearTimeout(phrasesSavedTimerRef.current)
    phrasesSavedTimerRef.current = setTimeout(
      () => setPhrasesSaved(false),
      1500
    )
  }

  function handleResetPhrases() {
    const defaultRaw = DEFAULT_THINKING_PHRASES.join("\n")
    setPhrasesValue(defaultRaw)
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.THINKING_PHRASES,
      value: defaultRaw,
    })
  }

  const isDefaultPhrases =
    phrasesValue.trim() === DEFAULT_THINKING_PHRASES.join("\n")

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Show model thinking</FieldTitle>
            <FieldDescription>
              Display streamed reasoning blocks in chat when the selected model
              emits thinking deltas.
            </FieldDescription>
          </FieldContent>
          <Switch
            checked={showThinking}
            onCheckedChange={handleToggle}
            aria-label="Show model thinking"
          />
        </Field>

        <Separator />

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="thinking-phrases">
              Agent working phrases
            </FieldLabel>
            <FieldDescription>
              Phrases cycled in the loading indicator while the agent is
              working. One phrase per line.
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPhrases}
                title="Reset to defaults"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleSavePhrases}
              disabled={phrasesSaved}
            >
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
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [recording, action, onSave])

  const isDefault = binding === DEFAULT_SHORTCUTS[action]

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRecording(true)}
        className={cn(
          "min-w-24",
          recording && "animate-pulse border-ring bg-primary/10 text-primary"
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
      </Button>
      {!isDefault && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Reset to default"
          onClick={() => onSave(action, DEFAULT_SHORTCUTS[action])}
        >
          <RotateCcw />
          <span className="sr-only">Reset to default</span>
        </Button>
      )}
      {binding && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Clear shortcut"
          onClick={() => onSave(action, "")}
        >
          <X />
          <span className="sr-only">Clear shortcut</span>
        </Button>
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
      <CardContent className="flex flex-col gap-1 p-1.5">
        {SHORTCUT_ACTION_ORDER.map((action) => (
          <div
            key={action}
            className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
          >
            <span className="text-sm">{SHORTCUT_LABELS[action]}</span>
            <ShortcutRecorder
              action={action}
              binding={shortcuts[action] ?? DEFAULT_SHORTCUTS[action]}
              onSave={updateShortcut}
            />
          </div>
        ))}
        {!isAllDefault && (
          <div className="mt-0.5 flex justify-end px-1 pb-0.5">
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

// ── Provider entry card ────────────────────────────────────────────────────────

function ProviderEntryCard({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Card>
      <CardContent className="px-4 py-0">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onClick}
          >
            Configure
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Update card ────────────────────────────────────────────────────────────────

function UpdateCard() {
  const { data: status } = useElectronUpdateStatus()
  const checkForUpdates = useCheckForUpdates()
  const downloadUpdate = useDownloadUpdate()
  const installUpdate = useInstallUpdate()
  const isElectron = !!window.electronAPI

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Current version</FieldTitle>
            <FieldDescription>
              {import.meta.env.DEV ? "dev build" : `v${__APP_VERSION__}`}
            </FieldDescription>
          </FieldContent>
          {isElectron && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkForUpdates.mutate()}
              disabled={
                checkForUpdates.isPending ||
                status?.phase === "checking" ||
                status?.phase === "downloading"
              }
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-3.5 w-3.5",
                  (checkForUpdates.isPending || status?.phase === "checking") &&
                    "animate-spin"
                )}
              />
              Check for updates
            </Button>
          )}
        </Field>

        {isElectron && status && status.phase !== "idle" && (
          <>
            <Separator />
            <UpdateStatusRow
              status={status}
              onDownload={() => downloadUpdate.mutate()}
              onInstall={() => installUpdate.mutate()}
              isDownloading={downloadUpdate.isPending}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function UpdateStatusRow({
  status,
  onDownload,
  onInstall,
  isDownloading,
}: {
  status: ElectronUpdateStatus
  onDownload: () => void
  onInstall: () => void
  isDownloading: boolean
}) {
  switch (status.phase) {
    case "idle":
      return null
    case "checking":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking for updates…
        </div>
      )
    case "available":
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>
              Version <strong>{status.version}</strong> is available
            </span>
          </div>
          <Button size="sm" onClick={onDownload} disabled={isDownloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      )
    case "downloading":
      return (
        <Progress value={status.percent} className="flex-col gap-1.5">
          <ProgressLabel>Downloading update…</ProgressLabel>
          <ProgressValue>
            {() => `${Math.round(status.percent)}%`}
          </ProgressValue>
        </Progress>
      )
    case "ready":
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span>
              Version <strong>{status.version}</strong> ready to install
            </span>
          </div>
          <Button size="sm" onClick={onInstall}>
            Restart & install
          </Button>
        </div>
      )
    case "error":
      return (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription className="truncate">
            {status.message}
          </AlertDescription>
        </Alert>
      )
  }
}

// ── Commit prompt card ─────────────────────────────────────────────────────────

const DEFAULT_COMMIT_PROMPT = `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`

function CommitPromptCard() {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()
  const persistedValue =
    settings?.[APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT] ?? DEFAULT_COMMIT_PROMPT
  const [value, setValue] = useState(persistedValue)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

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
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT,
      value: value.trim(),
    })
    setSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 1500)
  }

  function handleReset() {
    setValue(DEFAULT_COMMIT_PROMPT)
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT,
      value: DEFAULT_COMMIT_PROMPT,
    })
  }

  const isDefault = value.trim() === DEFAULT_COMMIT_PROMPT
  const hasDiffPlaceholder = value.includes("{diff}")

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        <FieldGroup>
          <Field data-invalid={!hasDiffPlaceholder || undefined}>
            <FieldLabel htmlFor="commit-message-prompt">
              Prompt template
            </FieldLabel>
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

// ── Retry settings card ───────────────────────────────────────────────────────

interface RetrySettings {
  enabled: boolean
  maxRetries: number
  baseDelayMs: number
  provider: {
    timeoutMs: number
    maxRetries: number
    maxRetryDelayMs: number
  }
}

const DEFAULT_RETRY_SETTINGS: RetrySettings = {
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 2000,
  provider: {
    timeoutMs: 0,
    maxRetries: 0,
    maxRetryDelayMs: 60000,
  },
}

const RETRY_SETTINGS_KEY = "retry"

function RetrySettingsCard() {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()

  const persistedValue = useMemo(() => {
    const raw = settings?.[RETRY_SETTINGS_KEY]
    if (!raw) return DEFAULT_RETRY_SETTINGS
    try {
      return { ...DEFAULT_RETRY_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return DEFAULT_RETRY_SETTINGS
    }
  }, [settings])

  // Use persistedValue directly as the source of truth, but allow local edits.
  // Initialize local state from persistedValue to avoid hydration mismatch.
  const [localSettings, setLocalSettings] = useState<RetrySettings>(
    () => persistedValue
  )
  const [saved, setSaved] = useState(false)
  const retrySavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (retrySavedTimerRef.current) clearTimeout(retrySavedTimerRef.current)
    }
  }, [])

  // Sync local state when server data changes, but only if there are no unsaved local edits.
  const prevPersistedRef = React.useRef<RetrySettings>(persistedValue)
  React.useEffect(() => {
    if (prevPersistedRef.current === persistedValue) return
    if (
      JSON.stringify(localSettings) ===
      JSON.stringify(prevPersistedRef.current)
    ) {
      setLocalSettings(persistedValue)
    }
    prevPersistedRef.current = persistedValue
  }, [persistedValue, localSettings])

  function handleSave() {
    updateSetting.mutate({
      key: RETRY_SETTINGS_KEY,
      value: JSON.stringify(localSettings),
    })
    setSaved(true)
    if (retrySavedTimerRef.current) clearTimeout(retrySavedTimerRef.current)
    retrySavedTimerRef.current = setTimeout(() => setSaved(false), 1500)
  }

  function handleReset() {
    setLocalSettings(DEFAULT_RETRY_SETTINGS)
    updateSetting.mutate({
      key: RETRY_SETTINGS_KEY,
      value: JSON.stringify(DEFAULT_RETRY_SETTINGS),
    })
  }

  function updateProvider<K extends keyof RetrySettings["provider"]>(
    key: K,
    value: number
  ) {
    setLocalSettings((prev) => ({
      ...prev,
      provider: { ...prev.provider, [key]: value },
    }))
  }

  const isDefault =
    JSON.stringify(localSettings) === JSON.stringify(DEFAULT_RETRY_SETTINGS)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        {/* Agent-level retry */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enable agent-level retry</FieldTitle>
            <FieldDescription>
              Automatically retry on transient errors. Uses exponential backoff
              with base delay of {localSettings.baseDelayMs / 1000}s.
            </FieldDescription>
          </FieldContent>
          <Switch
            checked={localSettings.enabled}
            onCheckedChange={(checked) =>
              setLocalSettings((prev) => ({ ...prev, enabled: checked }))
            }
            aria-label="Enable agent-level retry"
          />
        </Field>

        {localSettings.enabled && (
          <>
            <Separator />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="retry-max-retries">
                  Max agent retries
                </FieldLabel>
                <FieldDescription>
                  Maximum number of retry attempts (default: 3)
                </FieldDescription>
                <Input
                  id="retry-max-retries"
                  type="number"
                  min={0}
                  max={10}
                  value={localSettings.maxRetries}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      maxRetries: Math.max(
                        0,
                        parseInt(e.target.value, 10) || 0
                      ),
                    }))
                  }
                  className="mt-1.5 w-28"
                />
              </Field>
            </FieldGroup>
          </>
        )}

        <Separator />

        {/* Provider-level retry */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Provider request settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Controls for SDK-level timeouts and retry behavior. Useful for
              long-running local inference or provider-specific SDK retry
              settings.
            </p>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="provider-timeout">
                Request timeout (ms)
              </FieldLabel>
              <FieldDescription>
                Provider/SDK request timeout. Set to 0 to use SDK default.
              </FieldDescription>
              <Input
                id="provider-timeout"
                type="number"
                min={0}
                step={1000}
                value={localSettings.provider.timeoutMs}
                onChange={(e) =>
                  updateProvider(
                    "timeoutMs",
                    Math.max(0, parseInt(e.target.value, 10) || 0)
                  )
                }
                className="mt-1.5 w-36"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="provider-max-retries">
                Provider max retries
              </FieldLabel>
              <FieldDescription>
                Provider/SDK retry attempts. Set to 0 to use SDK default.
              </FieldDescription>
              <Input
                id="provider-max-retries"
                type="number"
                min={0}
                max={20}
                value={localSettings.provider.maxRetries}
                onChange={(e) =>
                  updateProvider(
                    "maxRetries",
                    Math.max(0, parseInt(e.target.value, 10) || 0)
                  )
                }
                className="mt-1.5 w-28"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="provider-max-delay">
                Max retry delay (ms)
              </FieldLabel>
              <FieldDescription>
                Cap provider-requested retry delays at this value. Set to 0 to
                disable the cap. Default: 60000 (60 seconds).
              </FieldDescription>
              <Input
                id="provider-max-delay"
                type="number"
                min={0}
                step={1000}
                value={localSettings.provider.maxRetryDelayMs}
                onChange={(e) =>
                  updateProvider(
                    "maxRetryDelayMs",
                    Math.max(0, parseInt(e.target.value, 10) || 0)
                  )
                }
                className="mt-1.5 w-36"
              />
            </Field>
          </FieldGroup>
        </div>

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
            disabled={saved}
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
