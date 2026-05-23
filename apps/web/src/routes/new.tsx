import { createFileRoute } from "@tanstack/react-router"

import { NewThreadView } from "@/features/chat"

interface NewThreadSearch {
  ws?: string
}

export const Route = createFileRoute("/new")({
  component: NewThreadRoute,
  validateSearch: (search: Record<string, unknown>): NewThreadSearch => ({
    ws: typeof search.ws === "string" ? search.ws : undefined,
  }),
})

function NewThreadRoute() {
  const { ws } = Route.useSearch()
  return <NewThreadView initialWorkspaceId={ws} />
}
