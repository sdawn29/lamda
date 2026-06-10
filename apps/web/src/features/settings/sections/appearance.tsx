import type React from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useTheme } from "@/shared/components/theme-provider"
import { ThemePicker, ThemeEditor } from "@/features/themes"
import { useKeyboardShortcuts } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"

import {
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from "../components/settings-ui"

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function AppearanceSection() {
  const { theme, setTheme, isCustomActive } = useTheme()
  const { shortcuts } = useKeyboardShortcuts()
  const activeTheme = THEMES.find(({ value }) => value === theme) ?? THEMES[0]
  const ActiveThemeIcon = activeTheme.icon

  return (
    <SettingsGroup>
      <SettingsRow
        title="Mode"
        description={
          <>
            Choose light, dark, or follow the system.
            {shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME] && (
              <>
                {" "}
                Press{" "}
                <ShortcutKbd
                  binding={shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME]}
                />{" "}
                to toggle quickly.
              </>
            )}
          </>
        }
      >
        <Select
          value={theme}
          onValueChange={(value) => {
            if (typeof value === "string") setTheme(value as Theme)
          }}
        >
          <SelectTrigger className="min-w-32 gap-2" aria-label="Theme">
            <ActiveThemeIcon data-icon="inline-start" />
            <SelectValue>{activeTheme.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {THEMES.map(({ value, label, icon: Icon }) => (
                <SelectItem key={value} value={value}>
                  <Icon data-icon="inline-start" />
                  <span>{label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsStack
        title="Color theme"
        description="The palette used across the entire app, including code blocks."
      >
        <ThemePicker />
      </SettingsStack>

      {isCustomActive && (
        <SettingsStack
          title="Customize tokens"
          description="Edit any color. Changes save automatically and preview live."
        >
          <ThemeEditor />
        </SettingsStack>
      )}
    </SettingsGroup>
  )
}
