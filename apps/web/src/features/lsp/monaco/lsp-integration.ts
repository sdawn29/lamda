/**
 * Glue between our lightweight LSP client and Monaco.
 *
 * Hover and definition providers are registered globally per language, but
 * multiple file viewers can be open at once (a file tab and the diff review
 * panel may show different files, each backed by a different workspace
 * connection). So instead of registering one provider per editor — which would
 * fire N times and not know which connection to use — we register once and
 * dispatch on the model's URI through a small registry that each viewer
 * populates on mount.
 */
import type { editor, languages, Uri } from "monaco-editor"
import { monaco, ensureMonacoEnvironment } from "./monaco-environment"
import type { ColorTheme, ThemePalette } from "../../themes/types"
import type {
  Diagnostic,
  Hover,
  Location,
  LocationLink,
  LspConnection,
  MarkupContent,
  Range,
  SignatureHelp,
} from ".."
import {
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFO,
} from "../types"

export interface ModelLspEntry {
  connection: LspConnection | null
  filePath: string | null
  /** Route a cross-file go-to-definition target to the app's tab system. */
  onOpenFile?: (filePath: string, title: string, line?: number) => void
}

/** model URI string -> live LSP context for that model */
const registry = new Map<string, ModelLspEntry>()

export function registerModelLsp(uri: string, entry: ModelLspEntry) {
  registry.set(uri, entry)
}

export function unregisterModelLsp(uri: string) {
  registry.delete(uri)
}

let providersRegistered = false

function languageSelector(): languages.LanguageSelector {
  const ids = monaco.languages.getLanguages().map((l) => l.id)
  return ids.length > 0 ? ids : "*"
}

/**
 * Register the hover and definition providers once, for all languages, plus a
 * single editor opener. This lets Monaco drive go-to-definition natively
 * (cmd/ctrl-click, F12, peek, the right-click menu) instead of a hand-rolled
 * mouse handler. Same-file targets reveal in place; cross-file targets are
 * returned under a `file:` URI that has no model, so Monaco hands them to the
 * editor opener, which routes through the app's tab system.
 */
export function ensureLspProviders() {
  ensureMonacoEnvironment()
  if (providersRegistered) return
  providersRegistered = true

  const selector = languageSelector()

  monaco.languages.registerDefinitionProvider(selector, {
    async provideDefinition(model, position) {
      const entry = registry.get(model.uri.toString())
      if (!entry?.connection || !entry.filePath) return null
      let result: Location | Location[] | LocationLink[] | null
      try {
        result = await entry.connection.definition(entry.filePath, {
          line: position.lineNumber - 1,
          character: position.column - 1,
        })
      } catch {
        return null
      }
      return locationsToMonaco(result, entry.filePath, model.uri)
    },
  })

  // Invoked only for resources other than the source editor's own model, i.e.
  // cross-file definitions. Same-file navigation is handled by Monaco itself.
  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      const model = source.getModel()
      const onOpenFile = model
        ? registry.get(model.uri.toString())?.onOpenFile
        : undefined
      if (!onOpenFile) return false
      const filePath = uriToFilePath(resource.toString())
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      const line =
        selectionOrPosition && "lineNumber" in selectionOrPosition
          ? selectionOrPosition.lineNumber
          : selectionOrPosition && "startLineNumber" in selectionOrPosition
            ? selectionOrPosition.startLineNumber
            : undefined
      onOpenFile(filePath, name, line)
      return true
    },
  })

  monaco.languages.registerHoverProvider(selector, {
    async provideHover(model, position) {
      const entry = registry.get(model.uri.toString())
      if (!entry?.connection || !entry.filePath) return null
      let result: Hover | null
      try {
        result = await entry.connection.hover(entry.filePath, {
          line: position.lineNumber - 1,
          character: position.column - 1,
        })
      } catch {
        return null
      }
      const value = flattenHover(result)
      if (!value) return null
      const range = result?.range
      return {
        contents: [{ value }],
        range: range
          ? {
              startLineNumber: range.start.line + 1,
              startColumn: range.start.character + 1,
              endLineNumber: range.end.line + 1,
              endColumn: range.end.character + 1,
            }
          : undefined,
      }
    },
  })

  monaco.languages.registerSignatureHelpProvider(selector, {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [")"],
    async provideSignatureHelp(model, position) {
      const entry = registry.get(model.uri.toString())
      if (!entry?.connection || !entry.filePath) return null
      let result: SignatureHelp | null
      try {
        result = await entry.connection.signatureHelp(entry.filePath, {
          line: position.lineNumber - 1,
          character: position.column - 1,
        })
      } catch {
        return null
      }
      const value = signatureHelpToMonaco(result)
      if (!value) return null
      return {
        value,
        dispose: () => {},
      }
    },
  })
}

function markdownValue(value: string | MarkupContent | undefined) {
  if (!value) return undefined
  if (typeof value === "string") return value
  return value.value
}

export function flattenHover(hover: Hover | null | undefined): string {
  if (!hover) return ""
  const c = hover.contents
  if (typeof c === "string") return c
  if (Array.isArray(c)) {
    return c
      .map((item) => (typeof item === "string" ? item : item.value))
      .filter(Boolean)
      .join("\n\n")
      .trim()
  }
  if (c && typeof c === "object" && "value" in c) return c.value.trim()
  return ""
}

function signatureHelpToMonaco(
  help: SignatureHelp | null | undefined
): languages.SignatureHelp | null {
  if (!help?.signatures.length) return null
  return {
    activeSignature: help.activeSignature ?? 0,
    activeParameter: help.activeParameter ?? 0,
    signatures: help.signatures.map((sig) => ({
      label: sig.label,
      documentation: markdownValue(sig.documentation),
      parameters:
        sig.parameters?.map((param) => ({
          label: param.label,
          documentation: markdownValue(param.documentation),
        })) ?? [],
      activeParameter: sig.activeParameter,
    })),
  }
}

export function diagnosticsToMarkers(
  diagnostics: Diagnostic[]
): editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    message: d.message,
    severity: severityToMarker(d.severity),
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    source: d.source,
    code: d.code === undefined ? undefined : String(d.code),
  }))
}

function severityToMarker(severity?: number): number {
  switch (severity) {
    case SEVERITY_ERROR:
      return monaco.MarkerSeverity.Error
    case SEVERITY_WARNING:
      return monaco.MarkerSeverity.Warning
    case SEVERITY_INFO:
      return monaco.MarkerSeverity.Info
    default:
      return monaco.MarkerSeverity.Hint
  }
}

export function uriToFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice("file://".length))
  }
  return uri
}

/** Normalize an LSP Location/LocationLink to a file path + 0-indexed range. */
function normalizeLocation(item: Location | LocationLink): {
  filePath: string
  range: Range
} {
  if ("targetUri" in item) {
    return {
      filePath: uriToFilePath(item.targetUri),
      range: item.targetSelectionRange ?? item.targetRange,
    }
  }
  return { filePath: uriToFilePath(item.uri), range: item.range }
}

/**
 * Map LSP definition results to Monaco locations. Targets in the current file
 * keep the model's own URI (so Monaco reveals them in place); others get a
 * `file:` URI that the editor opener resolves through the app's tab system.
 */
function locationsToMonaco(
  result: Location | Location[] | LocationLink[] | null,
  currentFilePath: string,
  currentUri: Uri
): languages.Location[] {
  if (!result) return []
  const arr = Array.isArray(result) ? result : [result]
  return arr.map((item) => {
    const { filePath, range } = normalizeLocation(item)
    return {
      uri: filePath === currentFilePath ? currentUri : monaco.Uri.file(filePath),
      range: {
        startLineNumber: range.start.line + 1,
        startColumn: range.start.character + 1,
        endLineNumber: range.end.line + 1,
        endColumn: range.end.character + 1,
      },
    }
  })
}

/**
 * Map our language ids (extension-derived, see shared/lib/language-map) to
 * Monaco language ids. Anything unknown is handed to Monaco as-is and, failing
 * that, Monaco infers from the model path extension.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  tsx: "typescript",
  jsx: "javascript",
  mjsx: "javascript",
  cjsx: "javascript",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  htm: "html",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  rs: "rust",
  py: "python",
  rb: "ruby",
}

let knownLanguages: Set<string> | null = null

export function resolveMonacoLanguage(language: string): string | undefined {
  const aliased = LANGUAGE_ALIASES[language] ?? language
  if (!knownLanguages) {
    knownLanguages = new Set(monaco.languages.getLanguages().map((l) => l.id))
  }
  return knownLanguages.has(aliased) ? aliased : undefined
}

const DARK_THEME = "lamda-dark"
const LIGHT_THEME = "lamda-light"
/** Signature of the last applied theme, to skip redundant redefines. */
let lastThemeKey: string | null = null

/**
 * Monaco's theme API only accepts literal colors, not CSS variables, so the
 * active color theme's tokens (which otherwise drive the UI via CSS custom
 * properties) are mapped onto this intermediate palette and then onto Monaco's
 * editor/widget color tokens. Derived live from the active theme so the editor
 * — including all native widgets — re-skins with the rest of the app.
 */
interface Palette {
  background: string
  foreground: string
  popover: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  primary: string
  border: string
  input: string
  destructive: string
  lineNumber: string
  lineNumberActive: string
  warning: string
  info: string
  /** Drop-shadow opacity for floating widgets. */
  shadow: number
}

/** Coerce a token value to a 6-digit hex (no `#`); falls back when not hex. */
function toHex6(value: string, fallback: string): string {
  const v = value.trim()
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(v)
  if (m6) return m6[1].toLowerCase()
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(v)
  if (m3)
    return m3[1]
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()
  return fallback
}

/** Like {@link toHex6} but prefixed with `#` for Monaco color (not token) slots. */
function hexColor(value: string, fallback: string): string {
  return `#${toHex6(value, fallback.replace(/^#/, ""))}`
}

/** Map the app theme tokens onto Monaco's intermediate {@link Palette}. */
function paletteFromTokens(t: ThemePalette, mode: "light" | "dark"): Palette {
  const isDark = mode === "dark"
  return {
    background: hexColor(t.background, isDark ? "0d0d0d" : "f7f7f5"),
    foreground: hexColor(t.foreground, isDark ? "e8e8d3" : "1c1c1c"),
    popover: hexColor(t.popover, isDark ? "161616" : "f0f0ed"),
    secondary: hexColor(t.secondary, isDark ? "222222" : "e8e8e4"),
    muted: hexColor(t.muted, isDark ? "2b2b2b" : "dcdcd8"),
    mutedForeground: hexColor(t["muted-foreground"], isDark ? "9e9e9e" : "6b6b6b"),
    accent: hexColor(t.accent, isDark ? "393939" : "d0d0cb"),
    primary: hexColor(t.primary, isDark ? "3a6090" : "1a4080"),
    border: hexColor(t.border, isDark ? "1e1e1e" : "eaeae7"),
    input: hexColor(t.input, isDark ? "252525" : "e2e2de"),
    destructive: hexColor(t.destructive, isDark ? "cc3333" : "902020"),
    lineNumber: hexColor(t["muted-foreground"], isDark ? "5a5a5a" : "b0b0b0"),
    lineNumberActive: hexColor(t.foreground, isDark ? "a0a0a0" : "505050"),
    warning: hexColor(t["chart-3"], isDark ? "f59e0b" : "b45309"),
    info: hexColor(t["chart-1"], isDark ? "60a5fa" : "2563eb"),
    shadow: isDark ? 0.4 : 0.12,
  }
}

/** Append an alpha channel (0–1) to a #RRGGBB hex, yielding #RRGGBBAA. */
function withAlpha(hex: string, a: number): string {
  const v = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${v}`
}

/**
 * Map the app palette onto Monaco's color tokens so every native widget — not
 * just the editor surface — follows the application's color scheme. Border
 * radius, shadow and UI font are not expressible here; those live as CSS
 * overrides in index.css (see the "Monaco native widgets" block).
 */
function editorColors(p: Palette): Record<string, string> {
  return {
    // ── Editor surface (transparent so the app background shows through) ──
    "editor.background": "#00000000",
    "editor.foreground": p.foreground,
    "editorLineNumber.foreground": p.lineNumber,
    "editorLineNumber.activeForeground": p.lineNumberActive,
    "editorGutter.background": "#00000000",

    // ── Selection / find / occurrence highlights → app primary ──
    "editor.selectionBackground": withAlpha(p.primary, 0.28),
    "editor.inactiveSelectionBackground": withAlpha(p.primary, 0.14),
    "editor.selectionHighlightBackground": withAlpha(p.primary, 0.16),
    "editor.wordHighlightBackground": withAlpha(p.primary, 0.12),
    "editor.wordHighlightStrongBackground": withAlpha(p.primary, 0.18),
    "editor.findMatchBackground": withAlpha(p.primary, 0.4),
    "editor.findMatchHighlightBackground": withAlpha(p.primary, 0.2),
    "editorBracketMatch.background": withAlpha(p.primary, 0.18),
    "editorBracketMatch.border": withAlpha(p.primary, 0.5),
    "editorLink.activeForeground": p.primary,

    // ── Diagnostic squiggles ──
    "editorError.foreground": p.destructive,
    "editorWarning.foreground": p.warning,
    "editorInfo.foreground": p.info,

    // ── Generic widget chrome ──
    focusBorder: withAlpha(p.primary, 0.6),
    foreground: p.foreground,
    "widget.border": p.border,
    "widget.shadow": withAlpha("#000000", p.shadow),

    // ── Floating widgets (hover, find, parameter hints) → popover surface ──
    "editorWidget.background": p.popover,
    "editorWidget.foreground": p.foreground,
    "editorWidget.border": p.border,
    "editorWidget.resizeBorder": withAlpha(p.primary, 0.5),
    "editorHoverWidget.background": p.popover,
    "editorHoverWidget.foreground": p.foreground,
    "editorHoverWidget.border": p.border,
    "editorHoverWidget.statusBarBackground": p.secondary,

    // ── Suggest / completion widget ──
    "editorSuggestWidget.background": p.popover,
    "editorSuggestWidget.foreground": p.foreground,
    "editorSuggestWidget.border": p.border,
    "editorSuggestWidget.selectedBackground": p.accent,
    "editorSuggestWidget.selectedForeground": p.foreground,
    "editorSuggestWidget.highlightForeground": p.primary,
    "editorSuggestWidget.focusHighlightForeground": p.primary,

    // ── Inputs (find field, rename box) ──
    "input.background": p.input,
    "input.foreground": p.foreground,
    "input.border": p.border,
    "inputOption.activeBackground": withAlpha(p.primary, 0.24),
    "inputOption.activeBorder": withAlpha(p.primary, 0.6),
    "inputOption.activeForeground": p.foreground,

    // ── Dropdowns ──
    "dropdown.background": p.popover,
    "dropdown.foreground": p.foreground,
    "dropdown.border": p.border,

    // ── Lists (suggest details, peek results, menu rows) ──
    "list.hoverBackground": withAlpha(p.accent, 0.6),
    "list.focusBackground": p.accent,
    "list.focusForeground": p.foreground,
    "list.activeSelectionBackground": p.accent,
    "list.activeSelectionForeground": p.foreground,
    "list.inactiveSelectionBackground": p.muted,
    "list.highlightForeground": p.primary,

    // ── Context menu ──
    "menu.background": p.popover,
    "menu.foreground": p.foreground,
    "menu.border": p.border,
    "menu.selectionBackground": p.accent,
    "menu.selectionForeground": p.foreground,
    "menu.separatorBackground": p.border,

    // ── Peek view (go-to-definition peek) ──
    "peekView.border": withAlpha(p.primary, 0.6),
    "peekViewEditor.background": p.background,
    "peekViewEditorGutter.background": p.background,
    "peekViewEditor.matchHighlightBackground": withAlpha(p.primary, 0.3),
    "peekViewResult.background": p.popover,
    "peekViewResult.fileForeground": p.foreground,
    "peekViewResult.lineForeground": p.mutedForeground,
    "peekViewResult.selectionBackground": p.accent,
    "peekViewResult.selectionForeground": p.foreground,
    "peekViewResult.matchHighlightBackground": withAlpha(p.primary, 0.3),
    "peekViewTitle.background": p.popover,
    "peekViewTitleLabel.foreground": p.foreground,
    "peekViewTitleDescription.foreground": p.mutedForeground,

    // ── Scrollbars → match the app's themed slider ──
    "scrollbar.shadow": "#00000000",
    "scrollbarSlider.background": withAlpha(p.mutedForeground, 0.22),
    "scrollbarSlider.hoverBackground": withAlpha(p.mutedForeground, 0.5),
    "scrollbarSlider.activeBackground": withAlpha(p.primary, 0.6),

    // ── Progress bar ──
    "progressBar.background": p.primary,
  }
}

/**
 * Map the theme's tokens onto Monaco token-color rules. Roles mirror the Prism
 * palette in `@/features/themes/syntax-builder`, so the editor and the Markdown
 * code blocks highlight code identically. Rules match by longest dot-separated
 * prefix, so each root (e.g. "string") also styles its language-specific
 * variants ("string.yaml", "string.key.json"); more specific rules override.
 */
function syntaxRules(t: ThemePalette): editor.ITokenThemeRule[] {
  const text = toHex6(t.foreground, "808080")
  const comment = toHex6(t["muted-foreground"], "6d6d6d")
  const keyword = toHex6(t["chart-1"], text)
  const string = toHex6(t["chart-2"], text)
  const number = toHex6(t["chart-3"], text)
  const func = toHex6(t["chart-4"], text)
  const property = toHex6(t["chart-5"], text)

  return [
    { token: "", foreground: text },
    { token: "comment", foreground: comment, fontStyle: "italic" },
    { token: "keyword", foreground: keyword },
    { token: "keyword.json", foreground: keyword },
    { token: "boolean", foreground: keyword },
    { token: "operator", foreground: text },
    { token: "operators", foreground: text },
    { token: "delimiter", foreground: text },
    { token: "identifier", foreground: text },
    { token: "variable", foreground: text },
    { token: "namespace", foreground: text },
    { token: "string", foreground: string },
    { token: "string.value.json", foreground: string },
    { token: "string.escape", foreground: keyword },
    { token: "regexp", foreground: string },
    { token: "attribute.value", foreground: string },
    { token: "number", foreground: number },
    { token: "constant", foreground: number },
    { token: "enumMember", foreground: number },
    { token: "variable.parameter", foreground: number },
    { token: "parameter", foreground: number },
    { token: "function", foreground: func },
    { token: "method", foreground: func },
    { token: "macro", foreground: func },
    { token: "annotation", foreground: func },
    { token: "decorator", foreground: func },
    { token: "type", foreground: func },
    { token: "type.identifier", foreground: func },
    { token: "struct", foreground: func },
    { token: "class", foreground: func },
    { token: "interface", foreground: func },
    { token: "enum", foreground: func },
    { token: "tag", foreground: func },
    { token: "metatag", foreground: func },
    { token: "predefined", foreground: func },
    { token: "builtin", foreground: func },
    { token: "support", foreground: func },
    { token: "variable.predefined", foreground: func },
    { token: "property", foreground: property },
    { token: "key", foreground: property },
    { token: "string.key", foreground: property },
    { token: "string.key.json", foreground: property },
    { token: "attribute.name", foreground: property },
  ]
}

type ActiveTheme = Pick<ColorTheme, "light" | "dark">

/** (Re)define the lamda Monaco themes from the active color theme's palettes. */
export function ensureThemes(active: ActiveTheme) {
  const key = JSON.stringify([active.light, active.dark])
  if (key === lastThemeKey) return
  lastThemeKey = key

  monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: syntaxRules(active.dark),
    colors: editorColors(paletteFromTokens(active.dark, "dark")),
  })

  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: syntaxRules(active.light),
    colors: editorColors(paletteFromTokens(active.light, "light")),
  })
}

/**
 * Define the themes from the active palette and apply the one for the current
 * mode. Call this on theme/mode change to re-skin all mounted editors live
 * (the theme name stays stable, so redefining + `setTheme` refreshes them).
 */
export function applyMonacoTheme(active: ActiveTheme, isDark: boolean) {
  ensureThemes(active)
  monaco.editor.setTheme(themeNameFor(isDark))
}

export function themeNameFor(isDark: boolean): string {
  return isDark ? DARK_THEME : LIGHT_THEME
}
