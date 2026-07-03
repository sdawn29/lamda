import { Sparkles } from "lucide-react"

import { ApiKeysCard } from "../components/provider-cards"
import { SettingsNavCard } from "../components/settings-ui"

export function ApiKeysSection() {
  return (
    <>
      <ApiKeysCard />
      <SettingsNavCard
        icon={<Sparkles className="size-4" />}
        title="Have a subscription?"
        description="Sign in with Claude, ChatGPT, or GitHub Copilot instead — no API key required."
        section="subscriptions"
      />
    </>
  )
}
