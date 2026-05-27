import { createFileRoute, Navigate } from "@tanstack/react-router"

import { DEFAULT_SETTINGS_SECTION } from "@/features/settings"

export const Route = createFileRoute("/settings/")({
  component: SettingsIndex,
})

function SettingsIndex() {
  return (
    <Navigate
      to="/settings/$section"
      params={{ section: DEFAULT_SETTINGS_SECTION }}
      replace
    />
  )
}
