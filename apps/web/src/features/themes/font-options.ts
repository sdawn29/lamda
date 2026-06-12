import { googleFontFamilyValue } from "./google-fonts-data"

export interface FontOption {
  id: string
  label: string
  value: string
}

export const SANS_FONTS: FontOption[] = [
  {
    id: "geist",
    label: "Geist",
    value: '"Geist Variable", sans-serif',
  },
  {
    id: "outfit",
    label: "Outfit",
    value: '"Outfit Variable", sans-serif',
  },
  {
    id: "google-sans",
    label: "Google Sans",
    value: '"Google Sans Flex", sans-serif',
  },
  {
    id: "system",
    label: "System UI",
    value: "system-ui, sans-serif",
  },
]

export const MONO_FONTS: FontOption[] = [
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    value: '"JetBrains Mono Variable", monospace',
  },
  {
    id: "system-mono",
    label: "System Mono",
    value:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
]

export const DEFAULT_UI_FONT_ID = "geist"
export const DEFAULT_CHAT_FONT_ID = "geist"
export const DEFAULT_MONO_FONT_ID = "jetbrains-mono"
export const DEFAULT_CODE_FONT_ID = "jetbrains-mono"

export function getFontById(options: FontOption[], id: string): FontOption {
  return options.find((f) => f.id === id) ?? options[0]!
}

/** Resolves a font ID (bundled or `gf:Family Name`) to a CSS font-family value. */
export function resolveAnyFontValue(
  id: string,
  bundledOptions: FontOption[]
): string {
  if (id.startsWith("gf:")) return googleFontFamilyValue(id.slice(3))
  return getFontById(bundledOptions, id).value
}

/** Returns the human-readable label for any font ID. */
export function resolveFontLabel(id: string, bundledOptions: FontOption[]): string {
  if (id.startsWith("gf:")) return id.slice(3)
  return getFontById(bundledOptions, id).label
}
