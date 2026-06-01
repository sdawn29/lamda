import { createFileRoute } from "@tanstack/react-router"
import { WorkspaceEmptyState } from "@/features/workspace"

export const Route = createFileRoute("/onboard")({
  component: Onboard,
})

function Onboard() {
  return <WorkspaceEmptyState />
}
