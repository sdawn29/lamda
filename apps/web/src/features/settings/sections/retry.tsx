import React, { useEffect, useMemo, useRef, useState } from "react"
import { Check, RotateCcw, Save } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Switch } from "@/shared/ui/switch"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"
import { SettingsGroup, SettingsRow } from "../components/settings-ui"

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

export function RetrySection() {
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

  const prevPersistedRef = React.useRef<RetrySettings>(persistedValue)
  React.useEffect(() => {
    if (prevPersistedRef.current === persistedValue) return
    if (
      JSON.stringify(localSettings) === JSON.stringify(prevPersistedRef.current)
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
    <>
      <SettingsGroup title="Agent retry">
        <SettingsRow
          title="Enable agent-level retry"
          description={`Automatically retry on transient errors. Uses exponential backoff with base delay of ${localSettings.baseDelayMs / 1000}s.`}
        >
          <Switch
            checked={localSettings.enabled}
            onCheckedChange={(checked) =>
              setLocalSettings((prev) => ({ ...prev, enabled: checked }))
            }
            aria-label="Enable agent-level retry"
          />
        </SettingsRow>

        {localSettings.enabled && (
          <SettingsRow
            title="Max agent retries"
            description="Maximum number of retry attempts (default: 3)."
            htmlFor="retry-max-retries"
          >
            <Input
              id="retry-max-retries"
              type="number"
              min={0}
              max={10}
              value={localSettings.maxRetries}
              onChange={(e) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  maxRetries: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="w-24 text-right"
            />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Provider requests"
        description="SDK-level timeouts and retry behavior. Useful for long-running local inference or provider-specific SDK retry settings."
      >
        <SettingsRow
          title="Request timeout (ms)"
          description="Provider/SDK request timeout. Set to 0 to use SDK default."
          htmlFor="provider-timeout"
        >
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
            className="w-28 text-right"
          />
        </SettingsRow>

        <SettingsRow
          title="Provider max retries"
          description="Provider/SDK retry attempts. Set to 0 to use SDK default."
          htmlFor="provider-max-retries"
        >
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
            className="w-24 text-right"
          />
        </SettingsRow>

        <SettingsRow
          title="Max retry delay (ms)"
          description="Cap provider-requested retry delays at this value. Set to 0 to disable the cap. Default: 60000 (60 seconds)."
          htmlFor="provider-max-delay"
        >
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
            className="w-28 text-right"
          />
        </SettingsRow>
      </SettingsGroup>

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
    </>
  )
}
