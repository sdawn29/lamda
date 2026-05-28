import { createFileRoute, redirect } from "@tanstack/react-router"

import { DEFAULT_SETTINGS_SECTION } from "@/features/settings"

export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({
      to: "/settings/$section",
      params: { section: DEFAULT_SETTINGS_SECTION },
      replace: true,
    })
  },
})
