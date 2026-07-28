/**
 * Lazy mermaid loader.
 *
 * `mermaid` is by far the heaviest dependency in the web bundle, so it is never
 * imported statically — the dynamic `import()` below keeps it in its own chunk
 * that is only fetched the first time a diagram actually appears on screen.
 */

type MermaidApi = typeof import("mermaid").default

let mermaidPromise: Promise<MermaidApi> | null = null

/** Serialized config the loaded instance was last initialized with. */
let initializedFor: string | null = null

/**
 * Mermaid runs its palette through khroma, which only understands standard CSS
 * color notations. Every theme token in this app is authored as hex (see
 * `features/themes/registry.ts`), so anything else is a custom-theme value we
 * can't trust — drop it and let mermaid fall back to its own default for that
 * slot rather than letting khroma throw mid-render.
 */
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function cssVar(styles: CSSStyleDeclaration, name: string): string | undefined {
  const value = styles.getPropertyValue(name).trim()
  return HEX_COLOR_RE.test(value) ? value : undefined
}

/**
 * Map the app's design tokens onto mermaid's theme variables so diagrams
 * inherit whatever theme is active — including user custom themes — instead of
 * shipping a second hardcoded palette.
 */
function buildThemeVariables(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement)

  const background = cssVar(styles, "--background")
  const foreground = cssVar(styles, "--foreground")
  const primary = cssVar(styles, "--primary")
  const primaryForeground = cssVar(styles, "--primary-foreground")
  const border = cssVar(styles, "--border")
  const muted = cssVar(styles, "--muted")
  const mutedForeground = cssVar(styles, "--muted-foreground")
  const card = cssVar(styles, "--card")

  const variables: Record<string, string | undefined> = {
    background,
    // Node fill / stroke / label.
    primaryColor: muted ?? card,
    primaryBorderColor: border,
    primaryTextColor: foreground,
    // Alternating node shades mermaid derives sections and clusters from.
    secondaryColor: card,
    secondaryBorderColor: border,
    secondaryTextColor: foreground,
    tertiaryColor: background,
    tertiaryBorderColor: border,
    tertiaryTextColor: mutedForeground,
    // Edges and their labels.
    lineColor: border,
    textColor: foreground,
    edgeLabelBackground: background,
    // Notes (sequence diagrams) read as the accent.
    noteBkgColor: muted ?? card,
    noteBorderColor: border,
    noteTextColor: foreground,
    // Actors / participants.
    actorBkg: card,
    actorBorder: primary,
    actorTextColor: foreground,
    signalColor: foreground,
    signalTextColor: foreground,
    labelBoxBkgColor: card,
    labelBoxBorderColor: border,
    labelTextColor: foreground,
    // Errors surface in our own fallback UI, but keep them on-palette anyway.
    errorBkgColor: primary,
    errorTextColor: primaryForeground,
  }

  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables)) {
    if (value) resolved[key] = value
  }
  return resolved
}

/**
 * Resolve the mermaid instance, (re)initializing it whenever the resolved theme
 * tokens differ from the ones it was last configured with.
 *
 * Keying off the computed values rather than a theme id means custom-theme
 * edits are picked up too, and it costs one `getComputedStyle` read per render
 * attempt — which the caller has already debounced.
 */
export async function getMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then((module) => module.default)
  const mermaid = await mermaidPromise

  const styles = getComputedStyle(document.documentElement)
  const config = {
    startOnLoad: false,
    // Keeps mermaid's DOMPurify pass on and disables click handlers and raw
    // HTML in labels. Markdown here can come from an agent or a remote release
    // note, so this is required rather than optional.
    securityLevel: "strict" as const,
    theme: "base" as const,
    fontFamily: styles.getPropertyValue("--app-font-sans").trim() || "inherit",
    themeVariables: buildThemeVariables(),
  }

  const key = JSON.stringify(config)
  if (initializedFor !== key) {
    mermaid.initialize(config)
    initializedFor = key
  }

  return mermaid
}
