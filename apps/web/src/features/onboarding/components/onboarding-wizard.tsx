import type React from "react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  GitBranch,
  KeyRound,
  Monitor,
  Moon,
  Sparkles,
  SquareTerminal,
  Sun,
  UserRound,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { cn } from "@/shared/lib/utils"
import { LambdaMark } from "@/shared/components/lambda-mark"
import { useTheme } from "@/shared/components/theme-provider"
import type { ThemeMode } from "@/features/themes"
import { ThemePicker } from "@/features/themes"
import {
  ApiKeysCard,
  SubscriptionsCard,
} from "@/features/settings/components/provider-cards"
import { useProviders, useOAuthProviders } from "@/features/settings/queries"
import { useCreateMemory, useUpdateAppSetting } from "@/features/settings/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import {
  useCreateWorkspaceAction,
} from "@/features/workspace"
import { CreateWorkspaceDialog } from "@/features/workspace/components/create-workspace-dialog"

type Step = "welcome" | "about" | "theme" | "provider" | "finish"

const STEP_ORDER: Step[] = ["welcome", "about", "theme", "provider", "finish"]

// Steps that show the progress dots + standard card chrome. The welcome screen
// is a full-bleed hero and is intentionally excluded.
const PROGRESS_STEPS = STEP_ORDER.slice(1)

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  welcome: {
    title: "Welcome to Lamda",
    subtitle: "Your AI pair programmer for reading, editing, and shipping code.",
  },
  about: {
    title: "Tell us about yourself",
    subtitle: "Your agent remembers this to personalize how it helps you.",
  },
  theme: {
    title: "Pick your look",
    subtitle: "Choose a mode and color theme. You can change this anytime.",
  },
  provider: {
    title: "Connect an AI provider",
    subtitle: "Sign in or add an API key to power the coding agent.",
  },
  finish: {
    title: "You're all set",
    subtitle: "Open a project to start coding with your agent.",
  },
}

function useHasProvider() {
  const { data: apiKeys } = useProviders()
  const { data: oauthProviders } = useOAuthProviders()
  const hasApiKey = apiKeys
    ? Object.values(apiKeys).some((v) => Boolean(v))
    : false
  const hasOAuth = oauthProviders?.some((p) => p.loggedIn) ?? false
  return hasApiKey || hasOAuth
}

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>("welcome")
  const [name, setName] = useState("")
  const [occupation, setOccupation] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [committed, setCommitted] = useState(false)

  const navigate = useNavigate()
  const hasProvider = useHasProvider()
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()
  const createMemory = useCreateMemory()
  const updateSetting = useUpdateAppSetting()

  const stepIndex = STEP_ORDER.indexOf(step)
  const trimmedName = name.trim()

  /** Persist the profile to agent memory and mark onboarding done. Runs once. */
  function commitProfile() {
    if (committed) return
    setCommitted(true)

    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.ONBOARDING_COMPLETED,
      value: "true",
    })

    if (!trimmedName) return
    const job = occupation.trim()
    const content = job
      ? `The user's name is ${trimmedName}. They work as a ${job}.`
      : `The user's name is ${trimmedName}.`
    createMemory.mutate({
      scope: "user",
      title: "User profile",
      content,
      category: "profile",
    })
  }

  function goNext() {
    const next = STEP_ORDER[stepIndex + 1]
    // Persist the profile as soon as the user leaves the provider step, so it
    // survives even if they close the app before creating a workspace.
    if (step === "provider") commitProfile()
    if (next) setStep(next)
  }

  function goBack() {
    const prev = STEP_ORDER[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const canAdvance = step === "about" ? trimmedName.length > 0 : true

  if (step === "welcome") {
    return <WelcomeScreen onGetStarted={goNext} />
  }

  return (
    <>
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex w-full max-w-xl flex-col gap-6 animate-in duration-300 fade-in-0 zoom-in-95">
          {/* Brand + progress */}
          <div className="flex flex-col items-center gap-4 text-center">
            <LambdaMark />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {STEP_META[step].title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {STEP_META[step].subtitle}
              </p>
            </div>
            <StepDots
              total={PROGRESS_STEPS.length}
              current={PROGRESS_STEPS.indexOf(step)}
            />
          </div>

          {/* Step body */}
          <div className="rounded-xl border bg-card/70 p-5 shadow-sm">
            {step === "about" && (
              <AboutStep
                name={name}
                occupation={occupation}
                onNameChange={setName}
                onOccupationChange={setOccupation}
                onSubmit={goNext}
              />
            )}
            {step === "theme" && <ThemeStep />}
            {step === "provider" && <ProviderStep />}
            {step === "finish" && (
              <FinishStep
                name={trimmedName}
                hasProvider={hasProvider}
                onCreateWorkspace={() => setDialogOpen(true)}
                onConfigureProvider={() => setStep("provider")}
              />
            )}
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={stepIndex === 0}
              className={cn("gap-1.5", stepIndex === 0 && "invisible")}
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>

            {step !== "finish" ? (
              <Button size="sm" onClick={goNext} disabled={!canAdvance} className="gap-1.5">
                {step === "provider" ? "Continue" : "Next"}
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/settings" })}
                className="text-muted-foreground hover:text-foreground"
              >
                Open settings
              </Button>
            )}
          </div>
        </div>
      </div>

      <CreateWorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreateLocal={handleCreateLocal}
        onCreateRemote={handleCreateRemote}
      />
    </>
  )
}

const WELCOME_FEATURES = [
  {
    icon: Bot,
    label: "AI coding agent",
    description: "Chat with an agent that reads and edits your code",
  },
  {
    icon: GitBranch,
    label: "Git integration",
    description: "Review diffs, stage files, and commit in-app",
  },
  {
    icon: SquareTerminal,
    label: "Embedded terminal",
    description: "Run commands without leaving your workspace",
  },
]

function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center animate-in duration-500 fade-in-0 zoom-in-95">
        <div className="flex flex-col items-center gap-4">
          <LambdaMark />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {STEP_META.welcome.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {STEP_META.welcome.subtitle}
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-2.5">
          {WELCOME_FEATURES.map(({ icon: Icon, label, description }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-xl border bg-card/50 p-3 text-left"
            >
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-3.5 text-primary/80" />
              </div>
              <div className="space-y-0.5">
                <p className="text-2xs leading-tight font-semibold">{label}</p>
                <p className="text-3xs leading-snug text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <Button size="lg" onClick={onGetStarted} className="w-full gap-1.5">
            Get started
            <ArrowRight className="size-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Takes about a minute — name, theme, and your AI provider.
          </p>
        </div>
      </div>
    </div>
  )
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current
              ? "w-5 bg-primary"
              : i < current
                ? "w-1.5 bg-primary/60"
                : "w-1.5 bg-border"
          )}
        />
      ))}
    </div>
  )
}

function AboutStep({
  name,
  occupation,
  onNameChange,
  onOccupationChange,
  onSubmit,
}: {
  name: string
  occupation: string
  onNameChange: (v: string) => void
  onOccupationChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="onboarding-name" className="gap-1.5">
          <UserRound className="size-3.5 text-muted-foreground" />
          What should we call you?
        </Label>
        <Input
          id="onboarding-name"
          autoFocus
          placeholder="Ada"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="onboarding-occupation" className="gap-1.5">
          <Sparkles className="size-3.5 text-muted-foreground" />
          What do you do?
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="onboarding-occupation"
          placeholder="Frontend engineer"
          value={occupation}
          onChange={(e) => onOccupationChange(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Saved to your agent's memory so it can tailor responses to you. You can
        edit or remove it later in Settings → Memory.
      </p>

      {/* Allows Enter-to-submit without a visible duplicate button. */}
      <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
    </form>
  )
}

const THEME_MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

function ThemeStep() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Mode</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_MODES.map(({ value, label, icon: Icon }) => {
            const selected = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/40"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Color theme</Label>
        <div className="max-h-64 overflow-y-auto pr-1">
          <ThemePicker />
        </div>
      </div>
    </div>
  )
}

function ProviderStep() {
  return (
    <div className="max-h-[22rem] overflow-y-auto pr-1">
      <Accordion defaultValue={["subscription"]}>
        <ProviderOption
          value="subscription"
          icon={Sparkles}
          iconClassName="text-primary"
          title="Sign in with a subscription"
          description="Use your existing Claude or other plan via OAuth."
          recommended
        >
          <SubscriptionsCard />
        </ProviderOption>

        <ProviderOption
          value="api-key"
          icon={KeyRound}
          iconClassName="text-muted-foreground"
          title="Add an API key"
          description="Paste a key from any supported provider."
        >
          <ApiKeysCard />
        </ProviderOption>
      </Accordion>
    </div>
  )
}

function ProviderOption({
  value,
  icon: Icon,
  iconClassName,
  title,
  description,
  recommended,
  children,
}: {
  value: string
  icon: typeof Sparkles
  iconClassName?: string
  title: string
  description: string
  recommended?: boolean
  children: React.ReactNode
}) {
  return (
    <AccordionItem value={value} className="border-0 data-open:bg-transparent">
      <AccordionTrigger className="items-center gap-3 px-1 py-3 hover:no-underline">
        <span className="flex items-center gap-2.5 text-left">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className={cn("size-3.5", iconClassName)} />
          </span>
          <span className="flex flex-col">
            <span className="flex items-center gap-2 text-sm font-medium">
              {title}
              {recommended && (
                <Badge variant="secondary" className="px-1.5 py-0 text-2xs">
                  Recommended
                </Badge>
              )}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {description}
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-1 pb-3">{children}</AccordionContent>
    </AccordionItem>
  )
}

function FinishStep({
  name,
  hasProvider,
  onCreateWorkspace,
  onConfigureProvider,
}: {
  name: string
  hasProvider: boolean
  onCreateWorkspace: () => void
  onConfigureProvider: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/25">
        <Check className="size-5 text-primary" strokeWidth={2.5} />
      </div>
      <p className="text-sm">
        {name ? (
          <>
            You're ready, <span className="font-medium">{name}</span>.
          </>
        ) : (
          <>You're ready to go.</>
        )}{" "}
        Open a local folder or clone a repository to create your first
        workspace.
      </p>

      {!hasProvider && (
        <button
          type="button"
          onClick={onConfigureProvider}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          You haven't connected a provider yet — set one up first
        </button>
      )}

      <Button
        onClick={onCreateWorkspace}
        disabled={!hasProvider}
        className="mt-1 w-full"
      >
        Create your first workspace
      </Button>
    </div>
  )
}
