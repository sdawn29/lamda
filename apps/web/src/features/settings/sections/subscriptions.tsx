import { KeyRound } from "lucide-react"

import { SubscriptionsCard } from "../components/provider-cards"
import { SettingsNavCard } from "../components/settings-ui"

export function SubscriptionsSection() {
  return (
    <>
      <SubscriptionsCard />
      <SettingsNavCard
        icon={<KeyRound className="size-4" />}
        title="Prefer pay-as-you-go?"
        description="Add an API key from any supported provider instead."
        section="api-keys"
      />
    </>
  )
}
