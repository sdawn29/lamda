import type { Message, ToolMessage } from "../types"

/** Tool name emitted by the pi-sdk `question` tool. */
export const QUESTION_TOOL_NAME = "question"

export interface QuestionOption {
  label: string
  description?: string
}

export interface Question {
  question: string
  header: string
  multiSelect: boolean
  options: QuestionOption[]
}

export interface ActiveQuestion {
  toolCallId: string
  questions: Question[]
}

function parseQuestions(raw: unknown): Question[] | null {
  if (!raw || typeof raw !== "object") return null
  const list = (raw as { questions?: unknown }).questions
  if (!Array.isArray(list) || list.length === 0) return null

  const questions: Question[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") return null
    const q = item as Record<string, unknown>
    if (typeof q.question !== "string" || !Array.isArray(q.options)) return null

    const options: QuestionOption[] = []
    for (const opt of q.options) {
      if (!opt || typeof opt !== "object") continue
      const o = opt as Record<string, unknown>
      if (typeof o.label !== "string" || !o.label.trim()) continue
      options.push({
        label: o.label.trim(),
        ...(typeof o.description === "string" && o.description.trim()
          ? { description: o.description.trim() }
          : {}),
      })
    }
    if (options.length === 0) return null

    questions.push({
      question: q.question.trim(),
      header:
        typeof q.header === "string" && q.header.trim()
          ? q.header.trim()
          : "Question",
      multiSelect: q.multiSelect === true,
      options,
    })
  }
  return questions.length > 0 ? questions : null
}

/**
 * Find the currently-pending `question` tool call in the message stream, if
 * any. Returns the parsed question payload so the chat view can render the
 * question picker in place of the input box. Returns null when no question is
 * awaiting an answer (the tool is still running and its args are well-formed).
 */
export function findActiveQuestion(messages: Message[]): ActiveQuestion | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "tool") continue
    const tool = msg as ToolMessage
    if (tool.toolName !== QUESTION_TOOL_NAME) continue
    // Only the still-running call awaits an answer; done/error calls are history.
    if (tool.status !== "running") return null
    const questions = parseQuestions(tool.args)
    if (!questions) return null
    return { toolCallId: tool.toolCallId, questions }
  }
  return null
}
