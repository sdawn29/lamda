import { lazy, Suspense } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"
import { AlertCircleIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { markdownComponents } from "./markdown-components"
import type { ToolMessage } from "../types"

const remarkPlugins: PluggableList = [remarkGfm]

// Lazy to break the circular import with tool-call-block
const ToolCallBlock = lazy(() =>
  import("./tool-call-block").then((m) => ({ default: m.ToolCallBlock }))
)

const proseClass =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-headings:text-sm prose-headings:leading-[1.4] prose-headings:my-0 prose-p:leading-[1.6] prose-p:mt-0 prose-p:mb-[0.75em] prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 [&_li]:leading-[1.6] [&_li]:text-sm [&_li>p]:my-0 [&>*+*]:mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-primary/70"

interface SubagentArgs {
  agent?: string
  prompt?: string
}

interface SubagentDefinition {
  name: string
  description?: string
  tools?: string[]
}

interface SubagentDetails {
  agent?: string
  agents?: SubagentDefinition[]
  tools?: string[]
  allowedTools?: string[]
  childTools?: SubagentChildTool[]
  thinking?: string
  sessionFile?: string
  errorMessage?: string
}

interface SubagentChildTool {
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "done" | "error"
  result?: unknown
  partialResult?: unknown
  startTime?: number
  duration?: number
}

export interface SubagentMeta {
  agentName: string | null
  prompt: string | null
  tools: string[]
  toolCallCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getTextFromToolPayload(value: unknown): string | null {
  if (typeof value === "string") return value
  if (!isRecord(value) || !Array.isArray(value.content)) return null

  const text = value.content
    .filter((part): part is { type: string; text: string } =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("")

  return text || null
}

function getDetails(value: unknown): SubagentDetails | null {
  if (!isRecord(value) || !isRecord(value.details)) return null
  return value.details as SubagentDetails
}

function getSubagentArgs(args: unknown): SubagentArgs {
  if (!isRecord(args)) return {}
  return {
    agent: typeof args.agent === "string" ? args.agent : undefined,
    prompt: typeof args.prompt === "string" ? args.prompt : undefined,
  }
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : []
}

export function getSubagentMeta(msg: ToolMessage): SubagentMeta {
  const args = getSubagentArgs(msg.args)
  const resultDetails = getDetails(msg.result)
  const partialDetails = getDetails(msg.partialResult)
  const agentName = args.agent ?? resultDetails?.agent ?? partialDetails?.agent ?? null
  const tools = [
    ...getStringArray(resultDetails?.allowedTools ?? resultDetails?.tools),
    ...getStringArray(partialDetails?.allowedTools ?? partialDetails?.tools),
  ]

  return {
    agentName,
    prompt: args.prompt ?? null,
    tools: [...new Set(tools)],
    toolCallCount: getChildTools(msg).length,
  }
}

export function getSubagentOutput(msg: ToolMessage): string | null {
  return getTextFromToolPayload(msg.result) ?? getTextFromToolPayload(msg.partialResult)
}

function getAvailableAgents(msg: ToolMessage): SubagentDefinition[] {
  const details = getDetails(msg.result) ?? getDetails(msg.partialResult)
  if (!Array.isArray(details?.agents)) return []
  return details.agents.filter((agent): agent is SubagentDefinition =>
    isRecord(agent) && typeof agent.name === "string"
  )
}

function getChildTools(msg: ToolMessage): SubagentChildTool[] {
  const resultDetails = getDetails(msg.result)
  const partialDetails = getDetails(msg.partialResult)
  const tools = resultDetails?.childTools ?? partialDetails?.childTools
  if (!Array.isArray(tools)) return []
  return tools.filter((tool): tool is SubagentChildTool =>
    isRecord(tool) &&
    typeof tool.toolCallId === "string" &&
    typeof tool.toolName === "string" &&
    (tool.status === "running" || tool.status === "done" || tool.status === "error")
  )
}

export function hasSubagentContent(msg: ToolMessage): boolean {
  return (
    getSubagentOutput(msg) !== null ||
    getAvailableAgents(msg).length > 0 ||
    getChildTools(msg).length > 0
  )
}

function childToolToMessage(tool: SubagentChildTool): ToolMessage {
  return {
    role: "tool",
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    args: tool.args,
    status: tool.status,
    result: tool.result,
    partialResult: tool.partialResult,
    startTime: tool.startTime,
    duration: tool.duration,
  }
}

export function SubagentToolView({
  msg,
  live,
  rootPath,
}: {
  msg: ToolMessage
  live: boolean
  rootPath?: string
}) {
  const meta = getSubagentMeta(msg)
  const output = getSubagentOutput(msg)
  const agents = getAvailableAgents(msg)
  const childTools = getChildTools(msg)
  const hasAgentList = agents.length > 0 && !meta.agentName

  return (
    <div className="flex flex-col gap-2">
      {meta.prompt && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground/70">
          {meta.prompt}
        </p>
      )}

      {hasAgentList && (
        <div className="flex flex-col gap-1.5">
          {agents.map((agent) => (
            <div key={agent.name}>
              <span className="text-xs font-medium text-foreground/55">{agent.name}</span>
              {agent.description && (
                <span className="ml-1.5 text-[11px] leading-relaxed text-muted-foreground/45">
                  {agent.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {childTools.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Suspense fallback={null}>
            {childTools.map((tool) => (
              <ToolCallBlock
                key={tool.toolCallId}
                msg={childToolToMessage(tool)}
                isNew={false}
                rootPath={rootPath}
                suppressPlanSavedCard
              />
            ))}
          </Suspense>
        </div>
      )}

      {output && msg.status !== "error" && (
        <div
          className={cn(
            proseClass,
            childTools.length > 0 && "border-t border-border/20 pt-2"
          )}
        >
          <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {output}
          </Markdown>
        </div>
      )}

      {msg.status === "error" && (
        <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
          <pre className="flex-1 overflow-auto text-xs break-all whitespace-pre-wrap text-destructive/80">
            {output ?? "Subagent execution failed"}
          </pre>
        </div>
      )}
    </div>
  )
}
