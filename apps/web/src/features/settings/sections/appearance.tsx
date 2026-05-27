import type React from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { Card, CardContent } from "@/shared/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "@/shared/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useTheme } from "@/shared/components/theme-provider"
import { useKeyboardShortcuts } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const { shortcuts } = useKeyboardShortcuts()
  const activeTheme = THEMES.find(({ value }) => value === theme) ?? THEMES[0]
  const ActiveThemeIcon = activeTheme.icon

  return (
    <Card>
      <CardContent className="px-4 py-0">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Theme</FieldTitle>
            <FieldDescription>
              {shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME] && (
                <>
                  Press{" "}
                  <ShortcutKbd
                    binding={shortcuts[SHORTCUT_ACTIONS.TOGGLE_THEME]}
                  />{" "}
                  to toggle quickly.
                </>
              )}
            </FieldDescription>
          </FieldContent>
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
        </Field>
      </CardContent>
    </Card>
  )
}
