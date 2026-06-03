/**
 * Back-compat shim. The theming engine now lives in `@/features/themes`; this
 * module re-exports its public surface so existing imports of
 * `@/shared/components/theme-provider` keep working unchanged.
 */
export { ThemeProvider, useTheme } from "@/features/themes/theme-engine"
export type { ThemeMode, ResolvedMode } from "@/features/themes/types"
