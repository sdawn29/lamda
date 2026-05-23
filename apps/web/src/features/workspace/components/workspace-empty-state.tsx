import { useState } from "react"
import { Bot, CheckCircle2, GitBranch, SquareTerminal } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { useConfigureProvider } from "@/features/settings"
import { useProviders, useOAuthProviders } from "@/features/settings/queries"
import { CreateWorkspaceDialog } from "./create-workspace-dialog"
import { useCreateWorkspaceAction } from "../context"

const FEATURES = [
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

function useHasProvider() {
  const { data: apiKeys } = useProviders()
  const { data: oauthProviders } = useOAuthProviders()
  const hasApiKey = apiKeys
    ? Object.values(apiKeys).some((v) => Boolean(v))
    : false
  const hasOAuth = oauthProviders?.some((p) => p.loggedIn) ?? false
  return hasApiKey || hasOAuth
}

function StepRow({
  number,
  title,
  description,
  done,
  action,
  actionLabel,
  disabled,
}: {
  number: number
  title: string
  description: string
  done: boolean
  action: () => void
  actionLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-3.5 py-4">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="size-5 text-primary" strokeWidth={2} />
        ) : (
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/25">
            <span className="text-[10px] font-semibold text-primary">
              {number}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <p
          className={`text-sm leading-snug font-medium ${done ? "text-muted-foreground line-through" : ""}`}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {done ? (
        <span className="shrink-0 self-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Done
        </span>
      ) : (
        <Button
          size="sm"
          variant={number === 1 ? "default" : "outline"}
          onClick={action}
          disabled={disabled}
          className="shrink-0"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function WorkspaceEmptyState() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()
  const { openConfigure } = useConfigureProvider()
  const hasProvider = useHasProvider()

  return (
    <>
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md animate-in space-y-7 duration-300 fade-in-0 zoom-in-95">
          {/* Brand header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1c1c1e] shadow-md ring-1 ring-white/5">
              <span
                className="text-3xl leading-none font-black"
                style={{ color: "#d4a017" }}
              >
                Λ
              </span>
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">
                Welcome to Lamda
              </h1>
              <p className="text-sm text-muted-foreground">
                Complete two quick steps to start coding with your AI agent.
              </p>
            </div>
          </div>

          {/* Setup checklist */}
          <div className="divide-y rounded-xl border bg-card/70 px-5 shadow-sm">
            <StepRow
              number={1}
              title="Connect an AI provider"
              description="Add an API key or sign in with OAuth to power the coding agent."
              done={hasProvider}
              action={() => openConfigure("api-keys")}
              actionLabel="Set up provider"
            />
            <StepRow
              number={2}
              title="Create your first workspace"
              description="Open a local repository or clone one from GitHub or GitLab."
              done={false}
              action={() => setDialogOpen(true)}
              actionLabel="Create workspace"
              disabled={!hasProvider}
            />
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-3 gap-2.5">
            {FEATURES.map(({ icon: Icon, label, description }) => (
              <div
                key={label}
                className="flex flex-col gap-2 rounded-xl border bg-card/50 p-3 transition-colors hover:bg-card/80"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-3.5 text-primary/80" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] leading-tight font-semibold">
                    {label}
                  </p>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
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
