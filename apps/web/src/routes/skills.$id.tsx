import { createFileRoute } from "@tanstack/react-router"

import { SkillDetailPage } from "@/features/skills"

export const Route = createFileRoute("/skills/$id")({
  component: SkillDetailRoute,
})

function SkillDetailRoute() {
  const { id } = Route.useParams()
  return <SkillDetailPage source={decodeURIComponent(id)} />
}
