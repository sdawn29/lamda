/**
 * JetBrains Fleet syntax highlighting themes for react-syntax-highlighter.
 *
 * Dark palette sourced directly from the Fleet color theme JSON.
 * Light palette derives the same hues darkened for readability on white.
 */

import type { CSSProperties } from "react"

type SyntaxTheme = Record<string, CSSProperties>

// ── Prism (dark — Fleet) ───────────────────────────────────────────────────────

export const jellybeansdark: SyntaxTheme = {
  'code[class*="language-"]': {
    color: "#d6d6dd",
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
    color: "#d6d6dd",
    background: "#181818",
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
  comment: { color: "#6d6d6d", fontStyle: "italic" },
  prolog: { color: "#6d6d6d", fontStyle: "italic" },
  doctype: { color: "#6d6d6d", fontStyle: "italic" },
  cdata: { color: "#6d6d6d", fontStyle: "italic" },

  // Punctuation & default
  punctuation: { color: "#d6d6dd" },

  // Namespaces
  namespace: { color: "#d1d1d1" },

  // Properties / object keys
  property: { color: "#af9cff" },
  // HTML/JSX tags
  tag: { color: "#87c3ff" },
  // Numeric / boolean constants
  constant: { color: "#ebc88d" },
  symbol: { color: "#a8cc7c" },
  deleted: { color: "#f14c4c" },

  boolean: { color: "#83d6c5" },
  number: { color: "#ebc88d" },

  // CSS selectors / inserted diff
  selector: { color: "#83d6c5" },
  "attr-name": { color: "#aaa0fa" },
  // Strings (pink/magenta — Fleet's signature string color)
  string: { color: "#e394dc" },
  char: { color: "#e394dc" },
  builtin: { color: "#82d2ce" },
  inserted: { color: "#15ac91" },

  // Operators
  operator: { color: "#d6d6dd" },
  entity: { color: "#d6d6dd" },
  url: { color: "#83d6c5" },

  // At-rules / keywords
  atrule: { color: "#83d6c5" },
  "attr-value": { color: "#e394dc" },
  keyword: { color: "#83d6c5" },

  // Functions (warm orange-yellow)
  function: { color: "#ebc88d" },
  // Class / type names (light blue)
  "class-name": { color: "#87c3ff" },

  regex: { color: "#d6d6dd" },
  important: { color: "#83d6c5", fontWeight: "bold" },
  // Variables (default text)
  variable: { color: "#d6d6dd" },

  // Template literals (same as strings)
  "template-string": { color: "#e394dc" },
  "template-punctuation": { color: "#83d6c5" },
  interpolation: { color: "#d6d6dd" },
  "interpolation-punctuation": { color: "#83d6c5" },

  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },

  "script-punctuation": { color: "#d6d6dd" },
  spread: { color: "#d6d6dd" },
  // Parameters (yellow)
  parameter: { color: "#f8c762" },

  title: { color: "#d6d6dd", fontWeight: "bold" },
  "code-snippet": { color: "#e394dc" },
}

// ── Prism (light — Fleet-derived) ─────────────────────────────────────────────

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
    background: "#ffffff",
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

  comment: { color: "#6d6d6d", fontStyle: "italic" },
  prolog: { color: "#6d6d6d", fontStyle: "italic" },
  doctype: { color: "#6d6d6d", fontStyle: "italic" },
  cdata: { color: "#6d6d6d", fontStyle: "italic" },

  punctuation: { color: "#1a1a1a" },
  namespace: { color: "#333333" },

  property: { color: "#6438b0" },
  tag: { color: "#1565c0" },
  constant: { color: "#8a5a00" },
  symbol: { color: "#3d7a14" },
  deleted: { color: "#c01010" },

  boolean: { color: "#006b5e" },
  number: { color: "#8a5a00" },

  selector: { color: "#006b5e" },
  "attr-name": { color: "#5540c0" },
  string: { color: "#9a1a95" },
  char: { color: "#9a1a95" },
  builtin: { color: "#00695c" },
  inserted: { color: "#007a60" },

  operator: { color: "#1a1a1a" },
  entity: { color: "#1a1a1a" },
  url: { color: "#006b5e" },

  atrule: { color: "#006b5e" },
  "attr-value": { color: "#9a1a95" },
  keyword: { color: "#006b5e" },

  function: { color: "#7a5000" },
  "class-name": { color: "#1565c0" },

  regex: { color: "#555555" },
  important: { color: "#006b5e", fontWeight: "bold" },
  variable: { color: "#1a1a1a" },

  "template-string": { color: "#9a1a95" },
  "template-punctuation": { color: "#006b5e" },
  interpolation: { color: "#1a1a1a" },
  "interpolation-punctuation": { color: "#006b5e" },

  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },

  "script-punctuation": { color: "#1a1a1a" },
  spread: { color: "#1a1a1a" },
  parameter: { color: "#806000" },

  title: { color: "#1a1a1a", fontWeight: "bold" },
  "code-snippet": { color: "#9a1a95" },
}

// ── hljs (dark — Fleet) ───────────────────────────────────────────────────────

export const jellybeanshljsdark: SyntaxTheme = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1em",
    color: "#d6d6dd",
    background: "#181818",
  },
  "hljs-comment": { color: "#6d6d6d", fontStyle: "italic" },
  "hljs-quote": { color: "#6d6d6d", fontStyle: "italic" },
  "hljs-keyword": { color: "#83d6c5" },
  "hljs-selector-tag": { color: "#83d6c5" },
  "hljs-type": { color: "#87c3ff" },
  "hljs-built_in": { color: "#82d2ce" },
  "hljs-literal": { color: "#83d6c5" },
  "hljs-number": { color: "#ebc88d" },
  "hljs-string": { color: "#e394dc" },
  "hljs-doctag": { color: "#e394dc" },
  "hljs-regexp": { color: "#d6d6dd" },
  "hljs-formula": { color: "#d6d6dd" },
  "hljs-title": { color: "#ebc88d" },
  "hljs-title.function_": { color: "#ebc88d" },
  "hljs-title.class_": { color: "#87c3ff" },
  "hljs-name": { color: "#87c3ff" },
  "hljs-section": { color: "#d6d6dd" },
  "hljs-selector-id": { color: "#aaa0fa" },
  "hljs-selector-class": { color: "#aaa0fa" },
  "hljs-variable": { color: "#d6d6dd" },
  "hljs-params": { color: "#f8c762" },
  "hljs-template-variable": { color: "#d6d6dd" },
  "hljs-attr": { color: "#aaa0fa" },
  "hljs-attribute": { color: "#af9cff" },
  "hljs-symbol": { color: "#a8cc7c" },
  "hljs-bullet": { color: "#d6d6dd" },
  "hljs-link": { color: "#83d6c5", textDecoration: "underline" },
  "hljs-meta": { color: "#a8cc7c" },
  "hljs-subst": { color: "#d6d6dd" },
  "hljs-deletion": { color: "#f14c4c" },
  "hljs-addition": { color: "#15ac91" },
  "hljs-emphasis": { fontStyle: "italic" },
  "hljs-strong": { fontWeight: "bold" },
  "hljs-operator": { color: "#d6d6dd" },
  "hljs-punctuation": { color: "#d6d6dd" },
  "hljs-property": { color: "#af9cff" },
  "hljs-char.escape_": { color: "#d6d6dd" },
}

// ── hljs (light — Fleet-derived) ──────────────────────────────────────────────

export const jellybeanshljslight: SyntaxTheme = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1em",
    color: "#1a1a1a",
    background: "#ffffff",
  },
  "hljs-comment": { color: "#6d6d6d", fontStyle: "italic" },
  "hljs-quote": { color: "#6d6d6d", fontStyle: "italic" },
  "hljs-keyword": { color: "#006b5e" },
  "hljs-selector-tag": { color: "#006b5e" },
  "hljs-type": { color: "#1565c0" },
  "hljs-built_in": { color: "#00695c" },
  "hljs-literal": { color: "#006b5e" },
  "hljs-number": { color: "#8a5a00" },
  "hljs-string": { color: "#9a1a95" },
  "hljs-doctag": { color: "#9a1a95" },
  "hljs-regexp": { color: "#555555" },
  "hljs-formula": { color: "#555555" },
  "hljs-title": { color: "#7a5000" },
  "hljs-title.function_": { color: "#7a5000" },
  "hljs-title.class_": { color: "#1565c0" },
  "hljs-name": { color: "#1565c0" },
  "hljs-section": { color: "#1a1a1a" },
  "hljs-selector-id": { color: "#5540c0" },
  "hljs-selector-class": { color: "#5540c0" },
  "hljs-variable": { color: "#1a1a1a" },
  "hljs-params": { color: "#806000" },
  "hljs-template-variable": { color: "#1a1a1a" },
  "hljs-attr": { color: "#5540c0" },
  "hljs-attribute": { color: "#6438b0" },
  "hljs-symbol": { color: "#3d7a14" },
  "hljs-bullet": { color: "#1a1a1a" },
  "hljs-link": { color: "#006b5e", textDecoration: "underline" },
  "hljs-meta": { color: "#3d7a14" },
  "hljs-subst": { color: "#1a1a1a" },
  "hljs-deletion": { color: "#c01010" },
  "hljs-addition": { color: "#007a60" },
  "hljs-emphasis": { fontStyle: "italic" },
  "hljs-strong": { fontWeight: "bold" },
  "hljs-operator": { color: "#1a1a1a" },
  "hljs-punctuation": { color: "#1a1a1a" },
  "hljs-property": { color: "#6438b0" },
  "hljs-char.escape_": { color: "#555555" },
}
