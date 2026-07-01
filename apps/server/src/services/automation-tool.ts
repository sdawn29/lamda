import type { ToolDefinition } from "@earendil-works/pi-coding-agent"
import {
  createAutomation,
  type AutomationApprovalMode,
  type CreateAutomationInput,
} from "@lamda/db"
import { registerAutomation, isValidCron } from "./automation-scheduler.js"
import { automationBroadcaster } from "../automation-broadcaster.js"

export const CREATE_AUTOMATION_TOOL_NAME = "create_automation"

const APPROVAL_MODES: AutomationApprovalMode[] = [
  "ask",
  "edits_allowed",
  "all_allowed",
]

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    details: {},
  }
}

/** Concise name derived from the prompt, mirroring the web form's generator. */
function deriveName(prompt: string): string {
  const first = prompt.trim().split(/\r?\n/)[0]?.trim() ?? ""
  if (!first) return "Untitled automation"
  const words = first.split(/\s+/)
  let name = words.slice(0, 7).join(" ")
  if (name.length > 52) name = name.slice(0, 52).trimEnd()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Tool that lets the agent create a scheduled automation in the current
 * workspace straight from a chat thread. The created automation runs its prompt
 * through the agent on the given cron schedule (only while the app is running).
 */
export function createAutomationTool(workspaceId: string): ToolDefinition {
  return {
    name: CREATE_AUTOMATION_TOOL_NAME,
    label: "create automation",
    description: `Create a scheduled automation in the current workspace. An automation runs a fixed prompt through the agent automatically on a cron schedule, in its own dedicated thread.

Use this when the user asks to schedule recurring work — e.g. "every morning check for outdated dependencies", "run the tests every hour", "draft a weekly changelog every Monday".

Notes:
- \`cron\` is a standard 5-field expression: "minute hour day-of-month month day-of-week". Examples: "0 9 * * *" = every day at 09:00; "*/30 * * * *" = every 30 minutes; "0 2 * * 1" = every Monday at 02:00.
- Scheduled runs are unattended, so \`approvalMode\` defaults to "all_allowed" (the agent may edit files and run commands without confirmation). Only narrow it if the user asks.
- \`useWorktree\` defaults to true so unattended edits land on a dedicated git branch rather than the user's working tree.
- The automation only fires while the app is running. Confirm the schedule back to the user after creating it.`,

    parameters: {
      type: "object",
      required: ["prompt", "cron"],
      properties: {
        prompt: {
          type: "string",
          description:
            "The instruction sent to the agent on every scheduled run.",
        },
        cron: {
          type: "string",
          description:
            'Standard 5-field cron expression, e.g. "0 9 * * *" for daily at 09:00.',
        },
        name: {
          type: "string",
          description:
            "Optional short name. Defaults to a name derived from the prompt.",
        },
        mode: {
          type: "string",
          description:
            'Agent mode to run in (e.g. "agent", "plan", "ask", or a custom mode). Defaults to "agent".',
        },
        approvalMode: {
          type: "string",
          enum: APPROVAL_MODES,
          description:
            'Tool-approval policy for unattended runs. Defaults to "all_allowed".',
        },
        useWorktree: {
          type: "boolean",
          description:
            "Run in an isolated git worktree branch. Defaults to true.",
        },
        enabled: {
          type: "boolean",
          description: "Whether the automation is active. Defaults to true.",
        },
        modelId: {
          type: "string",
          description:
            'Optional model as "provider::model". Defaults to the workspace default.',
        },
      },
    },

    execute: async (_toolCallId, params) => {
      const p = (params ?? {}) as Record<string, unknown>
      const prompt = typeof p.prompt === "string" ? p.prompt.trim() : ""
      const cron = typeof p.cron === "string" ? p.cron.trim() : ""

      if (!prompt) return toolError("`prompt` is required.")
      if (!cron) return toolError("`cron` is required.")
      if (!isValidCron(cron)) {
        return toolError(
          `"${cron}" is not a valid 5-field cron expression (minute hour day month weekday).`,
        )
      }
      if (p.approvalMode !== undefined &&
        !APPROVAL_MODES.includes(p.approvalMode as AutomationApprovalMode)) {
        return toolError(
          'approvalMode must be "ask", "edits_allowed", or "all_allowed".',
        )
      }

      const input: CreateAutomationInput = {
        name:
          typeof p.name === "string" && p.name.trim()
            ? p.name.trim()
            : deriveName(prompt),
        prompt,
        cron,
        modelId: typeof p.modelId === "string" ? p.modelId : null,
        mode: typeof p.mode === "string" && p.mode.trim() ? p.mode.trim() : "agent",
        approvalMode: (p.approvalMode as AutomationApprovalMode) ?? "all_allowed",
        useWorktree: p.useWorktree === undefined ? true : p.useWorktree === true,
        enabled: p.enabled === undefined ? true : p.enabled === true,
      }

      let automation
      try {
        automation = createAutomation(workspaceId, input)
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : "Failed to create automation.",
        )
      }
      if (automation.enabled) registerAutomation(automation.id, automation.cron)
      automationBroadcaster.broadcast()

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              created: true,
              id: automation.id,
              name: automation.name,
              cron: automation.cron,
              enabled: automation.enabled,
            }),
          },
        ],
        details: {
          name: automation.name,
          cron: automation.cron,
          prompt: automation.prompt,
        },
      }
    },
  }
}
