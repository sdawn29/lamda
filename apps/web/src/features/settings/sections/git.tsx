import React, { useEffect, useRef, useState } from "react"
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Save,
  TerminalSquare,
  XCircle,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Github as GithubIcon } from "@lobehub/icons"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Textarea } from "@/shared/ui/textarea"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { openExternal } from "@/features/electron/api"
import { useGhStatus, githubKeys } from "@/features/github"
import { GitlabLogo, useGlabStatus, gitlabKeys } from "@/features/gitlab"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from "../components/settings-ui"
import { ModelSetting } from "../components/model-setting"

const DEFAULT_COMMIT_PROMPT = `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`

const GH_LOGIN_COMMAND = "gh auth login"
const GH_INSTALL_URL = "https://cli.github.com/"
const GLAB_LOGIN_COMMAND = "glab auth login"
const GLAB_INSTALL_URL = "https://gitlab.com/gitlab-org/cli"

export function GitSection() {
  return (
    <>
      <GitHubConnectionGroup />
      <GitLabConnectionGroup />
      <CommitMessageGroup />
    </>
  )
}

// ── GitHub connection ─────────────────────────────────────────────────────────

function GitHubConnectionGroup() {
  const { data: status, isLoading, isFetching } = useGhStatus()
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)

  const installed = status?.installed ?? false
  const authenticated = status?.authenticated ?? false
  const ready = installed && authenticated

  function refresh() {
    qc.invalidateQueries({ queryKey: githubKeys.status() })
  }

  function copyCommand() {
    void navigator.clipboard.writeText(GH_LOGIN_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="border-border/60 bg-card/80 shadow-sm" size="sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-border/70">
            <GithubIcon size={18} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>GitHub</CardTitle>
            <CardDescription>
              Connect the GitHub CLI to enable repository lists, pull requests,
              issues, and CI checks.
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-2">
          {isLoading ? (
            <Badge variant="outline" className="h-6 px-2.5 text-xs">
              Checking
            </Badge>
          ) : ready ? (
            <StatusBadge variant="secondary" icon={<CheckCircle2 />}>
              Connected
            </StatusBadge>
          ) : (
            <StatusBadge variant="outline" icon={<XCircle />}>
              Setup needed
            </StatusBadge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCw
              data-icon="inline-start"
              className={isFetching ? "animate-spin" : undefined}
            />
            Check
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="divide-y divide-border/50">
        <SettingsRow
          title="GitHub CLI"
          description={
            installed
              ? "The gh command-line tool is available on your PATH."
              : "Install gh so Lamda can talk to GitHub using your local auth session."
          }
        >
          {installed ? (
            <StatusBadge variant="outline" icon={<CheckCircle2 />}>
              Installed
            </StatusBadge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternal(GH_INSTALL_URL)}
            >
              <ExternalLink data-icon="inline-start" />
              Install gh
            </Button>
          )}
        </SettingsRow>

        <SettingsRow
          title="Account"
          description={
            authenticated
              ? `Signed in${status?.login ? ` as @${status.login}` : ""}.`
              : "Authenticate the GitHub CLI, then check the connection again."
          }
        >
          {authenticated ? (
            <StatusBadge variant="secondary" icon={<CheckCircle2 />}>
              {status?.login ? `@${status.login}` : "Signed in"}
            </StatusBadge>
          ) : (
            <StatusBadge variant="outline" icon={<XCircle />}>
              Not signed in
            </StatusBadge>
          )}
        </SettingsRow>
      </CardContent>

      {installed && !authenticated && (
        <CardFooter className="flex-col items-stretch gap-2 border-t border-border/60 bg-muted/10">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm leading-snug">Authenticate</p>
            <p className="text-xs/relaxed text-muted-foreground">
              Run this once in a terminal, then check the connection.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border/60">
                <TerminalSquare className="size-3.5" />
              </div>
              <code className="truncate font-mono text-xs">
                {GH_LOGIN_COMMAND}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 px-2"
              onClick={copyCommand}
            >
              {copied ? (
                <>
                  <Check data-icon="inline-start" />
                  Copied
                </>
              ) : (
                <>
                  <Copy data-icon="inline-start" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )
}

// ── GitLab connection ─────────────────────────────────────────────────────────

function GitLabConnectionGroup() {
  const { data: status, isLoading, isFetching } = useGlabStatus()
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)

  const installed = status?.installed ?? false
  const authenticated = status?.authenticated ?? false
  const ready = installed && authenticated

  function refresh() {
    qc.invalidateQueries({ queryKey: gitlabKeys.status() })
  }

  function copyCommand() {
    void navigator.clipboard.writeText(GLAB_LOGIN_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="border-border/60 bg-card/80 shadow-sm" size="sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-border/70">
            <GitlabLogo className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>GitLab</CardTitle>
            <CardDescription>
              Connect the GitLab CLI to enable merge requests, issues, and
              publishing to GitLab.
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-2">
          {isLoading ? (
            <Badge variant="outline" className="h-6 px-2.5 text-xs">
              Checking
            </Badge>
          ) : ready ? (
            <StatusBadge variant="secondary" icon={<CheckCircle2 />}>
              Connected
            </StatusBadge>
          ) : (
            <StatusBadge variant="outline" icon={<XCircle />}>
              Setup needed
            </StatusBadge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCw
              data-icon="inline-start"
              className={isFetching ? "animate-spin" : undefined}
            />
            Check
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="divide-y divide-border/50">
        <SettingsRow
          title="GitLab CLI"
          description={
            installed
              ? "The glab command-line tool is available on your PATH."
              : "Install glab so Lamda can talk to GitLab using your local auth session."
          }
        >
          {installed ? (
            <StatusBadge variant="outline" icon={<CheckCircle2 />}>
              Installed
            </StatusBadge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternal(GLAB_INSTALL_URL)}
            >
              <ExternalLink data-icon="inline-start" />
              Install glab
            </Button>
          )}
        </SettingsRow>

        <SettingsRow
          title="Account"
          description={
            authenticated
              ? `Signed in${status?.login ? ` as @${status.login}` : ""}.`
              : "Authenticate the GitLab CLI, then check the connection again."
          }
        >
          {authenticated ? (
            <StatusBadge variant="secondary" icon={<CheckCircle2 />}>
              {status?.login ? `@${status.login}` : "Signed in"}
            </StatusBadge>
          ) : (
            <StatusBadge variant="outline" icon={<XCircle />}>
              Not signed in
            </StatusBadge>
          )}
        </SettingsRow>
      </CardContent>

      {installed && !authenticated && (
        <CardFooter className="flex-col items-stretch gap-2 border-t border-border/60 bg-muted/10">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm leading-snug">Authenticate</p>
            <p className="text-xs/relaxed text-muted-foreground">
              Run this once in a terminal, then check the connection.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border/60">
                <TerminalSquare className="size-3.5" />
              </div>
              <code className="truncate font-mono text-xs">
                {GLAB_LOGIN_COMMAND}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 px-2"
              onClick={copyCommand}
            >
              {copied ? (
                <>
                  <Check data-icon="inline-start" />
                  Copied
                </>
              ) : (
                <>
                  <Copy data-icon="inline-start" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )
}

function StatusBadge({
  variant,
  icon,
  children,
}: {
  variant: "secondary" | "outline"
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Badge variant={variant} className="h-6 gap-1.5 px-2.5 text-xs">
      {icon}
      {children}
    </Badge>
  )
}

// ── Commit messages ───────────────────────────────────────────────────────────

function CommitMessageGroup() {
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
    <SettingsGroup
      title="Commit messages"
      description="Configure how AI commit messages are generated from staged diffs."
    >
      <SettingsRow
        title="Model"
        description="Model used to generate commit messages. Defaults to your active chat model."
      >
        <ModelSetting settingKey={APP_SETTINGS_KEYS.COMMIT_MESSAGE_MODEL} />
      </SettingsRow>
      <SettingsStack
        title="Prompt template"
        description={
          <>
            Use <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code>{" "}
            where the staged diff should be inserted.
          </>
        }
        htmlFor="commit-message-prompt"
      >
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
          <p className="text-xs/relaxed text-destructive" role="alert">
            Prompt must contain{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code> —
            it will be replaced with the staged diff.
          </p>
        )}
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
      </SettingsStack>
    </SettingsGroup>
  )
}
