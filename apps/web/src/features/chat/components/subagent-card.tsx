import {
  memo,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
} from "react"
import Markdown from "react-markdown"
import { cn } from "@/shared/lib/utils"
import { Card, CardContent } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { colorStyle, resolveModeIcon } from "./mode-combobox"
import {
  chatProseClassRich,
  getMarkdownComponents,
  remarkPlugins,
} from "./markdown-components"
import { ThinkingBlock } from "./thinking-block"
import { ToolCallBlock } from "./tool-call-block"
import { ToolRunGroup, toolGroupId } from "./working-block"
import { DISCLOSURE_DIM } from "./disclosure"
import {
  getSubagentDetails,
  subagentBlocksToMessages,
  subagentStatus,
  delegateDescription,
} from "../lib/subagent"
import type { Message, ToolMessage } from "../types"
import { openSubagentPanel } from "../lib/subagent-panel-store"

// Per-subagent-tool-call cache of stabilized child identities, used by
// SubagentTranscript below. Kept at module scope (rather than a ref) since
// React Compiler forbids mutating anything sourced from a hook (useRef's
// `.current`, or a useMemo/useState result) during render — this Map isn't
// hook-derived, so it can be read and written synchronously as part of the
// `children` memo. Entries are removed when their SubagentTranscript unmounts
// (see the cleanup effect there) so this doesn't grow unbounded.
const transcriptChildCaches = new Map<
  string,
  Map<string, { sig: string; msg: Message }>
>()

/** One renderable row in a subagent card's nested transcript. */
type SubagentEntry =
  | { kind: "assistant"; key: string; content: string; thinking: string }
  | { kind: "tool"; key: string; msg: ToolMessage }
  | { kind: "run"; key: string; tools: ToolMessage[] }

/**
 * The visual boundary around a subagent's nested transcript. The outline shows
 * the isolated run without visually separating it from the chat background.
 */
export function SubagentEnvironmentCard({
  children,
  scrollRef,
  onScroll,
}: {
  children: ReactNode
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
}) {
  return (
    <Card
      size="sm"
      className="gap-0 border border-border bg-background py-0 ring-0"
    >
      <CardContent
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-80 overflow-y-auto py-3"
      >
        <div className="flex flex-col gap-1">{children}</div>
      </CardContent>
    </Card>
  )
}

/**
 * Flatten a subagent's transcript into visible rows, collapsing consecutive
 * calls of same-category tools (exploring, terminal, editing — see
 * {@link toolGroupId}) into a single "Exploring · read 4 files" run, the same
 * treatment the main transcript's WorkingBlock gives the top-level agent's
 * own tool calls. Assistant text (including the subagent's final report) is
 * kept as its own entry, since — unlike WorkingBlock — a subagent's reply
 * text lives inside this same collapsible body rather than as a sibling
 * message.
 */
function buildSubagentEntries(messages: Message[]): SubagentEntry[] {
  const out: SubagentEntry[] = []
  let assistantIndex = 0
  for (const m of messages) {
    if (m.role === "assistant") {
      if (m.content.trim() || m.thinking.trim()) {
        out.push({
          kind: "assistant",
          key: `assistant-${assistantIndex++}`,
          content: m.content,
          thinking: m.thinking,
        })
      }
      continue
    }
    if (m.role !== "tool") continue
    const groupId = toolGroupId(m)
    const last = out[out.length - 1]
    if (
      groupId !== null &&
      last?.kind === "run" &&
      toolGroupId(last.tools[0]) === groupId
    ) {
      last.tools.push(m)
      continue
    }
    if (groupId !== null) {
      out.push({ kind: "run", key: m.toolCallId, tools: [m] })
      continue
    }
    out.push({ kind: "tool", key: m.toolCallId, msg: m })
  }
  return out
}

/**
 * Live elapsed time for a running subagent, anchored to the run's start so a
 * remount mid-run resumes at the right value.
 */
export function useElapsed(
  startedAt: number | undefined,
  active: boolean
): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.max(0, Date.now() - startedAt) : 0
  )
  useEffect(() => {
    if (!active || !startedAt) return
    const update = () => setElapsed(Math.max(0, Date.now() - startedAt))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [active, startedAt])
  return elapsed
}

/**
 * A subagent run's nested transcript rows — the tool-call blocks, run groups,
 * and reply text of the nested run, without any header chrome. Shared between
 * the standalone SubagentCard's collapsible body and the parallel
 * SubagentGroup's focus panel; render inside a `flex flex-col gap-1` column.
 */
export const SubagentTranscript = memo(function SubagentTranscript({
  msg,
  rootPath,
}: {
  msg: ToolMessage
  rootPath?: string
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)

  // Stabilize settled children's identities across streaming snapshots (each
  // snapshot deserializes to fresh objects) so the memoized ToolCallBlock rows
  // inside a run group don't re-render on every text delta of a later block.
  useEffect(() => {
    return () => {
      transcriptChildCaches.delete(msg.toolCallId)
    }
  }, [msg.toolCallId])

  const children = useMemo(() => {
    if (!details) return []
    let cache = transcriptChildCaches.get(msg.toolCallId)
    if (!cache) {
      cache = new Map()
      transcriptChildCaches.set(msg.toolCallId, cache)
    }
    return subagentBlocksToMessages(details.blocks).map((child) => {
      if (child.role !== "tool" || child.status === "running") return child
      const sig = `${child.status}:${child.duration ?? ""}`
      const cached = cache.get(child.toolCallId)
      if (cached && cached.sig === sig) return cached.msg
      cache.set(child.toolCallId, { sig, msg: child })
      return child
    })
  }, [details, msg.toolCallId])

  const entries = useMemo(() => buildSubagentEntries(children), [children])

  const markdownComponents = useMemo(
    () => getMarkdownComponents(rootPath, true),
    [rootPath]
  )

  return (
    <>
      {details?.truncated && (
        <span className={cn("text-2xs italic", DISCLOSURE_DIM)}>
          Transcript trimmed — middle steps elided
        </span>
      )}
      {entries.map((entry, index) => {
        if (entry.kind === "run") {
          return (
            <ToolRunGroup
              key={entry.key}
              tools={entry.tools}
              rootPath={rootPath}
              live={status === "running" && index === entries.length - 1}
            />
          )
        }
        if (entry.kind === "tool") {
          return (
            <ToolCallBlock
              key={entry.key}
              msg={entry.msg}
              isNew={false}
              rootPath={rootPath}
              suppressPlanSavedCard
            />
          )
        }
        return (
          <div key={entry.key} className="flex flex-col gap-1">
            {entry.thinking.trim() && (
              <ThinkingBlock thinking={entry.thinking} isNew={false} />
            )}
            {entry.content.trim() && (
              <div className={chatProseClassRich}>
                <Markdown
                  remarkPlugins={remarkPlugins}
                  components={markdownComponents}
                >
                  {entry.content}
                </Markdown>
              </div>
            )}
          </div>
        )
      })}
      {details?.errorMessage && (
        <span className="text-2xs text-destructive/70">
          {details.errorMessage}
        </span>
      )}
      {status === "queued" && (
        <span className={cn("text-2xs italic", DISCLOSURE_DIM)}>
          Waiting for a subagent slot…
        </span>
      )}
    </>
  )
})

/**
 * Compact in-thread marker for a delegated run. The transcript lives in the
 * dedicated subagent panel; the wider pill keeps the agent identity and status
 * readable without putting nested live output back into the main chat.
 */
export const SubagentCard = memo(function SubagentCard({
  msg,
  isNew = true,
  entryDelayMs = 0,
}: {
  msg: ToolMessage
  isNew?: boolean
  entryDelayMs?: number
  rootPath?: string
  agentsById?: ReadonlyMap<string, unknown>
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)
  const label = details?.agentLabel ?? "Subagent"
  const description = delegateDescription(msg.args)
  const visual = { Icon: resolveModeIcon(details?.icon ?? "bot") }
  const accent = colorStyle(details?.color ?? "violet").iconAccent
  const failed = status === "error"
  const statusLabel =
    status === "error" ? "failed" : status === "aborted" ? "stopped" : status

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-40 justify-start rounded-md",
              isNew && "animate-chat-message-in",
              failed && "border-destructive/40"
            )}
            style={
              isNew && entryDelayMs > 0
                ? { animationDelay: `${entryDelayMs}ms` }
                : undefined
            }
            onClick={() => openSubagentPanel(msg.toolCallId)}
            aria-label={`Open ${label} subagent`}
          >
            <visual.Icon
              data-icon="inline-start"
              className={cn(accent, failed && "text-destructive")}
            />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <span
              className={cn(
                "shrink-0 text-2xs text-muted-foreground",
                failed && "text-destructive"
              )}
            >
              {statusLabel}
            </span>
          </Button>
        }
      />
      <TooltipContent>
        {label} · {status}
        {description ? ` · ${description}` : ""}
      </TooltipContent>
    </Tooltip>
  )
})
