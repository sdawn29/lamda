import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "./storage-keys"

/**
 * Whether agent messages render with full markdown (real headings, bold,
 * horizontal rules, blockquotes). Off by default — the chat surface flattens
 * those for a denser feel — and opt-in via the Chat settings toggle.
 */
export function useRichChatRenderingSetting(): boolean {
  const { data: settings } = useAppSettings()
  return settings?.[APP_SETTINGS_KEYS.RICH_CHAT_RENDERING] === "1"
}
