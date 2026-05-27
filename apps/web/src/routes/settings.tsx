import { createFileRoute, Outlet } from "@tanstack/react-router"

import { SettingsLayout } from "@/features/settings"

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
})

function SettingsRoute() {
  return (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  )
}
