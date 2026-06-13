import React from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  ModelCombobox,
  type ModelGroup,
} from "@/features/chat/components/model-combobox"
import { useModels } from "@/features/chat/queries"

import { useAppSettings } from "../queries"
import { useUpdateAppSetting } from "../mutations"

/**
 * Model picker bound to an app setting. The setting stores a `provider::model`
 * composite key (matching what ModelCombobox emits); an empty value means
 * "use the default model" for that task.
 */
export function ModelSetting({ settingKey }: { settingKey: string }) {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()
  const { data: modelsData } = useModels()
  const models = modelsData?.models ?? []

  const grouped = React.useMemo<ModelGroup>(
    () =>
      Object.entries(
        models.reduce<Record<string, typeof models>>((acc, m) => {
          ;(acc[m.provider] ??= []).push(m)
          return acc
        }, {})
      ),
    [models]
  )

  const value = settings?.[settingKey] ?? ""
  const selected = React.useMemo(() => {
    if (!value) return null
    const idx = value.indexOf("::")
    if (idx === -1) return null
    const provider = value.slice(0, idx)
    const id = value.slice(idx + 2)
    return models.find((m) => m.provider === provider && m.id === id) ?? null
  }, [value, models])

  return (
    <div className="flex items-center gap-1">
      {value && (
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={() => updateSetting.mutate({ key: settingKey, value: "" })}
          title="Use default model"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
      <ModelCombobox
        groups={grouped}
        selected={selected}
        onSelect={(compositeKey) =>
          updateSetting.mutate({ key: settingKey, value: compositeKey })
        }
        disabled={models.length === 0}
        placeholder="Default model"
      />
    </div>
  )
}
