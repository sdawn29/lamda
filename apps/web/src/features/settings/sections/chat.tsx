import React, { useEffect, useRef, useState } from "react"
import { Check, RotateCcw, Save } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import {
  DEFAULT_THINKING_PHRASES,
  useShowThinkingSetting,
} from "@/shared/lib/thinking-visibility"
import { useRichChatRenderingSetting } from "@/shared/lib/chat-rendering"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from "../components/settings-ui"
import { ModelSetting } from "../components/model-setting"

// Mirrors DEFAULT_TITLE_PROMPT in @lamda/pi-sdk. `{message}` is replaced with
// the first user message when generating a thread title.
const DEFAULT_TITLE_PROMPT = `Generate a short, descriptive thread title (3–6 words) for a conversation that starts with this message:\n\n"{message}"\n\nReply with ONLY the title. No quotes, no punctuation at the end.`

export function ChatSection() {
  const showThinking = useShowThinkingSetting()
  const richRendering = useRichChatRenderingSetting()
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

  const persistedTitlePrompt =
    settings?.[APP_SETTINGS_KEYS.TITLE_GENERATION_PROMPT] ??
    DEFAULT_TITLE_PROMPT
  const [titleValue, setTitleValue] = useState(persistedTitlePrompt)
  const [titleSaved, setTitleSaved] = useState(false)
  const titleSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (titleSavedTimerRef.current) clearTimeout(titleSavedTimerRef.current)
    }
  }, [])

  const prevPersistedTitleRef = React.useRef(persistedTitlePrompt)
  React.useEffect(() => {
    if (
      prevPersistedTitleRef.current !== persistedTitlePrompt &&
      titleValue === prevPersistedTitleRef.current
    ) {
      prevPersistedTitleRef.current = persistedTitlePrompt
      setTitleValue(persistedTitlePrompt)
    }
  }, [persistedTitlePrompt, titleValue])

  function handleSaveTitle() {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.TITLE_GENERATION_PROMPT,
      value: titleValue.trim(),
    })
    setTitleSaved(true)
    if (titleSavedTimerRef.current) clearTimeout(titleSavedTimerRef.current)
    titleSavedTimerRef.current = setTimeout(() => setTitleSaved(false), 1500)
  }

  function handleResetTitle() {
    setTitleValue(DEFAULT_TITLE_PROMPT)
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.TITLE_GENERATION_PROMPT,
      value: DEFAULT_TITLE_PROMPT,
    })
  }

  const isDefaultTitle = titleValue.trim() === DEFAULT_TITLE_PROMPT
  const hasMessagePlaceholder = titleValue.includes("{message}")

  const handleToggle = (checked: boolean) => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.SHOW_THINKING,
      value: checked ? "1" : "0",
    })
  }

  const handleRichRenderingToggle = (checked: boolean) => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.RICH_CHAT_RENDERING,
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

      <SettingsRow
        title="Rich rendering"
        description="Render agent messages with full markdown — sized headings, bold text, horizontal rules, and blockquotes. Off keeps the compact, flattened chat style."
      >
        <Switch
          checked={richRendering}
          onCheckedChange={handleRichRenderingToggle}
          aria-label="Rich rendering"
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

      <SettingsRow
        title="Thread title model"
        description="Model used to generate thread titles from the first message. Defaults to your active chat model."
      >
        <ModelSetting settingKey={APP_SETTINGS_KEYS.TITLE_GENERATION_MODEL} />
      </SettingsRow>

      <SettingsStack
        title="Thread title prompt"
        description={
          <>
            Prompt used to generate thread titles. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{message}"}</code>{" "}
            where the first user message should be inserted.
          </>
        }
        htmlFor="title-generation-prompt"
      >
        <Textarea
          id="title-generation-prompt"
          value={titleValue}
          onChange={(e) => {
            setTitleValue(e.target.value)
            setTitleSaved(false)
          }}
          className="min-h-28 resize-y font-mono text-xs"
          spellCheck={false}
          aria-invalid={!hasMessagePlaceholder || undefined}
        />
        {!hasMessagePlaceholder && (
          <p className="text-xs/relaxed text-destructive" role="alert">
            Prompt must contain{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{message}"}</code> —
            it will be replaced with the first user message.
          </p>
        )}
        <div className="flex justify-end gap-2">
          {!isDefaultTitle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetTitle}
              title="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveTitle}
            disabled={!hasMessagePlaceholder || titleSaved}
          >
            {titleSaved ? (
              <Check data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {titleSaved ? "Saved" : "Save"}
          </Button>
        </div>
      </SettingsStack>
    </SettingsGroup>
  )
}
