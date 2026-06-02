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
let themesDefined = false

/**
 * The app's design tokens (see apps/web/src/index.css), duplicated here as hex
 * so Monaco's theme API — which only accepts literal colors, not CSS variables —
 * can render its native widgets (hover, suggest, peek, find, context menu,
 * scrollbars) against the same palette as the rest of the UI. Keep in sync with
 * the `:root` / `.dark` blocks in index.css.
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

const LIGHT_PALETTE: Palette = {
  background: "#f7f7f5",
  foreground: "#1c1c1c",
  popover: "#f0f0ed",
  secondary: "#e8e8e4",
  muted: "#dcdcd8",
  mutedForeground: "#6b6b6b",
  accent: "#d0d0cb",
  primary: "#1a4080",
  border: "#eaeae7",
  input: "#e2e2de",
  destructive: "#902020",
  lineNumber: "#b0b0b0",
  lineNumberActive: "#505050",
  warning: "#b45309",
  info: "#2563eb",
  shadow: 0.12,
}

const DARK_PALETTE: Palette = {
  background: "#0d0d0d",
  foreground: "#e8e8d3",
  popover: "#161616",
  secondary: "#222222",
  muted: "#2b2b2b",
  mutedForeground: "#9e9e9e",
  accent: "#393939",
  primary: "#3a6090",
  border: "#1e1e1e",
  input: "#252525",
  destructive: "#cc3333",
  lineNumber: "#5a5a5a",
  lineNumberActive: "#a0a0a0",
  warning: "#f59e0b",
  info: "#60a5fa",
  shadow: 0.4,
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

/** Jellybeans-derived themes so Monaco matches the Prism viewer it replaces. */
export function ensureThemes() {
  if (themesDefined) return
  themesDefined = true

  monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    // Rules are matched by longest dot-separated prefix, so each root (e.g.
    // "string") also styles its language-specific variants ("string.yaml",
    // "string.key.json"); more specific rules below override where fleet differs.
    rules: [
      { token: "", foreground: "d6d6dd" },
      { token: "comment", foreground: "6d6d6d", fontStyle: "italic" },
      { token: "keyword", foreground: "83d6c5" },
      { token: "operator", foreground: "d6d6dd" },
      { token: "operators", foreground: "d6d6dd" },
      { token: "delimiter", foreground: "d6d6dd" },
      { token: "string", foreground: "e394dc" },
      { token: "string.escape", foreground: "83d6c5" },
      { token: "regexp", foreground: "d6d6dd" },
      { token: "number", foreground: "ebc88d" },
      { token: "boolean", foreground: "83d6c5" },
      { token: "constant", foreground: "ebc88d" },
      { token: "type", foreground: "87c3ff" },
      { token: "type.identifier", foreground: "87c3ff" },
      { token: "struct", foreground: "87c3ff" },
      { token: "class", foreground: "87c3ff" },
      { token: "interface", foreground: "87c3ff" },
      { token: "enum", foreground: "87c3ff" },
      { token: "enumMember", foreground: "ebc88d" },
      { token: "namespace", foreground: "d1d1d1" },
      { token: "function", foreground: "ebc88d" },
      { token: "method", foreground: "ebc88d" },
      { token: "macro", foreground: "ebc88d" },
      { token: "identifier", foreground: "d6d6dd" },
      { token: "variable", foreground: "d6d6dd" },
      { token: "variable.predefined", foreground: "82d2ce" },
      { token: "variable.parameter", foreground: "f8c762" },
      { token: "parameter", foreground: "f8c762" },
      { token: "predefined", foreground: "82d2ce" },
      { token: "builtin", foreground: "82d2ce" },
      { token: "support", foreground: "82d2ce" },
      { token: "property", foreground: "af9cff" },
      { token: "key", foreground: "af9cff" },
      { token: "string.key", foreground: "af9cff" },
      // The base vs-dark theme ships JSON-specific rules that would otherwise
      // win over the generic ones above (we inherit), so override them too.
      { token: "string.key.json", foreground: "af9cff" },
      { token: "string.value.json", foreground: "e394dc" },
      { token: "keyword.json", foreground: "83d6c5" },
      { token: "annotation", foreground: "ebc88d" },
      { token: "decorator", foreground: "ebc88d" },
      { token: "tag", foreground: "87c3ff" },
      { token: "metatag", foreground: "87c3ff" },
      { token: "attribute.name", foreground: "aaa0fa" },
      { token: "attribute.value", foreground: "e394dc" },
    ],
    colors: editorColors(DARK_PALETTE),
  })

  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "1a1a1a" },
      { token: "comment", foreground: "6d6d6d", fontStyle: "italic" },
      { token: "keyword", foreground: "006b5e" },
      { token: "operator", foreground: "1a1a1a" },
      { token: "operators", foreground: "1a1a1a" },
      { token: "delimiter", foreground: "1a1a1a" },
      { token: "string", foreground: "9a1a95" },
      { token: "string.escape", foreground: "006b5e" },
      { token: "regexp", foreground: "555555" },
      { token: "number", foreground: "8a5a00" },
      { token: "boolean", foreground: "006b5e" },
      { token: "constant", foreground: "8a5a00" },
      { token: "type", foreground: "1565c0" },
      { token: "type.identifier", foreground: "1565c0" },
      { token: "struct", foreground: "1565c0" },
      { token: "class", foreground: "1565c0" },
      { token: "interface", foreground: "1565c0" },
      { token: "enum", foreground: "1565c0" },
      { token: "enumMember", foreground: "8a5a00" },
      { token: "namespace", foreground: "333333" },
      { token: "function", foreground: "7a5000" },
      { token: "method", foreground: "7a5000" },
      { token: "macro", foreground: "7a5000" },
      { token: "identifier", foreground: "1a1a1a" },
      { token: "variable", foreground: "1a1a1a" },
      { token: "variable.predefined", foreground: "00695c" },
      { token: "variable.parameter", foreground: "806000" },
      { token: "parameter", foreground: "806000" },
      { token: "predefined", foreground: "00695c" },
      { token: "builtin", foreground: "00695c" },
      { token: "support", foreground: "00695c" },
      { token: "property", foreground: "6438b0" },
      { token: "key", foreground: "6438b0" },
      { token: "string.key", foreground: "6438b0" },
      { token: "string.key.json", foreground: "6438b0" },
      { token: "string.value.json", foreground: "9a1a95" },
      { token: "keyword.json", foreground: "006b5e" },
      { token: "annotation", foreground: "7a5000" },
      { token: "decorator", foreground: "7a5000" },
      { token: "tag", foreground: "1565c0" },
      { token: "metatag", foreground: "1565c0" },
      { token: "attribute.name", foreground: "5540c0" },
      { token: "attribute.value", foreground: "9a1a95" },
    ],
    colors: editorColors(LIGHT_PALETTE),
  })
}

export function themeNameFor(isDark: boolean): string {
  return isDark ? DARK_THEME : LIGHT_THEME
}
