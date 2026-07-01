import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "./storage-keys"

export function useShowThinkingSetting(): boolean {
  const { data: settings } = useAppSettings()
  return settings?.[APP_SETTINGS_KEYS.SHOW_THINKING] !== "0"
}
