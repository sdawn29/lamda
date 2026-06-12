import * as React from "react"

import { useAppSettings } from "@/features/settings/queries"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"

import { applyColorTheme } from "./apply-theme"
import { applyFonts } from "./apply-fonts"
import {
  DEFAULT_UI_FONT_ID,
  DEFAULT_CHAT_FONT_ID,
  DEFAULT_MONO_FONT_ID,
  DEFAULT_CODE_FONT_ID,
  SANS_FONTS,
  MONO_FONTS,
  resolveAnyFontValue,
} from "./font-options"
import {
  isGoogleFontId,
  googleFontFamilyFromId,
  loadGoogleFont,
} from "./google-fonts-loader"
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, getThemeById } from "./registry"
import {
  CUSTOM_THEME_ID,
  customDataFromTheme,
  customThemeFromData,
  parseCustomData,
  serializeCustomData,
  setCustomCodeToken,
  setCustomToken,
} from "./custom-theme"
import type { CodeTokenKey } from "./code-tokens"
import type {
  ColorTheme,
  CustomThemeData,
  ResolvedMode,
  ThemeColorKey,
  ThemeMode,
} from "./types"

/**
 * The single source of truth for appearance. Combines two orthogonal axes:
 *
 *  - **mode** — light / dark / system (toggles the `.light` / `.dark` class)
 *  - **color theme** — which palette fills the CSS custom properties
 *
 * Both persist through the server-backed app settings store, so the choice
 * follows the user across windows and restarts. The active theme's tokens are
 * injected into a managed `<style>` element (see `apply-theme.ts`); the `.dark`
 * class then selects which half of the palette is live.
 */

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: ThemeMode
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  /** light / dark / system preference. */
  theme: ThemeMode
  /** Concrete mode after resolving `system`. */
  resolvedTheme: ResolvedMode
  setTheme: (theme: ThemeMode) => void
  /** Active color-theme id. */
  colorTheme: string
  /** Full active color-theme definition. */
  activeColorTheme: ColorTheme
  setColorTheme: (id: string) => void
  /** All selectable color themes, including the editable custom theme. */
  colorThemes: ColorTheme[]
  /** Whether the active theme is the user-editable custom theme. */
  isCustomActive: boolean
  /** Current custom theme palettes (always defined; seeded from default). */
  customData: CustomThemeData
  /** Replace the whole custom theme (e.g. import / seed-from-built-in). */
  setCustomData: (data: CustomThemeData) => void
  /** Update a single token in one mode of the custom theme. */
  updateCustomToken: (
    mode: ResolvedMode,
    key: ThemeColorKey,
    value: string
  ) => void
  /** Update a single code (syntax) token in one mode of the custom theme. */
  updateCustomCodeToken: (
    mode: ResolvedMode,
    key: CodeTokenKey,
    value: string
  ) => void
  /** Active font setting IDs. */
  uiFontId: string
  chatFontId: string
  monoFontId: string
  codeFontId: string
  setUiFont: (id: string) => void
  setChatFont: (id: string) => void
  setMonoFont: (id: string) => void
  setCodeFont: (id: string) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: ThemeMode[] = ["dark", "light", "system"]

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(
  undefined
)

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return (
    value !== null &&
    value !== undefined &&
    THEME_VALUES.includes(value as ThemeMode)
  )
}

function getSystemTheme(): ResolvedMode {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const { data: settings } = useAppSettings()
  const updateSetting = useUpdateAppSetting()

  const storedTheme = settings?.[APP_SETTINGS_KEYS.THEME]
  const theme: ThemeMode = isThemeMode(storedTheme) ? storedTheme : defaultTheme

  const colorTheme = settings?.[APP_SETTINGS_KEYS.COLOR_THEME] ?? DEFAULT_THEME_ID
  const isCustomActive = colorTheme === CUSTOM_THEME_ID

  // Custom palettes live in settings as JSON; reconstruct them (seeding from the
  // default theme when absent/corrupt) and build a ColorTheme around them.
  const customData = React.useMemo(
    () =>
      parseCustomData(
        settings?.[APP_SETTINGS_KEYS.CUSTOM_THEME],
        getThemeById(DEFAULT_THEME_ID)
      ),
    [settings]
  )
  const customTheme = React.useMemo(
    () => customThemeFromData(customData),
    [customData]
  )

  const activeColorTheme = isCustomActive ? customTheme : getThemeById(colorTheme)

  const colorThemes = React.useMemo(
    () => [...BUILT_IN_THEMES, customTheme],
    [customTheme]
  )

  const [systemTheme, setSystemTheme] = React.useState<ResolvedMode>(() =>
    getSystemTheme()
  )
  const resolvedTheme = theme === "system" ? systemTheme : theme

  const setTheme = React.useCallback(
    (nextTheme: ThemeMode) => {
      updateSetting.mutate({ key: APP_SETTINGS_KEYS.THEME, value: nextTheme })
    },
    [updateSetting]
  )

  const setCustomData = React.useCallback(
    (data: CustomThemeData) => {
      updateSetting.mutate({
        key: APP_SETTINGS_KEYS.CUSTOM_THEME,
        value: serializeCustomData(data),
      })
    },
    [updateSetting]
  )

  // Latest custom data in a ref so token edits compose without re-creating the
  // callback (and without racing the async settings round-trip).
  const customDataRef = React.useRef(customData)
  React.useEffect(() => {
    customDataRef.current = customData
  }, [customData])

  const updateCustomToken = React.useCallback(
    (mode: ResolvedMode, key: ThemeColorKey, value: string) => {
      setCustomData(setCustomToken(customDataRef.current, mode, key, value))
    },
    [setCustomData]
  )

  const updateCustomCodeToken = React.useCallback(
    (mode: ResolvedMode, key: CodeTokenKey, value: string) => {
      setCustomData(setCustomCodeToken(customDataRef.current, mode, key, value))
    },
    [setCustomData]
  )

  const setColorTheme = React.useCallback(
    (id: string) => {
      // First time the user picks "Custom", seed it from whatever is active so
      // they start from a coherent palette rather than a blank one.
      if (
        id === CUSTOM_THEME_ID &&
        !settings?.[APP_SETTINGS_KEYS.CUSTOM_THEME]
      ) {
        setCustomData(customDataFromTheme(activeColorTheme))
      }
      updateSetting.mutate({ key: APP_SETTINGS_KEYS.COLOR_THEME, value: id })
    },
    [updateSetting, settings, activeColorTheme, setCustomData]
  )

  const uiFontId = settings?.[APP_SETTINGS_KEYS.UI_FONT] ?? DEFAULT_UI_FONT_ID
  const chatFontId = settings?.[APP_SETTINGS_KEYS.CHAT_FONT] ?? DEFAULT_CHAT_FONT_ID
  const monoFontId = settings?.[APP_SETTINGS_KEYS.MONO_FONT] ?? DEFAULT_MONO_FONT_ID
  const codeFontId = settings?.[APP_SETTINGS_KEYS.CODE_FONT] ?? DEFAULT_CODE_FONT_ID

  const setUiFont = React.useCallback(
    (id: string) => updateSetting.mutate({ key: APP_SETTINGS_KEYS.UI_FONT, value: id }),
    [updateSetting]
  )
  const setChatFont = React.useCallback(
    (id: string) => updateSetting.mutate({ key: APP_SETTINGS_KEYS.CHAT_FONT, value: id }),
    [updateSetting]
  )
  const setMonoFont = React.useCallback(
    (id: string) => updateSetting.mutate({ key: APP_SETTINGS_KEYS.MONO_FONT, value: id }),
    [updateSetting]
  )
  const setCodeFont = React.useCallback(
    (id: string) => updateSetting.mutate({ key: APP_SETTINGS_KEYS.CODE_FONT, value: id }),
    [updateSetting]
  )

  const applyMode = React.useCallback(
    (nextResolvedTheme: ResolvedMode) => {
      const root = document.documentElement
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(nextResolvedTheme)

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyMode(resolvedTheme)
  }, [resolvedTheme, applyMode])

  // Inject the active palette's CSS variables. Wrapped in the same
  // transition-suppression as the mode switch so re-skinning is flicker-free.
  React.useEffect(() => {
    const restoreTransitions = disableTransitionOnChange
      ? disableTransitionsTemporarily()
      : null
    applyColorTheme(activeColorTheme)
    restoreTransitions?.()
  }, [activeColorTheme, disableTransitionOnChange])

  React.useEffect(() => {
    for (const id of [uiFontId, chatFontId, monoFontId, codeFontId]) {
      if (isGoogleFontId(id)) loadGoogleFont(googleFontFamilyFromId(id))
    }
    applyFonts(
      resolveAnyFontValue(uiFontId, SANS_FONTS),
      resolveAnyFontValue(chatFontId, SANS_FONTS),
      resolveAnyFontValue(monoFontId, MONO_FONTS),
      resolveAnyFontValue(codeFontId, MONO_FONTS)
    )
  }, [uiFontId, chatFontId, monoFontId, codeFontId])

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      setSystemTheme(getSystemTheme())
    }

    handleChange()
    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [])

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_THEME, () => {
    const nextTheme =
      theme === "dark"
        ? "light"
        : theme === "light"
          ? "dark"
          : getSystemTheme() === "dark"
            ? "light"
            : "dark"
    setTheme(nextTheme)
  })

  const value = React.useMemo<ThemeProviderState>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      colorTheme,
      activeColorTheme,
      setColorTheme,
      colorThemes,
      isCustomActive,
      customData,
      setCustomData,
      updateCustomToken,
      updateCustomCodeToken,
      uiFontId,
      chatFontId,
      monoFontId,
      codeFontId,
      setUiFont,
      setChatFont,
      setMonoFont,
      setCodeFont,
    }),
    [
      theme,
      resolvedTheme,
      setTheme,
      colorTheme,
      activeColorTheme,
      setColorTheme,
      colorThemes,
      isCustomActive,
      customData,
      setCustomData,
      updateCustomToken,
      updateCustomCodeToken,
      uiFontId,
      chatFontId,
      monoFontId,
      codeFontId,
      setUiFont,
      setChatFont,
      setMonoFont,
      setCodeFont,
    ]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
