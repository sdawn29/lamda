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

import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { openExternal } from "@/features/electron/api"
import { useGhStatus, githubKeys } from "@/features/github"

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

export function GitSection() {
  return (
    <>
      <GitHubConnectionGroup />
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

  function refresh() {
    qc.invalidateQueries({ queryKey: githubKeys.status() })
  }

  function copyCommand() {
    void navigator.clipboard.writeText(GH_LOGIN_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <SettingsGroup
      title="GitHub"
      description="Lamda connects to GitHub through the GitHub CLI (gh). Once it's installed and signed in, pull requests, issues, and CI checks appear in the review panel."
      action={
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
          Refresh
        </Button>
      }
    >
      <SettingsRow
        title="GitHub CLI"
        description={
          installed
            ? "The gh command-line tool is installed."
            : "The gh command-line tool was not found on your PATH."
        }
      >
        {isLoading ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : installed ? (
          <StatusPill tone="positive" icon={<CheckCircle2 />}>
            Installed
          </StatusPill>
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
            ? `Signed in to GitHub${status?.login ? ` as @${status.login}` : ""}.`
            : "Not signed in. Run the command below in a terminal, then refresh."
        }
      >
        {authenticated ? (
          <StatusPill tone="positive" icon={<CheckCircle2 />}>
            {status?.login ? `@${status.login}` : "Connected"}
          </StatusPill>
        ) : (
          <StatusPill tone="muted" icon={<XCircle />}>
            Disconnected
          </StatusPill>
        )}
      </SettingsRow>

      {installed && !authenticated && (
        <SettingsStack
          title="Sign in"
          description="Run this command in a terminal to authenticate the GitHub CLI, then click Refresh."
        >
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <code className="flex min-w-0 items-center gap-2 font-mono text-xs">
              <TerminalSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{GH_LOGIN_COMMAND}</span>
            </code>
            <Button
              variant="ghost"
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
        </SettingsStack>
      )}
    </SettingsGroup>
  )
}

function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: "positive" | "muted"
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span
      className={
        tone === "positive"
          ? "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-500 [&_svg]:size-4"
          : "inline-flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-4"
      }
    >
      {icon}
      {children}
    </span>
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
            <code className="rounded bg-muted px-1 py-0.5">{"{diff}"}</code> — it
            will be replaced with the staged diff.
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
