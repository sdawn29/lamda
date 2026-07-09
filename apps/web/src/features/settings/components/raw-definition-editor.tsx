import { useEffect, useRef } from "react"
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import "monaco-editor/esm/vs/basic-languages/mdx/mdx.contribution"
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution"

import { useTheme } from "@/shared/components/theme-provider"
import { cn } from "@/shared/lib/utils"
import type { SaveAgentBody, SaveModeBody } from "@/features/workspace/api"
import { ensureMonacoEnvironment } from "@/features/lsp/monaco/monaco-environment"
import {
  applyMonacoTheme,
  ensureThemes,
  themeNameFor,
} from "@/features/lsp/monaco/lsp-integration"

ensureMonacoEnvironment()

const MARKER_OWNER = "lamda-definition"
const MODE_COLORS = [
  "sky",
  "amber",
  "emerald",
  "violet",
  "rose",
  "blue",
  "teal",
  "orange",
  "fuchsia",
  "slate",
] as const

type MarkerSeverity = "error" | "warning"

export interface RawDefinitionDiagnostic {
  message: string
  line: number
  severity: MarkerSeverity
}

type ParsedField = { value: string; line: number }

interface ParsedFrontmatter {
  fields: Map<string, ParsedField>
  body: string
  bodyLine: number
  diagnostics: RawDefinitionDiagnostic[]
}

export type ParsedRawAgent = Omit<SaveAgentBody, "scope" | "workspaceId">
export type ParsedRawMode = Omit<SaveModeBody, "scope" | "workspaceId">

export type RawParseResult<T> =
  | { ok: true; value: T; diagnostics: RawDefinitionDiagnostic[] }
  | { ok: false; diagnostics: RawDefinitionDiagnostic[] }

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseList(value: string): string[] {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0)
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const text = raw.replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") {
    return {
      fields: new Map(),
      body: text.trim(),
      bodyLine: 1,
      diagnostics: [
        {
          line: 1,
          severity: "error",
          message: "Start the file with a --- frontmatter block.",
        },
      ],
    }
  }

  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  )
  if (endIndex === -1) {
    return {
      fields: new Map(),
      body: "",
      bodyLine: lines.length,
      diagnostics: [
        {
          line: 1,
          severity: "error",
          message: "Close the frontmatter block with another --- line.",
        },
      ],
    }
  }

  const fields = new Map<string, ParsedField>()
  const diagnostics: RawDefinitionDiagnostic[] = []
  for (let index = 1; index < endIndex; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const colon = trimmed.indexOf(":")
    if (colon === -1) {
      diagnostics.push({
        line: index + 1,
        severity: "error",
        message: "Frontmatter entries must be key: value pairs.",
      })
      continue
    }
    const key = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (!key) continue
    fields.set(key, { value, line: index + 1 })
  }

  return {
    fields,
    body: lines
      .slice(endIndex + 1)
      .join("\n")
      .trim(),
    bodyLine: endIndex + 2,
    diagnostics,
  }
}

function requiredField(
  fields: Map<string, ParsedField>,
  key: string,
  diagnostics: RawDefinitionDiagnostic[]
): string | null {
  const field = fields.get(key)
  if (!field || !unquote(field.value).trim()) {
    diagnostics.push({
      line: field?.line ?? 2,
      severity: "error",
      message: `Missing required frontmatter field: ${key}.`,
    })
    return null
  }
  return unquote(field.value).trim()
}

function validateKnownFields(
  fields: Map<string, ParsedField>,
  allowed: Set<string>,
  diagnostics: RawDefinitionDiagnostic[]
) {
  for (const [key, field] of fields) {
    if (!allowed.has(key)) {
      diagnostics.push({
        line: field.line,
        severity: "warning",
        message: `Unknown field "${key}" is ignored.`,
      })
    }
  }
}

function parseColor(
  fields: Map<string, ParsedField>,
  diagnostics: RawDefinitionDiagnostic[],
  fallback: string
): string {
  const field = fields.get("color")
  const color = unquote(field?.value ?? fallback)
    .trim()
    .toLowerCase()
  if (!(MODE_COLORS as readonly string[]).includes(color)) {
    diagnostics.push({
      line: field?.line ?? 2,
      severity: "error",
      message: `Color must be one of: ${MODE_COLORS.join(", ")}.`,
    })
    return fallback
  }
  return color
}

export function serializeRawAgentDefinition(input: ParsedRawAgent): string {
  const lines = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
  ]
  if (input.model) lines.push(`model: ${input.model}`)
  lines.push(`tools: [${(input.tools ?? []).join(", ")}]`)
  lines.push(`color: ${input.color ?? "violet"}`)
  lines.push(`icon: ${input.icon ?? "bot"}`)
  lines.push("---", "", input.prompt, "")
  return lines.join("\n")
}

export function serializeRawModeDefinition(input: ParsedRawMode): string {
  const lines = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    `tools: [${input.tools.join(", ")}]`,
  ]
  if (input.agents !== null && input.agents !== undefined) {
    lines.push(`agents: [${input.agents.join(", ")}]`)
  }
  lines.push(`color: ${input.color ?? "violet"}`)
  lines.push(`icon: ${input.icon ?? "sparkles"}`)
  lines.push("---", "", input.preamble, "")
  return lines.join("\n")
}

export function parseRawAgentDefinition(
  raw: string
): RawParseResult<ParsedRawAgent> {
  const parsed = parseFrontmatter(raw)
  const diagnostics = [...parsed.diagnostics]
  validateKnownFields(
    parsed.fields,
    new Set(["name", "description", "model", "tools", "color", "icon"]),
    diagnostics
  )

  const name = requiredField(parsed.fields, "name", diagnostics)
  const description = requiredField(parsed.fields, "description", diagnostics)
  const toolsField = parsed.fields.get("tools")
  const tools = toolsField ? parseList(toolsField.value) : []
  if (tools.length === 0) {
    diagnostics.push({
      line: toolsField?.line ?? 2,
      severity: "error",
      message: "Add at least one tool.",
    })
  }

  const model = parsed.fields.get("model")
  const modelValue = model ? unquote(model.value).trim() : null
  if (modelValue && !/^[^:]+::.+$/.test(modelValue)) {
    diagnostics.push({
      line: model?.line ?? 2,
      severity: "error",
      message: 'Model must be written as "provider::model".',
    })
  }

  if (!parsed.body) {
    diagnostics.push({
      line: parsed.bodyLine,
      severity: "error",
      message: "Add the agent system prompt below the frontmatter.",
    })
  }

  const color = parseColor(parsed.fields, diagnostics, "violet")
  const hasErrors = diagnostics.some((d) => d.severity === "error")
  if (hasErrors || !name || !description) return { ok: false, diagnostics }

  return {
    ok: true,
    diagnostics,
    value: {
      name,
      description,
      model: modelValue || null,
      tools,
      color,
      icon: unquote(parsed.fields.get("icon")?.value ?? "bot").trim() || "bot",
      prompt: parsed.body,
    },
  }
}

export function parseRawModeDefinition(
  raw: string
): RawParseResult<ParsedRawMode> {
  const parsed = parseFrontmatter(raw)
  const diagnostics = [...parsed.diagnostics]
  validateKnownFields(
    parsed.fields,
    new Set(["name", "description", "tools", "agents", "color", "icon"]),
    diagnostics
  )

  const name = requiredField(parsed.fields, "name", diagnostics)
  const description = requiredField(parsed.fields, "description", diagnostics)
  const toolsField = parsed.fields.get("tools")
  const tools = toolsField ? parseList(toolsField.value) : []
  if (tools.length === 0) {
    diagnostics.push({
      line: toolsField?.line ?? 2,
      severity: "error",
      message: "Add at least one tool.",
    })
  }

  const agentsField = parsed.fields.get("agents")
  const agentsText = agentsField ? unquote(agentsField.value).trim() : ""
  const agents =
    !agentsField || agentsText === "null" ? null : parseList(agentsField.value)

  if (!parsed.body) {
    diagnostics.push({
      line: parsed.bodyLine,
      severity: "error",
      message: "Add the mode preamble below the frontmatter.",
    })
  }

  const color = parseColor(parsed.fields, diagnostics, "violet")
  const hasErrors = diagnostics.some((d) => d.severity === "error")
  if (hasErrors || !name || !description) return { ok: false, diagnostics }

  return {
    ok: true,
    diagnostics,
    value: {
      name,
      description,
      tools,
      agents,
      color,
      icon:
        unquote(parsed.fields.get("icon")?.value ?? "sparkles").trim() ||
        "sparkles",
      preamble: parsed.body,
    },
  }
}

export function RawEditorToggle({
  value,
  onChange,
}: {
  value: "form" | "raw"
  onChange: (value: "form" | "raw") => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-border/70 bg-muted/40 p-0.5">
      {(["form", "raw"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === mode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange(mode)}
        >
          {mode === "form" ? "Form" : "Raw"}
        </button>
      ))}
    </div>
  )
}

export function RawDefinitionEditor({
  value,
  diagnostics,
  onChange,
}: {
  value: string
  diagnostics: RawDefinitionDiagnostic[]
  onChange: (value: string) => void
}) {
  const { resolvedTheme, activeColorTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)

  useEffect(() => {
    applyMonacoTheme(activeColorTheme, isDark)
  }, [activeColorTheme, isDark])

  const beforeMount: BeforeMount = () => {
    ensureThemes(activeColorTheme)
  }

  useEffect(() => {
    const model = editorRef.current?.getModel()
    const monaco = monacoRef.current
    if (!model || !monaco) return
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      diagnostics.map((diagnostic) => ({
        severity:
          diagnostic.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: diagnostic.message,
        startLineNumber: diagnostic.line,
        startColumn: 1,
        endLineNumber: diagnostic.line,
        endColumn: 120,
      }))
    )
  }, [diagnostics])

  useEffect(
    () => () => {
      const model = editorRef.current?.getModel()
      const monaco = monacoRef.current
      if (model && monaco)
        monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
    },
    []
  )

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    const model = editor.getModel()
    if (model) {
      monaco.editor.setModelMarkers(
        model,
        MARKER_OWNER,
        diagnostics.map((diagnostic) => ({
          severity:
            diagnostic.severity === "error"
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
          message: diagnostic.message,
          startLineNumber: diagnostic.line,
          startColumn: 1,
          endLineNumber: diagnostic.line,
          endColumn: 120,
        }))
      )
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xs font-medium">Raw definition</h3>
          <p className="text-3xs text-muted-foreground">
            Edit the markdown file directly. Frontmatter issues appear as Monaco
            diagnostics.
          </p>
        </div>
        <span className="rounded-md border border-border/60 px-2 py-1 font-mono text-3xs text-muted-foreground">
          Markdown
        </span>
      </div>
      <div className="h-[520px]">
        <Editor
          path="lamda-definition.mdx"
          defaultLanguage="mdx"
          language="mdx"
          value={value}
          theme={themeNameFor(isDark)}
          beforeMount={beforeMount}
          onChange={(next) => onChange(next ?? "")}
          onMount={handleMount}
          keepCurrentModel={false}
          loading={null}
          options={{
            fontSize: 12,
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbersMinChars: 3,
            automaticLayout: true,
            padding: { top: 10, bottom: 10 },
            scrollbar: { alwaysConsumeMouseWheel: false },
            stickyScroll: { enabled: false },
            wordWrap: "on",
            tabSize: 2,
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            overviewRulerLanes: 2,
          }}
        />
      </div>
    </section>
  )
}
