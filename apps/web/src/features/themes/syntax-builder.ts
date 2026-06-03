/**
 * Derive code-highlighting palettes from a theme's UI tokens.
 *
 * Hand-authoring a Prism + hljs palette for every theme is a lot of surface and
 * drifts out of sync. Instead we map the theme's structural tokens onto
 * syntax roles so any theme — including user-created ones — gets coherent,
 * on-brand code highlighting for free. Themes that want pixel-perfect control
 * can still ship an explicit `syntax` set (see {@link ColorTheme}).
 */

import type { SyntaxTheme, SyntaxThemeSet, ThemePalette } from "./types"

const MONO = "var(--font-mono, ui-monospace, monospace)"

/**
 * Assign theme tokens to syntax roles. The five chart colors carry the
 * semantic hues; foreground/muted-foreground handle plain text and comments.
 */
function roles(p: ThemePalette) {
  return {
    bg: p.card,
    text: p.foreground,
    comment: p["muted-foreground"],
    keyword: p["chart-1"],
    string: p["chart-2"],
    number: p["chart-3"],
    func: p["chart-4"],
    property: p["chart-5"],
    deleted: p.destructive,
    inserted: p["chart-2"],
  }
}

export function buildPrismTheme(palette: ThemePalette): SyntaxTheme {
  const c = roles(palette)
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
    tag: { color: c.func },
    constant: { color: c.number },
    symbol: { color: c.property },
    deleted: { color: c.deleted },

    boolean: { color: c.keyword },
    number: { color: c.number },

    selector: { color: c.keyword },
    "attr-name": { color: c.property },
    string: { color: c.string },
    char: { color: c.string },
    builtin: { color: c.func },
    inserted: { color: c.inserted },

    operator: { color: c.text },
    entity: { color: c.text },
    url: { color: c.keyword },

    atrule: { color: c.keyword },
    "attr-value": { color: c.string },
    keyword: { color: c.keyword },

    function: { color: c.func },
    "class-name": { color: c.func },

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
    parameter: { color: c.number },

    title: { color: c.text, fontWeight: "bold" },
    "code-snippet": { color: c.string },
  }
}

export function buildHljsTheme(palette: ThemePalette): SyntaxTheme {
  const c = roles(palette)
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
    "hljs-type": { color: c.func },
    "hljs-built_in": { color: c.func },
    "hljs-literal": { color: c.keyword },
    "hljs-number": { color: c.number },
    "hljs-string": { color: c.string },
    "hljs-doctag": { color: c.string },
    "hljs-regexp": { color: c.string },
    "hljs-formula": { color: c.text },
    "hljs-title": { color: c.func },
    "hljs-title.function_": { color: c.func },
    "hljs-title.class_": { color: c.func },
    "hljs-name": { color: c.func },
    "hljs-section": { color: c.text },
    "hljs-selector-id": { color: c.property },
    "hljs-selector-class": { color: c.property },
    "hljs-variable": { color: c.text },
    "hljs-params": { color: c.number },
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
export function buildSyntaxThemeSet(palette: ThemePalette): SyntaxThemeSet {
  return {
    prism: buildPrismTheme(palette),
    hljs: buildHljsTheme(palette),
  }
}
