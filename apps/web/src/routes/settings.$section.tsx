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
import { McpSection } from "@/features/settings/sections/mcp"
import { RetrySection } from "@/features/settings/sections/retry"
import { MemorySection } from "@/features/settings/sections/memory"
import { UsageSection } from "@/features/settings/sections/usage"
import { AboutSection } from "@/features/settings/sections/about"

const SECTION_COMPONENTS: Record<string, () => React.JSX.Element> = {
  appearance: AppearanceSection,
  chat: ChatSection,
  subscriptions: SubscriptionsSection,
  "api-keys": ApiKeysSection,
  "local-models": LocalModelsSection,
  usage: UsageSection,
  git: GitSection,
  shortcuts: ShortcutsSection,
  lsp: LspSection,
  mcp: McpSection,
  memory: MemorySection,
  retry: RetrySection,
  about: AboutSection,
}

interface SettingsSectionSearch {
  /** Active MCP server form: "new" to add, or a server name to edit. */
  server?: string
}

export const Route = createFileRoute("/settings/$section")({
  validateSearch: (search: Record<string, unknown>): SettingsSectionSearch => ({
    server: typeof search.server === "string" ? search.server : undefined,
  }),
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
  const { server } = Route.useSearch()
  const section = findSettingsSection(slug)!
  const Component = SECTION_COMPONENTS[slug]!

  // The MCP form takes over the full page, providing its own header/chrome.
  if (slug === "mcp" && server) {
    return <Component />
  }

  return (
    <SettingsContent section={section}>
      <Component />
    </SettingsContent>
  )
}
