import { createFileRoute } from "@tanstack/react-router"

import { WorkspaceEmptyState } from "@/features/workspace"
import { OnboardingWizard } from "@/features/onboarding"
import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

export const Route = createFileRoute("/onboard")({
  component: Onboard,
})

function Onboard() {
  const { data: settings, isLoading } = useAppSettings()

  if (isLoading) return null

  // Returning users who already went through onboarding (e.g. after deleting
  // every workspace) skip the intro and land straight on workspace creation.
  if (settings?.[APP_SETTINGS_KEYS.ONBOARDING_COMPLETED] === "true") {
    return <WorkspaceEmptyState />
  }

  return <OnboardingWizard />
}
