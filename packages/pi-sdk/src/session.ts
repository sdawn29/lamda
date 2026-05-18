import {
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  type SessionMessageEntry,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createReadOnlyTools,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent"
import { buildAuthStorage } from "./auth.js"
import { sessionEventGenerator } from "./stream.js"
import type { HistoryBlock, ManagedSessionHandle, ManagedSessionStats, SdkConfig, SessionTokenStats } from "./types.js"

// Duck-typed shapes for SDK message content — avoids a direct @earendil-works/pi-ai dependency
type _ContentItem = { type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }
type _UserMsg = { role: "user"; content: string | _ContentItem[] }
type _AssistantMsg = {
  role: "assistant"
  content: _ContentItem[]
  model?: string
  provider?: string
  errorMessage?: string
}
type _ToolResultMsg = {
  role: "toolResult"
  toolCallId: string
  content: _ContentItem[]
  isError: boolean
  timestamp: number
}

function buildRuntimeHandle(runtime: AgentSessionRuntime): ManagedSessionHandle {
  return {
    prompt: (text, options) => runtime.session.prompt(text, options as any),
    steer: (text) => runtime.session.steer(text),
    followUp: (text) => runtime.session.followUp(text),
    abort: () => runtime.session.abort(),
    dispose: () => runtime.session.dispose(),
    events: () => sessionEventGenerator(runtime.session),
    setModel: async (provider, modelId) => {
      const model = runtime.services.modelRegistry.find(provider, modelId)
      if (model) await runtime.session.setModel(model)
    },
    setThinkingLevel: (level) => runtime.session.setThinkingLevel(level as any),
    get sessionFile() { return runtime.session.sessionFile },
    getContextUsage() {
      const usage = (runtime.session as any).getContextUsage()
      if (!usage) return undefined
      return { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent }
    },
    async compact() { await (runtime.session as any).compact() },
    getAvailableThinkingLevels: () => (runtime.session as any).getAvailableThinkingLevels() as string[],
    getCommands() {
      const { skills } = runtime.session.resourceLoader.getSkills()
      const { prompts } = runtime.session.resourceLoader.getPrompts()
      return [
        ...skills.map((s) => ({ name: `skill:${s.name}`, description: s.description, source: "skill" as const })),
        ...prompts.map((p) => ({ name: p.name, description: p.description, source: "prompt" as const })),
      ]
    },
    getSessionStats(): ManagedSessionStats {
      const stats = (runtime.session as any).getSessionStats()
      return {
        sessionFile: stats.sessionFile ?? null,
        sessionId: stats.sessionId,
        userMessages: stats.userMessages,
        assistantMessages: stats.assistantMessages,
        toolCalls: stats.toolCalls,
        toolResults: stats.toolResults,
        totalMessages: stats.totalMessages,
        tokens: stats.tokens as SessionTokenStats,
        cost: stats.cost,
        contextUsage: stats.contextUsage,
      }
    },
    setCustomTools: (tools) => {
      const s = runtime.session as any
      s._customTools = tools
      s._refreshToolRegistry()
    },
    fork: async (userMessageIndex: number): Promise<string> => {
      const sf = runtime.session.sessionFile
      if (!sf) throw new Error("Cannot fork an in-memory session")
      const sm = SessionManager.open(sf)
      const userEntries = sm.getEntries().filter(
        (e): e is SessionMessageEntry => e.type === "message" && (e as SessionMessageEntry).message?.role === "user"
      )
      const target = userEntries[userMessageIndex]
      if (!target) throw new Error(`No user message at index ${userMessageIndex} in session`)
      const newFile = sm.createBranchedSession(target.id)
      if (!newFile) throw new Error("createBranchedSession returned undefined for entry: " + target.id)
      return newFile
    },
  }
}

function buildRuntimeFactory(
  config: SdkConfig,
  authStorage: ReturnType<typeof buildAuthStorage>,
  modelRegistry: ModelRegistry,
): CreateAgentSessionRuntimeFactory {
  const model = config.provider && config.model ? modelRegistry.find(config.provider, config.model) : undefined

  return async ({ cwd: effectiveCwd, agentDir, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({
      cwd: effectiveCwd,
      agentDir,
      authStorage,
      modelRegistry,
    })
    const baseTools = createReadOnlyTools(effectiveCwd)
    const customTools = config.customTools ? [...baseTools, ...config.customTools] : baseTools
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        model,
        thinkingLevel: config.thinkingLevel as any,
        customTools,
      })),
      services,
      diagnostics: services.diagnostics,
    }
  }
}

/**
 * Create a new managed agent session, persisted to disk under ~/.pi/agent/sessions/.
 */
export async function createManagedSession(config: SdkConfig): Promise<ManagedSessionHandle> {
  const cwd = config.cwd ?? process.cwd()
  const authStorage = config.authStorage ?? buildAuthStorage(config)
  const modelRegistry = config.modelRegistry ?? ModelRegistry.create(authStorage)

  const createRuntime = buildRuntimeFactory(config, authStorage, modelRegistry)
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(cwd),
  })
  return buildRuntimeHandle(runtime)
}

/**
 * Read the linear message history from a JSONL session file and return it as
 * normalized HistoryBlocks. Used to seed a forked thread's DB records so the
 * chat UI shows history immediately after a fork.
 *
 * The returned blocks are in chronological order (root → leaf).
 * Tool call arguments and results are merged into a single "tool" block each.
 * ToolResult session entries are consumed via the merge and not emitted separately.
 */
export function readSessionHistory(sessionFilePath: string): HistoryBlock[] {
  const sm = SessionManager.open(sessionFilePath)
  const entries = sm.getBranch()

  // Pre-collect tool results keyed by toolCallId so we can merge them into
  // the tool blocks emitted when we encounter the parent AssistantMessage.
  const toolResults = new Map<string, { content: string; isError: boolean; timestamp: number }>()
  for (const entry of entries) {
    if (entry.type !== "message") continue
    const msg = entry.message as { role: string }
    if (msg.role !== "toolResult") continue
    const tr = entry.message as unknown as _ToolResultMsg
    const content = tr.content
      .filter((c) => c.type === "text" && c.text !== undefined)
      .map((c) => c.text!)
      .join("")
    toolResults.set(tr.toolCallId, { content, isError: tr.isError, timestamp: tr.timestamp })
  }

  const blocks: HistoryBlock[] = []

  for (const entry of entries) {
    const createdAt = new Date(entry.timestamp).getTime()

    if (entry.type === "message") {
      const role = (entry.message as { role: string }).role

      if (role === "user") {
        const userMsg = entry.message as unknown as _UserMsg
        const content =
          typeof userMsg.content === "string"
            ? userMsg.content
            : userMsg.content
                .filter((c) => c.type === "text" && c.text !== undefined)
                .map((c) => c.text!)
                .join("")
        blocks.push({ role: "user", content, createdAt })

      } else if (role === "assistant") {
        const am = entry.message as unknown as _AssistantMsg
        const text = am.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
        const thinking = am.content
          .filter((c) => c.type === "thinking")
          .map((c) => c.thinking ?? "")
          .join("")
        const toolCalls = am.content.filter((c) => c.type === "toolCall")

        blocks.push({
          role: "assistant",
          content: text,
          thinking,
          model: am.model ?? "",
          provider: am.provider ?? "",
          errorMessage: am.errorMessage,
          createdAt,
        })

        for (const tc of toolCalls) {
          const tcId = tc.id ?? ""
          const result = toolResults.get(tcId)
          blocks.push({
            role: "tool",
            toolCallId: tcId,
            toolName: tc.name ?? "",
            toolArgs: JSON.stringify(tc.arguments ?? {}),
            toolResult: result?.content ?? "",
            isError: result?.isError ?? false,
            createdAt: result?.timestamp ?? createdAt,
          })
        }

      }
      // toolResult entries are consumed via the toolResults map above — skip

    } else if (entry.type === "compaction") {
      blocks.push({ role: "compaction", createdAt })
    }
  }

  return blocks
}

/**
 * Resume an existing persisted session from its JSONL file.
 * Previous conversation context is automatically restored by the Pi SDK.
 */
export async function openManagedSession(sessionFilePath: string, config: SdkConfig = {}): Promise<ManagedSessionHandle> {
  const cwd = config.cwd ?? process.cwd()
  const authStorage = config.authStorage ?? buildAuthStorage(config)
  const modelRegistry = config.modelRegistry ?? ModelRegistry.create(authStorage)

  const createRuntime = buildRuntimeFactory(config, authStorage, modelRegistry)
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.open(sessionFilePath),
  })
  return buildRuntimeHandle(runtime)
}
