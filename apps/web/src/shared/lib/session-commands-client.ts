/**
 * Unified WebSocket client for session commands.
 * All session mutations go through the commands WebSocket at /ws/session/:id/commands
 */

import { getServerWsUrl } from "@/shared/lib/client"

export interface PromptOptions {
  images?: { data: string; mediaType: string }[]
  streamingBehavior?: "steer" | "followUp"
  expandPromptTemplates?: boolean
}

// ── Client → Server Messages ──────────────────────────────────────────────────

export type ClientMessage =
  | PromptMessage
  | SteerMessage
  | FollowUpMessage
  | AbortMessage
  | CompactMessage
  | GitCommandMessage
  | WorkspaceCommandMessage

export interface PromptMessage {
  type: "prompt"
  id?: string
  text: string
  provider?: string
  model?: string
  thinkingLevel?: string
  images?: { data: string; mediaType: string }[]
  streamingBehavior?: "steer" | "followUp"
  expandPromptTemplates?: boolean
}

export interface SteerMessage {
  type: "steer"
  text: string
}

export interface FollowUpMessage {
  type: "follow-up"
  text: string
}

export interface AbortMessage {
  type: "abort"
}

export interface CompactMessage {
  type: "compact"
}

export type GitCommandMessage =
  | GitStageMessage
  | GitUnstageMessage
  | GitStageAllMessage
  | GitUnstageAllMessage
  | GitCommitMessage
  | GitCheckoutMessage
  | GitBranchMessage
  | GitPushMessage
  | GitStashMessage
  | GitStashPopMessage
  | GitStashApplyMessage
  | GitStashDropMessage
  | GitRevertFileMessage
  | GitInitMessage

export interface GitStageMessage {
  type: "git:stage"
  filePath: string
}

export interface GitUnstageMessage {
  type: "git:unstage"
  filePath: string
}

export interface GitStageAllMessage {
  type: "git:stage-all"
}

export interface GitUnstageAllMessage {
  type: "git:unstage-all"
}

export interface GitCommitMessage {
  type: "git:commit"
  message: string
}

export interface GitCheckoutMessage {
  type: "git:checkout"
  branch: string
}

export interface GitBranchMessage {
  type: "git:branch"
  branch: string
}

export interface GitPushMessage {
  type: "git:push"
}

export interface GitStashMessage {
  type: "git:stash"
  message?: string
}

export interface GitStashPopMessage {
  type: "git:stash-pop"
  ref: string
}

export interface GitStashApplyMessage {
  type: "git:stash-apply"
  ref: string
}

export interface GitStashDropMessage {
  type: "git:stash-drop"
  ref: string
}

export interface GitRevertFileMessage {
  type: "git:revert-file"
  filePath: string
}

export interface GitInitMessage {
  type: "git:init"
}

export type WorkspaceCommandMessage = WorkspaceReindexMessage

export interface WorkspaceReindexMessage {
  type: "workspace:reindex"
}

// ── Server → Client Messages ─────────────────────────────────────────────────

export type ServerMessage =
  | ServerErrorMessage
  | GitStatusMessage
  | GitProgressMessage
  | GitResultMessage
  | WorkspaceProgressMessage
  | CommandAckMessage

export interface ServerErrorMessage {
  type: "server_error"
  message: string
}

export interface GitStatusMessage {
  type: "git:status"
  sessionId: string
  status: string
}

export interface GitProgressMessage {
  type: "git:progress"
  sessionId: string
  operation: string
  current: number
  total: number
}

export interface GitResultMessage {
  type: "git:result"
  sessionId: string
  operation: string
  success: boolean
  error?: string
  data?: Record<string, unknown>
}

export interface WorkspaceProgressMessage {
  type: "workspace:progress"
  workspaceId: string
  operation: string
  current: number
  total: number
}

export interface CommandAckMessage {
  type: "ack"
  clientId?: string
  operation: string
  accepted: boolean
}

// ── WebSocket Client ─────────────────────────────────────────────────────────

type MessageHandler = (msg: ServerMessage) => void
type ConnectionHandler = () => void

export class SessionCommandsClient {
  private ws: WebSocket | null = null
  private sessionId: string
  private handlers = new Set<MessageHandler>()
  private onConnectHandlers = new Set<ConnectionHandler>()
  private onDisconnectHandlers = new Set<ConnectionHandler>()
  private pendingCommands = new Map<string, {
    resolve: (value: unknown) => void
    reject: (err: Error) => void
  }>()

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const base = await getServerWsUrl()
    const url = `${base}/ws/session/${this.sessionId}/commands`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.onConnectHandlers.forEach((h) => h())
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        this.handlers.forEach((h) => h(msg))

        // Handle acks for pending commands
        if (msg.type === "ack" && msg.clientId) {
          const pending = this.pendingCommands.get(msg.clientId)
          if (pending) {
            this.pendingCommands.delete(msg.clientId)
            if (msg.accepted) {
              pending.resolve(undefined)
            } else {
              pending.reject(new Error("Command rejected"))
            }
          }
        }
      } catch (err) {
        console.error("[session-commands] parse error:", err)
      }
    }

    this.ws.onclose = () => {
      this.onDisconnectHandlers.forEach((h) => h())
      // Clear pending commands
      this.pendingCommands.forEach((p) => p.reject(new Error("Connection closed")))
      this.pendingCommands.clear()
    }

    this.ws.onerror = (err) => {
      console.error("[session-commands] error:", err)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(msg: ClientMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"))
        return
      }

      // Add client ID for correlation if prompt message
      if (msg.type === "prompt" && !msg.id) {
        msg.id = crypto.randomUUID()
      }

      if (msg.type === "prompt") {
        this.pendingCommands.set(msg.id!, { resolve, reject })
      }

      this.ws.send(JSON.stringify(msg))
    })
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.onConnectHandlers.add(handler)
    return () => this.onConnectHandlers.delete(handler)
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.onDisconnectHandlers.add(handler)
    return () => this.onDisconnectHandlers.delete(handler)
  }

  // Convenience methods for common commands

  async sendPrompt(params: {
    text: string
    provider?: string
    model?: string
    thinkingLevel?: string
    images?: PromptOptions["images"]
    streamingBehavior?: PromptOptions["streamingBehavior"]
    expandPromptTemplates?: PromptOptions["expandPromptTemplates"]
  }): Promise<void> {
    await this.send({
      type: "prompt",
      text: params.text,
      provider: params.provider,
      model: params.model,
      thinkingLevel: params.thinkingLevel,
      images: params.images,
      streamingBehavior: params.streamingBehavior,
      expandPromptTemplates: params.expandPromptTemplates,
    } satisfies PromptMessage)
  }

  async steer(text: string): Promise<void> {
    await this.send({ type: "steer", text } satisfies SteerMessage)
  }

  async followUp(text: string): Promise<void> {
    await this.send({ type: "follow-up", text } satisfies FollowUpMessage)
  }

  async abort(): Promise<void> {
    await this.send({ type: "abort" } satisfies AbortMessage)
  }

  async compact(): Promise<void> {
    await this.send({ type: "compact" } satisfies CompactMessage)
  }

  // Git commands

  async gitStage(filePath: string): Promise<void> {
    await this.send({ type: "git:stage", filePath } satisfies GitStageMessage)
  }

  async gitUnstage(filePath: string): Promise<void> {
    await this.send({ type: "git:unstage", filePath } satisfies GitUnstageMessage)
  }

  async gitStageAll(): Promise<void> {
    await this.send({ type: "git:stage-all" } satisfies GitStageAllMessage)
  }

  async gitUnstageAll(): Promise<void> {
    await this.send({ type: "git:unstage-all" } satisfies GitUnstageAllMessage)
  }

  async gitCommit(message: string): Promise<void> {
    await this.send({ type: "git:commit", message } satisfies GitCommitMessage)
  }

  async gitCheckout(branch: string): Promise<void> {
    await this.send({ type: "git:checkout", branch } satisfies GitCheckoutMessage)
  }

  async gitBranch(branch: string): Promise<void> {
    await this.send({ type: "git:branch", branch } satisfies GitBranchMessage)
  }

  async gitPush(): Promise<void> {
    await this.send({ type: "git:push" } satisfies GitPushMessage)
  }

  async gitStash(message?: string): Promise<void> {
    await this.send({ type: "git:stash", message } satisfies GitStashMessage)
  }

  async gitStashPop(ref: string): Promise<void> {
    await this.send({ type: "git:stash-pop", ref } satisfies GitStashPopMessage)
  }

  async gitStashApply(ref: string): Promise<void> {
    await this.send({ type: "git:stash-apply", ref } satisfies GitStashApplyMessage)
  }

  async gitStashDrop(ref: string): Promise<void> {
    await this.send({ type: "git:stash-drop", ref } satisfies GitStashDropMessage)
  }

  async gitRevertFile(filePath: string): Promise<void> {
    await this.send({ type: "git:revert-file", filePath } satisfies GitRevertFileMessage)
  }

  async gitInit(): Promise<void> {
    await this.send({ type: "git:init" } satisfies GitInitMessage)
  }
}

// Factory function for easy access
export function createSessionCommandsClient(sessionId: string): SessionCommandsClient {
  return new SessionCommandsClient(sessionId)
}