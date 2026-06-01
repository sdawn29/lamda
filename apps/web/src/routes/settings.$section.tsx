import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  DEFAULT_SETTINGS_SECTION,
  findSettingsSection,
  SettingsContent,
} from "@/features/settings"
import { AppearanceSection } from "@/features/settings/sections/appearance"
import { ChatSection } from "@/features/settings/sections/chat"
import { SubscriptionsSection } from "@/features/settings/sections/subscriptions"
import { ApiKeysSection } from "@/features/settings/sections/api-keys"
import { LocalModelsSection } from "@/features/settings/sections/local-models"
import { GitSection } from "@/features/settings/sections/git"
import { ShortcutsSection } from "@/features/settings/sections/shortcuts"
import { LspSection } from "@/features/settings/sections/lsp"
import { RetrySection } from "@/features/settings/sections/retry"
import { UpdatesSection } from "@/features/settings/sections/updates"
import { DataSection } from "@/features/settings/sections/data"

const SECTION_COMPONENTS: Record<string, () => React.JSX.Element> = {
  appearance: AppearanceSection,
  chat: ChatSection,
  subscriptions: SubscriptionsSection,
  "api-keys": ApiKeysSection,
  "local-models": LocalModelsSection,
  git: GitSection,
  shortcuts: ShortcutsSection,
  lsp: LspSection,
  retry: RetrySection,
  updates: UpdatesSection,
  data: DataSection,
}

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => {
    const section = findSettingsSection(params.section)
    const Component = SECTION_COMPONENTS[params.section]
    if (!section || !Component) {
      throw redirect({
        to: "/settings/$section",
        params: { section: DEFAULT_SETTINGS_SECTION },
        replace: true,
      })
    }
  },
  component: SettingsSectionRoute,
})

function SettingsSectionRoute() {
  const { section: slug } = Route.useParams()
  const section = findSettingsSection(slug)!
  const Component = SECTION_COMPONENTS[slug]!

  return (
    <SettingsContent section={section}>
      <Component />
    </SettingsContent>
  )
}
