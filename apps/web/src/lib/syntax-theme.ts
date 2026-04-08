/**
 * Jellybeans Neutral — syntax highlighting themes for react-syntax-highlighter.
 *
 * Provides both Prism and hljs theme objects (dark + light) so every panel
 * (diff, markdown, tool-call) shares the same colour palette.
 */

import type { CSSProperties } from "react"

type SyntaxTheme = Record<string, CSSProperties>

// ── Prism (dark) ───────────────────────────────────────────────────────────────

export const jellybeansdark: SyntaxTheme = {
  'code[class*="language-"]': {
    color: "#c8c8c8",
    background: "none",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    wordWrap: "normal",
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none",
  },
  'pre[class*="language-"]': {
    color: "#c8c8c8",
    background: "#101010",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    wordWrap: "normal",
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none",
    padding: "1em",
    margin: "0",
    overflow: "auto",
  },

  // Comments
  comment: { color: "#808080", fontStyle: "italic" },
  prolog: { color: "#808080", fontStyle: "italic" },
  doctype: { color: "#808080", fontStyle: "italic" },
  cdata: { color: "#808080", fontStyle: "italic" },

  // Punctuation
  punctuation: { color: "#ccccca" },

  // Namespace
  namespace: { color: "#e8c888", fontStyle: "italic" },

  // Properties / tags / constants / symbols
  property: { color: "#c4c4c0" },
  tag: { color: "#8c9ab8" },
  constant: { color: "#c07868" },
  symbol: { color: "#96a878" },
  deleted: { color: "#c07868" },

  // Booleans / numbers
  boolean: { color: "#c07868" },
  number: { color: "#c07868" },

  // Selectors / strings / chars
  selector: { color: "#96a878" },
  "attr-name": { color: "#e8c888", fontStyle: "italic" },
  string: { color: "#96a878" },
  char: { color: "#96a878" },
  builtin: { color: "#cc8070" },
  inserted: { color: "#96a878" },

  // Operators / entities / URLs
  operator: { color: "#96b4c8" },
  entity: { color: "#96b4c8" },
  url: { color: "#8ab0c8" },

  // At-rules / attr values / keywords
  atrule: { color: "#8c9ab8" },
  "attr-value": { color: "#96a878" },
  keyword: { color: "#8c9ab8" },

  // Functions / class names
  function: { color: "#e8c888" },
  "class-name": { color: "#d8b478" },

  // Regex / important / variable
  regex: { color: "#d8b478" },
  important: { color: "#c8a848", fontWeight: "bold" },
  variable: { color: "#beb8d8" },

  // Template strings
  "template-string": { color: "#96a878" },
  "template-punctuation": { color: "#88a478" },
  interpolation: { color: "#88a478" },
  "interpolation-punctuation": { color: "#88a478" },

  // Misc
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },

  // Language-specific
  "script-punctuation": { color: "#ccccca" },
  spread: { color: "#96b4c8" },
  parameter: { color: "#c8c0e0" },

  // Markdown
  title: { color: "#e8c888", fontWeight: "bold" },
  "code-snippet": { color: "#96a878" },
}

// ── Prism (light) ──────────────────────────────────────────────────────────────

export const jellybeanslight: SyntaxTheme = {
  'code[class*="language-"]': {
    color: "#1a1a1a",
    background: "none",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    wordWrap: "normal",
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none",
  },
  'pre[class*="language-"]': {
    color: "#1a1a1a",
    background: "#f5f5f0",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    wordWrap: "normal",
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none",
    padding: "1em",
    margin: "0",
    overflow: "auto",
  },

  comment: { color: "#808080", fontStyle: "italic" },
  prolog: { color: "#808080", fontStyle: "italic" },
  doctype: { color: "#808080", fontStyle: "italic" },
  cdata: { color: "#808080", fontStyle: "italic" },

  punctuation: { color: "#4a4a48" },

  namespace: { color: "#7a5a18", fontStyle: "italic" },

  property: { color: "#3a3a38" },
  tag: { color: "#4a5a78" },
  constant: { color: "#a04838" },
  symbol: { color: "#4a7a3a" },
  deleted: { color: "#a04838" },

  boolean: { color: "#a04838" },
  number: { color: "#a04838" },

  selector: { color: "#4a7a3a" },
  "attr-name": { color: "#7a5a18", fontStyle: "italic" },
  string: { color: "#4a7a3a" },
  char: { color: "#4a7a3a" },
  builtin: { color: "#985040" },
  inserted: { color: "#4a7a3a" },

  operator: { color: "#4a7a98" },
  entity: { color: "#4a7a98" },
  url: { color: "#4a7a98" },

  atrule: { color: "#4a5a78" },
  "attr-value": { color: "#4a7a3a" },
  keyword: { color: "#4a5a78" },

  function: { color: "#7a5a18" },
  "class-name": { color: "#8a6828" },

  regex: { color: "#8a6828" },
  important: { color: "#8a7828", fontWeight: "bold" },
  variable: { color: "#5a4a7a" },

  "template-string": { color: "#4a7a3a" },
  "template-punctuation": { color: "#4a6a3a" },
  interpolation: { color: "#4a6a3a" },
  "interpolation-punctuation": { color: "#4a6a3a" },

  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },

  "script-punctuation": { color: "#4a4a48" },
  spread: { color: "#4a7a98" },
  parameter: { color: "#5a4a7a" },

  title: { color: "#7a5a18", fontWeight: "bold" },
  "code-snippet": { color: "#4a7a3a" },
}

// ── hljs (dark) ────────────────────────────────────────────────────────────────

export const jellybeanshljsdark: SyntaxTheme = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1em",
    color: "#c8c8c8",
    background: "#101010",
  },
  "hljs-comment": { color: "#808080", fontStyle: "italic" },
  "hljs-quote": { color: "#808080", fontStyle: "italic" },
  "hljs-keyword": { color: "#8c9ab8" },
  "hljs-selector-tag": { color: "#8c9ab8" },
  "hljs-type": { color: "#d8b478" },
  "hljs-built_in": { color: "#cc8070" },
  "hljs-literal": { color: "#c07868" },
  "hljs-number": { color: "#c07868" },
  "hljs-string": { color: "#96a878" },
  "hljs-doctag": { color: "#96a878" },
  "hljs-regexp": { color: "#d8b478" },
  "hljs-formula": { color: "#d8b478" },
  "hljs-title": { color: "#e8c888" },
  "hljs-title.function_": { color: "#e8c888" },
  "hljs-title.class_": { color: "#d8b478" },
  "hljs-name": { color: "#8c9ab8" },
  "hljs-section": { color: "#e8c888" },
  "hljs-selector-id": { color: "#8ab0c8" },
  "hljs-selector-class": { color: "#e8c888" },
  "hljs-variable": { color: "#beb8d8" },
  "hljs-params": { color: "#c8c0e0" },
  "hljs-template-variable": { color: "#beb8d8" },
  "hljs-attr": { color: "#e8c888", fontStyle: "italic" },
  "hljs-attribute": { color: "#96a878" },
  "hljs-symbol": { color: "#96a878" },
  "hljs-bullet": { color: "#e8c888" },
  "hljs-link": { color: "#8ab0c8", textDecoration: "underline" },
  "hljs-meta": { color: "#8ab0c8" },
  "hljs-subst": { color: "#c8c8c8" },
  "hljs-deletion": { color: "#c07868" },
  "hljs-addition": { color: "#96a878" },
  "hljs-emphasis": { fontStyle: "italic" },
  "hljs-strong": { fontWeight: "bold" },
  "hljs-operator": { color: "#96b4c8" },
  "hljs-punctuation": { color: "#ccccca" },
  "hljs-property": { color: "#c4c4c0" },
  "hljs-char.escape_": { color: "#cc8078" },
}

// ── hljs (light) ───────────────────────────────────────────────────────────────

export const jellybeanshljslight: SyntaxTheme = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1em",
    color: "#1a1a1a",
    background: "#f5f5f0",
  },
  "hljs-comment": { color: "#808080", fontStyle: "italic" },
  "hljs-quote": { color: "#808080", fontStyle: "italic" },
  "hljs-keyword": { color: "#4a5a78" },
  "hljs-selector-tag": { color: "#4a5a78" },
  "hljs-type": { color: "#8a6828" },
  "hljs-built_in": { color: "#985040" },
  "hljs-literal": { color: "#a04838" },
  "hljs-number": { color: "#a04838" },
  "hljs-string": { color: "#4a7a3a" },
  "hljs-doctag": { color: "#4a7a3a" },
  "hljs-regexp": { color: "#8a6828" },
  "hljs-formula": { color: "#8a6828" },
  "hljs-title": { color: "#7a5a18" },
  "hljs-title.function_": { color: "#7a5a18" },
  "hljs-title.class_": { color: "#8a6828" },
  "hljs-name": { color: "#4a5a78" },
  "hljs-section": { color: "#7a5a18" },
  "hljs-selector-id": { color: "#4a7a98" },
  "hljs-selector-class": { color: "#7a5a18" },
  "hljs-variable": { color: "#5a4a7a" },
  "hljs-params": { color: "#5a4a7a" },
  "hljs-template-variable": { color: "#5a4a7a" },
  "hljs-attr": { color: "#7a5a18", fontStyle: "italic" },
  "hljs-attribute": { color: "#4a7a3a" },
  "hljs-symbol": { color: "#4a7a3a" },
  "hljs-bullet": { color: "#7a5a18" },
  "hljs-link": { color: "#4a7a98", textDecoration: "underline" },
  "hljs-meta": { color: "#4a7a98" },
  "hljs-subst": { color: "#1a1a1a" },
  "hljs-deletion": { color: "#a04838" },
  "hljs-addition": { color: "#4a7a3a" },
  "hljs-emphasis": { fontStyle: "italic" },
  "hljs-strong": { fontWeight: "bold" },
  "hljs-operator": { color: "#4a7a98" },
  "hljs-punctuation": { color: "#4a4a48" },
  "hljs-property": { color: "#3a3a38" },
  "hljs-char.escape_": { color: "#985040" },
}
