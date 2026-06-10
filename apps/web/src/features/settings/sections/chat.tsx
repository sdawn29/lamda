import React, { useEffect, useRef, useState } from "react"
import { Check, RotateCcw, Save } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import {
  DEFAULT_THINKING_PHRASES,
  useShowThinkingSetting,
} from "@/shared/lib/thinking-visibility"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from "../components/settings-ui"

export function ChatSection() {
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
    <SettingsGroup>
      <SettingsRow
        title="Show model thinking"
        description="Display streamed reasoning blocks in chat when the selected model emits thinking deltas."
      >
        <Switch
          checked={showThinking}
          onCheckedChange={handleToggle}
          aria-label="Show model thinking"
        />
      </SettingsRow>

      <SettingsStack
        title="Agent working phrases"
        description="Phrases cycled in the loading indicator while the agent is working. One phrase per line."
        htmlFor="thinking-phrases"
      >
        <Textarea
          id="thinking-phrases"
          value={phrasesValue}
          onChange={(e) => {
            setPhrasesValue(e.target.value)
            setPhrasesSaved(false)
          }}
          className="min-h-28 font-mono text-xs"
          spellCheck={false}
        />
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
      </SettingsStack>
    </SettingsGroup>
  )
}
