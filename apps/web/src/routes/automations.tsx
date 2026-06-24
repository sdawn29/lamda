import { createFileRoute } from "@tanstack/react-router"

import { AutomationsPage } from "@/features/automations"

export const Route = createFileRoute("/automations")({
  component: AutomationsRoute,
})

function AutomationsRoute() {
  return <AutomationsPage />
}
