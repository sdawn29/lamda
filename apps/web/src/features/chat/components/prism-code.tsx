import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter"
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash"
import c from "react-syntax-highlighter/dist/esm/languages/prism/c"
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp"
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp"
import css from "react-syntax-highlighter/dist/esm/languages/prism/css"
import go from "react-syntax-highlighter/dist/esm/languages/prism/go"
import java from "react-syntax-highlighter/dist/esm/languages/prism/java"
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript"
import json from "react-syntax-highlighter/dist/esm/languages/prism/json"
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx"
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin"
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown"
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup"
import php from "react-syntax-highlighter/dist/esm/languages/prism/php"
import python from "react-syntax-highlighter/dist/esm/languages/prism/python"
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby"
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust"
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql"
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx"
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript"
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml"
import { refractor } from "refractor/core"
import type { CSSProperties } from "react"

let languagesRegistered = false

function ensureLanguagesRegistered() {
  if (languagesRegistered) return

  SyntaxHighlighter.registerLanguage("bash", bash)
  SyntaxHighlighter.registerLanguage("sh", bash)
  SyntaxHighlighter.registerLanguage("c", c)
  SyntaxHighlighter.registerLanguage("cpp", cpp)
  SyntaxHighlighter.registerLanguage("csharp", csharp)
  SyntaxHighlighter.registerLanguage("css", css)
  SyntaxHighlighter.registerLanguage("go", go)
  SyntaxHighlighter.registerLanguage("html", markup)
  SyntaxHighlighter.registerLanguage("xml", markup)
  SyntaxHighlighter.registerLanguage("svg", markup)
  SyntaxHighlighter.registerLanguage("java", java)
  SyntaxHighlighter.registerLanguage("javascript", javascript)
  SyntaxHighlighter.registerLanguage("js", javascript)
  SyntaxHighlighter.registerLanguage("mjs", javascript)
  SyntaxHighlighter.registerLanguage("cjs", javascript)
  SyntaxHighlighter.registerLanguage("json", json)
  SyntaxHighlighter.registerLanguage("jsx", jsx)
  SyntaxHighlighter.registerLanguage("mjsx", jsx)
  SyntaxHighlighter.registerLanguage("cjsx", jsx)
  SyntaxHighlighter.registerLanguage("kotlin", kotlin)
  SyntaxHighlighter.registerLanguage("markdown", markdown)
  SyntaxHighlighter.registerLanguage("md", markdown)
  // Prism's markdown grammar matches entire GFM tables as a single multi-line
  // block token, producing phantom blank lines when split for line numbers.
  // Patch the shared refractor singleton directly after registration.
  const mdGrammar = (refractor as unknown as { languages?: Record<string, Record<string, unknown>> }).languages?.markdown
  if (mdGrammar && "table" in mdGrammar) {
    delete mdGrammar.table
  }
  SyntaxHighlighter.registerLanguage("php", php)
  SyntaxHighlighter.registerLanguage("python", python)
  SyntaxHighlighter.registerLanguage("py", python)
  SyntaxHighlighter.registerLanguage("ruby", ruby)
  SyntaxHighlighter.registerLanguage("rb", ruby)
  SyntaxHighlighter.registerLanguage("rust", rust)
  SyntaxHighlighter.registerLanguage("rs", rust)
  SyntaxHighlighter.registerLanguage("sql", sql)
  SyntaxHighlighter.registerLanguage("tsx", tsx)
  SyntaxHighlighter.registerLanguage("typescript", typescript)
  SyntaxHighlighter.registerLanguage("ts", typescript)
  SyntaxHighlighter.registerLanguage("mts", typescript)
  SyntaxHighlighter.registerLanguage("cts", typescript)
  SyntaxHighlighter.registerLanguage("yaml", yaml)
  SyntaxHighlighter.registerLanguage("yml", yaml)

  languagesRegistered = true
}

interface PrismCodeProps {
  code: string
  language: string
  style: Record<string, CSSProperties>
  showLineNumbers?: boolean
  fontSize?: string
  opacity?: number
}

export default function PrismCode({
  code,
  language,
  style,
  showLineNumbers = false,
  fontSize = "0.75rem",
  opacity = 1,
}: PrismCodeProps) {
  ensureLanguagesRegistered()

  return (
    <SyntaxHighlighter
      language={language}
      style={style}
      PreTag="div"
      showLineNumbers={showLineNumbers}
      className="syntax-highlighter"
      lineNumberStyle={{
        minWidth: "2.5em",
        paddingRight: "1em",
        position: "sticky",
        left: 0,
        zIndex: 1,
        backgroundColor: "var(--background)",
        color: "var(--muted-foreground)",
        userSelect: "none",
        fontStyle: "normal",
        fontWeight: "normal",
        fontSize,
      }}
      customStyle={{
        margin: 0,
        padding: "0.75rem 1rem 0.75rem 0",
        borderRadius: 0,
        fontSize,
        lineHeight: "1.6",
        background: "transparent",
        opacity,
        userSelect: "text",
      }}
      codeTagProps={{
        style: {
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontWeight: "normal",
          fontSize,
        },
      }}
      wrapLongLines={false}
    >
      {code}
    </SyntaxHighlighter>
  )
}
