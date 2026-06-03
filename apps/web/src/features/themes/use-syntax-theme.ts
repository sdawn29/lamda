import * as React from "react"

import { buildSyntaxThemeSet } from "./syntax-builder"
import { useTheme } from "./theme-engine"
import type { SyntaxThemeSet } from "./types"

/**
 * The code-highlighting palette (Prism + hljs) for the active theme and
 * resolved mode. Returns the theme's hand-tuned `syntax` set when present,
 * otherwise derives one from the UI tokens so every theme — built-in or
 * custom — highlights code coherently.
 *
 * @example
 *   const syntax = useSyntaxTheme()
 *   <PrismCode style={syntax.prism} ... />
 */
export function useSyntaxTheme(): SyntaxThemeSet {
  const { activeColorTheme, resolvedTheme } = useTheme()
  return React.useMemo(() => {
    const explicit = activeColorTheme.syntax?.[resolvedTheme]
    if (explicit) return explicit
    return buildSyntaxThemeSet(activeColorTheme[resolvedTheme])
  }, [activeColorTheme, resolvedTheme])
}
