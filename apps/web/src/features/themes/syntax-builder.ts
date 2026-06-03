/**
 * Build the Prism + hljs code-highlighting palettes from a theme's code tokens.
 *
 * The {@link CodePalette} (Fleet defaults, overridable on the custom theme)
 * carries the syntax hues; a few non-code roles (surface, diff add/remove) come
 * from the UI palette. Themes that want pixel-perfect control can still ship an
 * explicit `syntax` set (see {@link ColorTheme}).
 */

import type { CodePalette } from "./code-tokens"
import type { SyntaxTheme, SyntaxThemeSet, ThemePalette } from "./types"

const MONO = "var(--font-mono, ui-monospace, monospace)"

/**
 * Assign code + UI tokens to syntax roles. The code palette carries the
 * semantic hues; the UI palette supplies the surface and diff add/remove tints.
 */
function roles(code: CodePalette, p: ThemePalette) {
  return {
    bg: p.card,
    text: code.text,
    comment: code.comment,
    keyword: code.keyword,
    string: code.string,
    number: code.number,
    func: code.function,
    type: code.type,
    property: code.property,
    parameter: code.parameter,
    builtin: code.builtin,
    deleted: p.destructive,
    inserted: p["chart-2"],
  }
}

export function buildPrismTheme(code: CodePalette, palette: ThemePalette): SyntaxTheme {
  const c = roles(code, palette)
  const base = {
    color: c.text,
    fontFamily: MONO,
    textAlign: "left" as const,
    whiteSpace: "pre" as const,
    wordSpacing: "normal",
    wordBreak: "normal" as const,
    wordWrap: "normal" as const,
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none" as const,
  }

  return {
    'code[class*="language-"]': { ...base, background: "none" },
    'pre[class*="language-"]': {
      ...base,
      background: c.bg,
      padding: "1em",
      margin: "0",
      overflow: "auto",
    },

    comment: { color: c.comment, fontStyle: "italic" },
    prolog: { color: c.comment, fontStyle: "italic" },
    doctype: { color: c.comment, fontStyle: "italic" },
    cdata: { color: c.comment, fontStyle: "italic" },

    punctuation: { color: c.text },
    namespace: { color: c.text },

    property: { color: c.property },
    tag: { color: c.type },
    constant: { color: c.number },
    symbol: { color: c.property },
    deleted: { color: c.deleted },

    boolean: { color: c.keyword },
    number: { color: c.number },

    selector: { color: c.keyword },
    "attr-name": { color: c.property },
    string: { color: c.string },
    char: { color: c.string },
    builtin: { color: c.builtin },
    inserted: { color: c.inserted },

    operator: { color: c.text },
    entity: { color: c.text },
    url: { color: c.keyword },

    atrule: { color: c.keyword },
    "attr-value": { color: c.string },
    keyword: { color: c.keyword },

    function: { color: c.func },
    "class-name": { color: c.type },

    regex: { color: c.string },
    important: { color: c.keyword, fontWeight: "bold" },
    variable: { color: c.text },

    "template-string": { color: c.string },
    "template-punctuation": { color: c.keyword },
    interpolation: { color: c.text },
    "interpolation-punctuation": { color: c.keyword },

    bold: { fontWeight: "bold" },
    italic: { fontStyle: "italic" },

    "script-punctuation": { color: c.text },
    spread: { color: c.text },
    parameter: { color: c.parameter },

    title: { color: c.text, fontWeight: "bold" },
    "code-snippet": { color: c.string },
  }
}

export function buildHljsTheme(code: CodePalette, palette: ThemePalette): SyntaxTheme {
  const c = roles(code, palette)
  return {
    hljs: {
      display: "block",
      overflowX: "auto",
      padding: "1em",
      color: c.text,
      background: c.bg,
    },
    "hljs-comment": { color: c.comment, fontStyle: "italic" },
    "hljs-quote": { color: c.comment, fontStyle: "italic" },
    "hljs-keyword": { color: c.keyword },
    "hljs-selector-tag": { color: c.keyword },
    "hljs-type": { color: c.type },
    "hljs-built_in": { color: c.builtin },
    "hljs-literal": { color: c.keyword },
    "hljs-number": { color: c.number },
    "hljs-string": { color: c.string },
    "hljs-doctag": { color: c.string },
    "hljs-regexp": { color: c.string },
    "hljs-formula": { color: c.text },
    "hljs-title": { color: c.func },
    "hljs-title.function_": { color: c.func },
    "hljs-title.class_": { color: c.type },
    "hljs-name": { color: c.type },
    "hljs-section": { color: c.text },
    "hljs-selector-id": { color: c.property },
    "hljs-selector-class": { color: c.property },
    "hljs-variable": { color: c.text },
    "hljs-params": { color: c.parameter },
    "hljs-template-variable": { color: c.text },
    "hljs-attr": { color: c.property },
    "hljs-attribute": { color: c.property },
    "hljs-symbol": { color: c.property },
    "hljs-bullet": { color: c.text },
    "hljs-link": { color: c.keyword, textDecoration: "underline" },
    "hljs-meta": { color: c.property },
    "hljs-subst": { color: c.text },
    "hljs-deletion": { color: c.deleted },
    "hljs-addition": { color: c.inserted },
    "hljs-emphasis": { fontStyle: "italic" },
    "hljs-strong": { fontWeight: "bold" },
    "hljs-operator": { color: c.text },
    "hljs-punctuation": { color: c.text },
    "hljs-property": { color: c.property },
    "hljs-char.escape_": { color: c.text },
  }
}

/** Build the full {@link SyntaxThemeSet} (prism + hljs) for one mode. */
export function buildSyntaxThemeSet(
  code: CodePalette,
  palette: ThemePalette
): SyntaxThemeSet {
  return {
    prism: buildPrismTheme(code, palette),
    hljs: buildHljsTheme(code, palette),
  }
}
