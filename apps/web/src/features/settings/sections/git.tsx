import React, { useEffect, useRef, useState } from "react"
import { Check, RotateCcw, Save } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Textarea } from "@/shared/ui/textarea"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"

const DEFAULT_COMMIT_PROMPT = `Generate a git commit message for the following staged diff. Follow the conventional commits format (e.g. "feat: ...", "fix: ...", "refactor: ..."). Use an imperative verb. Be concise — the subject line should be under 72 characters. If needed, add a blank line followed by a short body. Reply with ONLY the commit message, no extra explanation.\n\n{diff}`

export function GitSection() {
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
