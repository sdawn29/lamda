import type { ToolDefinition } from "@earendil-works/pi-coding-agent"

// ── Constants ─────────────────────────────────────────────────────────────────

export const QUESTION_TOOL_NAME = "question"

// ── Public types ──────────────────────────────────────────────────────────────

export interface QuestionOption {
  /** Short label shown on the option button. */
  label: string
  /** Optional longer explanation of what the option means. */
  description?: string
}

export interface Question {
  /** The full question to ask the user. */
  question: string
  /** Very short label rendered as a chip/tag above the question. */
  header: string
  /** When true the user may pick several options instead of just one. */
  multiSelect?: boolean
  /** The available choices. The UI always adds a free-text "Other" escape hatch. */
  options: QuestionOption[]
}

export interface QuestionPayload {
  questions: Question[]
}

/**
 * Resolver supplied by the host (the server). Given a tool-call id, it returns a
 * promise that resolves to the user's answer once they respond in the UI. The
 * `signal` lets the host clean up if the agent turn is aborted before the user
 * answers.
 */
export type AnswerWaiter = (toolCallId: string, signal?: AbortSignal) => Promise<string>

// ── Validation ────────────────────────────────────────────────────────────────

function err(message: string): {
  content: { type: "text"; text: string }[]
  details: Record<string, unknown>
} {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], details: {} }
}

function normalizeQuestions(raw: unknown): Question[] | null {
  if (!raw || typeof raw !== "object") return null
  const list = (raw as { questions?: unknown }).questions
  if (!Array.isArray(list) || list.length === 0) return null

  const questions: Question[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") return null
    const q = item as Record<string, unknown>
    if (typeof q.question !== "string" || !q.question.trim()) return null
    if (!Array.isArray(q.options) || q.options.length === 0) return null

    const options: QuestionOption[] = []
    for (const opt of q.options) {
      if (!opt || typeof opt !== "object") return null
      const o = opt as Record<string, unknown>
      if (typeof o.label !== "string" || !o.label.trim()) return null
      options.push({
        label: o.label.trim(),
        ...(typeof o.description === "string" && o.description.trim()
          ? { description: o.description.trim() }
          : {}),
      })
    }

    questions.push({
      question: q.question.trim(),
      header: typeof q.header === "string" && q.header.trim() ? q.header.trim() : "Question",
      multiSelect: q.multiSelect === true,
      options,
    })
  }
  return questions
}

// ── Tool factory ────────────────────────────────────────────────────────────────

/**
 * Create the `question` tool. The tool blocks until the user answers in the
 * UI: `execute` registers the pending call via `waitForAnswer` and only returns
 * once the host resolves it with the user's selection. The streamed tool-call
 * arguments carry the question payload, which the web app renders as a rich
 * question view in place of the chat input box.
 */
export function createQuestionTool(waitForAnswer: AnswerWaiter): ToolDefinition {
  return {
    name: QUESTION_TOOL_NAME,
    label: "question",
    description: `Ask the user one or more multiple-choice questions and wait for their answer.

Use this when you are genuinely blocked on a decision that is the user's to make — one you cannot resolve from the request, the code, or sensible defaults. The UI renders the questions as a rich picker in place of the chat input and pauses until the user responds; the tool result contains their selections.

Guidance:
- Prefer this over guessing when a choice would meaningfully change what you build.
- Keep each \`header\` to a few words (it is shown as a small chip).
- Provide 2-4 concrete, mutually exclusive \`options\` per question (unless \`multiSelect\` is true). The UI always offers a free-text "Other" option, so do not add one yourself.
- Put any recommended option first.
- Do NOT use this for trivial choices that have an obvious default — just proceed and mention your choice.`,

    parameters: {
      type: "object",
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          description: "One to four questions to ask the user.",
          items: {
            type: "object",
            required: ["question", "header", "options"],
            properties: {
              question: {
                type: "string",
                description: "The full question to ask. Should end with a question mark.",
              },
              header: {
                type: "string",
                description: "A very short label (a few words) shown as a chip above the question.",
              },
              multiSelect: {
                type: "boolean",
                description: "Allow selecting multiple options instead of one. Default false.",
              },
              options: {
                type: "array",
                description: "The choices. Provide 2-4. Put any recommended option first.",
                items: {
                  type: "object",
                  required: ["label"],
                  properties: {
                    label: { type: "string", description: "Short text shown on the option." },
                    description: {
                      type: "string",
                      description: "Optional longer explanation of the option's trade-offs.",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    execute: async (toolCallId, params, signal) => {
      const questions = normalizeQuestions(params)
      if (!questions) {
        return err("Invalid parameters: 'questions' must be a non-empty array of { question, header, options[] }.")
      }

      const answer = await waitForAnswer(toolCallId, signal)
      return {
        content: [{ type: "text", text: answer }],
        details: { questions },
      }
    },
  }
}
