import type { ComponentType } from "react"
import {
  Brain,
  ChartColumn,
  Code2,
  Database,
  DollarSign,
  Gauge,
  GitBranch,
  Key,
  Keyboard,
  MessageSquare,
  Palette,
  Plug,
  RefreshCw,
  Server,
} from "lucide-react"

export interface SettingsSectionMeta {
  /** URL slug used in the route path (`/settings/<slug>`) */
  slug: string
  /** Short label shown in the sidebar */
  label: string
  /** Heading shown at the top of the section */
  title: string
  /** Subtitle under the heading */
  description: string
  /** Lucide icon component */
  icon: ComponentType<{ className?: string }>
  /** Group the section belongs to */
  group: SettingsGroupId
  /** Search keywords */
  keywords: string[]
}

export type SettingsGroupId =
  | "interface"
  | "providers"
  | "customization"
  | "system"

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: "interface", label: "Interface" },
  { id: "providers", label: "AI Providers" },
  { id: "customization", label: "Customization" },
  { id: "system", label: "System" },
]

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    slug: "appearance",
    label: "Appearance",
    title: "Appearance",
    description: "Choose how the application looks and feels.",
    icon: Palette,
    group: "interface",
    keywords: ["theme", "dark", "light", "system", "color", "mode", "font", "typeface", "monospace", "chat", "code"],
  },
  {
    slug: "chat",
    label: "Chat",
    title: "Chat",
    description: "Control how assistant responses are displayed.",
    icon: MessageSquare,
    group: "interface",
    keywords: [
      "thinking",
      "reasoning",
      "phrases",
      "loading",
      "indicator",
      "model",
      "visible",
      "hidden",
      "title",
      "thread title",
      "title prompt",
      "title model",
      "generation",
    ],
  },
  {
    slug: "subscriptions",
    label: "Subscriptions",
    title: "Subscriptions",
    description: "Sign in with Claude Pro, GitHub Copilot, and more.",
    icon: DollarSign,
    group: "providers",
    keywords: [
      "oauth",
      "subscription",
      "sign in",
      "claude pro",
      "copilot",
      "login",
    ],
  },
  {
    slug: "api-keys",
    label: "API Keys",
    title: "API Keys",
    description:
      "Configure API keys for each provider. Keys are stored in auth.json.",
    icon: Key,
    group: "providers",
    keywords: [
      "api key",
      "anthropic",
      "openai",
      "google",
      "mistral",
      "groq",
      "xai",
      "provider",
      "secret",
      "token",
    ],
  },
  {
    slug: "local-models",
    label: "Local Models",
    title: "Local Models",
    description:
      "Connect local model servers like Ollama, LM Studio, or vLLM.",
    icon: Server,
    group: "providers",
    keywords: [
      "local",
      "ollama",
      "lm studio",
      "lmstudio",
      "vllm",
      "offline",
      "models.json",
      "custom provider",
      "base url",
      "self-hosted",
    ],
  },
  {
    slug: "usage",
    label: "AI Usage",
    title: "AI Usage",
    description:
      "Track tokens, cost, and model activity across all your workspaces.",
    icon: ChartColumn,
    group: "providers",
    keywords: [
      "usage",
      "tokens",
      "cost",
      "spend",
      "model",
      "input",
      "output",
      "cache",
      "statistics",
      "dashboard",
      "workspace",
    ],
  },
  {
    slug: "git",
    label: "Git",
    title: "Git",
    description:
      "Customize the AI prompt used to generate commit messages from staged diffs.",
    icon: GitBranch,
    group: "customization",
    keywords: ["commit", "message", "diff", "prompt", "ai", "git", "staged", "model"],
  },
  {
    slug: "memory",
    label: "Memory",
    title: "Memory & Self-Healing",
    description:
      "Manage what the agent remembers across sessions and how it recovers from errors.",
    icon: Brain,
    group: "customization",
    keywords: [
      "memory",
      "remember",
      "learn",
      "lessons",
      "forget",
      "self-healing",
      "healing",
      "recover",
      "retry",
      "auto-fix",
    ],
  },
  {
    slug: "shortcuts",
    label: "Shortcuts",
    title: "Keyboard Shortcuts",
    description:
      "Customize bindings for all actions. Click a binding to record a new one.",
    icon: Keyboard,
    group: "customization",
    keywords: [
      "keyboard",
      "hotkey",
      "keybinding",
      "shortcut",
      "binding",
      "keys",
    ],
  },
  {
    slug: "mcp",
    label: "MCP Servers",
    title: "MCP Servers",
    description:
      "Connect external tools to the agent via Model Context Protocol. Servers are shared across all workspaces.",
    icon: Plug,
    group: "system",
    keywords: [
      "mcp",
      "model context protocol",
      "server",
      "tools",
      "integration",
      "external",
      "plugin",
    ],
  },
  {
    slug: "lsp",
    label: "LSP Config",
    title: "LSP Config",
    description: "Review language server commands and install status.",
    icon: Code2,
    group: "system",
    keywords: [
      "lsp",
      "language server",
      "diagnostics",
      "hover",
      "definition",
      "typescript",
      "python",
      "rust",
      "go",
      "path",
    ],
  },
  {
    slug: "retry",
    label: "Retry",
    title: "Retry",
    description: "Configure retry behavior and timeout for provider requests.",
    icon: Gauge,
    group: "system",
    keywords: [
      "retry",
      "timeout",
      "max retries",
      "delay",
      "provider",
      "request",
    ],
  },
  {
    slug: "updates",
    label: "Updates",
    title: "Updates",
    description: "Manage app updates and view the current version.",
    icon: RefreshCw,
    group: "system",
    keywords: [
      "update",
      "version",
      "install",
      "download",
      "upgrade",
      "release",
    ],
  },
  {
    slug: "data",
    label: "Data",
    title: "Data",
    description: "Manage your locally stored application data.",
    icon: Database,
    group: "system",
    keywords: [
      "delete",
      "reset",
      "workspace",
      "thread",
      "message",
      "data",
      "wipe",
    ],
  },
]

export const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0].slug

export function findSettingsSection(
  slug: string
): SettingsSectionMeta | undefined {
  return SETTINGS_SECTIONS.find((s) => s.slug === slug)
}

export function matchesSearch(
  section: SettingsSectionMeta,
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    section.label.toLowerCase().includes(q) ||
    section.title.toLowerCase().includes(q) ||
    section.description.toLowerCase().includes(q) ||
    section.keywords.some((k) => k.includes(q))
  )
}
