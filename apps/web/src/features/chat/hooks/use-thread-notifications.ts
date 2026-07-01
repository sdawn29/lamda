import { useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { useWorkspaces } from "@/features/workspace/queries"
import type { WorkspaceDto } from "@/features/workspace/api"
import {
  useThreadStatusStore,
  type ThreadStatus,
  type ThreadAttention,
} from "../thread-status-store"

interface ThreadLocation {
  title: string
  workspaceName: string
}

// Stable per-thread toast ids so a status that re-fires (or later clears)
// updates / dismisses the existing toast instead of stacking a new one.
const awaitingToastId = (threadId: string) => `thread-awaiting-${threadId}`
const errorToastId = (threadId: string) => `thread-error-${threadId}`

function findThread(
  workspaces: WorkspaceDto[] | undefined,
  threadId: string
): ThreadLocation | null {
  if (!workspaces) return null
  for (const ws of workspaces) {
    const thread = ws.threads.find((t) => t.id === threadId)
    if (thread) return { title: thread.title, workspaceName: ws.name }
  }
  return null
}

/** Trim a free-form specific (question / error text) to one tidy toast line. */
function clip(text: string | undefined, max = 140): string | undefined {
  if (!text) return undefined
  const oneLine = text.replace(/\s+/g, " ").trim()
  if (!oneLine) return undefined
  return oneLine.length > max ? oneLine.slice(0, max) : oneLine
}

/**
 * Build a verbose, reason-specific notification so the user understands *why*
 * the toast appeared without opening the thread: which thread, in which
 * workspace, and exactly what it's waiting on.
 */
function describe(
  status: "awaiting" | "error",
  attention: ThreadAttention | undefined,
  threadTitle: string,
  workspace: string | undefined
): { title: string; description: string } {
  const who = workspace
    ? `"${threadTitle}" in ${workspace}`
    : `"${threadTitle}"`
  const detail = clip(attention?.detail)

  if (status === "error") {
    return {
      title: "Thread hit an error",
      description: detail
        ? `${who} stopped after an error: ${detail}`
        : `${who} stopped after running into an error.`,
    }
  }

  if (attention?.reason === "question") {
    return {
      title: "Waiting for your answer",
      description: detail
        ? `${who} asked: ${detail}`
        : `${who} asked you a question and is waiting for your answer.`,
    }
  }

  if (attention?.reason === "approval") {
    return {
      title: "Approval needed",
      description: detail
        ? `${who} needs your approval to run the "${detail}" tool before it can continue.`
        : `${who} needs your approval to run a tool before it can continue.`,
    }
  }

  return {
    title: "Waiting for your input",
    description: `${who} is paused and needs you before it can continue.`,
  }
}

/**
 * Surfaces a toast whenever ANY thread transitions into a state that needs the
 * user — a tool approval or a `question` (both arrive as `awaiting`), or a
 * failure (`error`) — even when that thread isn't in the foreground. The thread
 * currently being viewed is skipped: its approval card, question picker, or
 * inline error is already on screen, so a toast would be redundant. Clicking
 * the toast opens the thread.
 *
 * Driven by the global thread-status store (fed by the app-wide status
 * WebSocket), so it covers background threads, not just the active one. Mount
 * once near the app root, inside the router + workspace providers.
 */
export function useThreadNotifications(): void {
  const navigate = useNavigate()
  const { data: workspaces } = useWorkspaces()

  // Keep the latest workspaces / navigate reachable from the store subscription
  // (registered once) without re-subscribing on every render.
  const workspacesRef = useRef(workspaces)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    workspacesRef.current = workspaces
    navigateRef.current = navigate
  })

  useEffect(() => {
    // Snapshot current statuses so we only react to genuine transitions, not to
    // states that already existed when this listener mounted.
    const seen: Record<string, ThreadStatus> = {
      ...useThreadStatusStore.getState().statuses,
    }

    return useThreadStatusStore.subscribe((state) => {
      const { statuses, attention, activeThreadId } = state
      for (const threadId of Object.keys(statuses)) {
        const status = statuses[threadId]
        if (seen[threadId] === status) continue
        const prev = seen[threadId]
        seen[threadId] = status

        // Tidy up: once a thread leaves an attention state (resumed, answered,
        // or recovered), drop its lingering toast so it never outlives reality.
        if (prev === "awaiting") toast.dismiss(awaitingToastId(threadId))
        if (prev === "error") toast.dismiss(errorToastId(threadId))

        // Only notify for states that need the user, and never for the thread
        // already on screen (its inline UI already shows the prompt/error).
        if (status !== "awaiting" && status !== "error") continue
        if (threadId === activeThreadId) continue

        const loc = findThread(workspacesRef.current, threadId)
        const { title, description } = describe(
          status,
          attention[threadId],
          loc?.title ?? "Untitled thread",
          loc?.workspaceName
        )
        const open = () => {
          void navigateRef.current({
            to: "/workspace/$threadId",
            params: { threadId },
          })
        }

        if (status === "awaiting") {
          // Amber "warning" matches the app's needs-attention motif (the
          // sidebar's amber awaiting indicator, worktree "needs attention" toasts).
          toast.warning(title, {
            // Per-thread id so a re-prompt replaces rather than stacks.
            id: awaitingToastId(threadId),
            description,
            duration: 10000,
            action: { label: "Open", onClick: open },
          })
        } else {
          toast.error(title, {
            id: errorToastId(threadId),
            description,
            duration: 8000,
            action: { label: "Open", onClick: open },
          })
        }
      }
    })
  }, [])
}
