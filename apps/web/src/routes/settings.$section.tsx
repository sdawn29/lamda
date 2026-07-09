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
import { CodeSearchSection } from "@/features/settings/sections/code-search"
import { AgentsSection } from "@/features/settings/sections/agents"
import { ModesSection } from "@/features/settings/sections/modes"
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
  modes: ModesSection,
  agents: AgentsSection,
  memory: MemorySection,
  "code-search": CodeSearchSection,
  retry: RetrySection,
  about: AboutSection,
}

interface SettingsSectionSearch {
  /** Active MCP server form: "new" to add, or a server name to edit. */
  server?: string
  /** Active mode editor: "new" to create, or a mode id to edit. */
  mode?: string
  /** Active agent editor: "new" to create, or an agent id to edit. */
  agent?: string
  /** Workspace the modes/agents lists and editors operate on. */
  ws?: string
}

export const Route = createFileRoute("/settings/$section")({
  validateSearch: (search: Record<string, unknown>): SettingsSectionSearch => ({
    server: typeof search.server === "string" ? search.server : undefined,
    mode: typeof search.mode === "string" ? search.mode : undefined,
    agent: typeof search.agent === "string" ? search.agent : undefined,
    ws: typeof search.ws === "string" ? search.ws : undefined,
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
  const { server, mode, agent } = Route.useSearch()
  const section = findSettingsSection(slug)!
  const Component = SECTION_COMPONENTS[slug]!

  // Editor forms take over the full page, providing their own header/chrome.
  if (
    (slug === "mcp" && server) ||
    (slug === "modes" && mode) ||
    (slug === "agents" && agent)
  ) {
    return <Component />
  }

  return (
    <SettingsContent section={section}>
      <Component />
    </SettingsContent>
  )
}
