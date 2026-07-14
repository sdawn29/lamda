import type { ToolMessage } from "../types"

export interface ToolActivity {
  label: string
  summary: string | null
}

interface ActivityLabels {
  running: string
  done: string
  error: string
}

const TOOL_ACTIVITY_LABELS: Readonly<Record<string, ActivityLabels>> = {
  read: {
    running: "Reading file",
    done: "Read file",
    error: "Couldn't read file",
  },
  grep: {
    running: "Searching file contents",
    done: "Searched file contents",
    error: "File-content search failed",
  },
  find: {
    running: "Finding files",
    done: "Found files",
    error: "File search failed",
  },
  ls: {
    running: "Listing directory",
    done: "Listed directory",
    error: "Couldn't list directory",
  },
  bash: {
    running: "Running command",
    done: "Ran command",
    error: "Command failed",
  },
  edit: {
    running: "Editing file",
    done: "Edited file",
    error: "Couldn't edit file",
  },
  write: {
    running: "Writing file",
    done: "Wrote file",
    error: "Couldn't write file",
  },
  web_fetch: {
    running: "Fetching web page",
    done: "Fetched web page",
    error: "Web fetch failed",
  },
  semantic_search: {
    running: "Searching code by meaning",
    done: "Searched code by meaning",
    error: "Semantic search failed",
  },
  create_automation: {
    running: "Creating automation",
    done: "Created automation",
    error: "Couldn't create automation",
  },
  github_list_prs: {
    running: "Listing GitHub pull requests",
    done: "Listed GitHub pull requests",
    error: "Couldn't list GitHub pull requests",
  },
  github_get_pr: {
    running: "Loading GitHub pull request",
    done: "Loaded GitHub pull request",
    error: "Couldn't load GitHub pull request",
  },
  github_create_pr: {
    running: "Creating GitHub pull request",
    done: "Created GitHub pull request",
    error: "Couldn't create GitHub pull request",
  },
  github_list_issues: {
    running: "Listing GitHub issues",
    done: "Listed GitHub issues",
    error: "Couldn't list GitHub issues",
  },
  github_get_issue: {
    running: "Loading GitHub issue",
    done: "Loaded GitHub issue",
    error: "Couldn't load GitHub issue",
  },
  github_comment_issue: {
    running: "Commenting on GitHub issue",
    done: "Commented on GitHub issue",
    error: "Couldn't comment on GitHub issue",
  },
  github_checks: {
    running: "Checking GitHub CI",
    done: "Checked GitHub CI",
    error: "Couldn't check GitHub CI",
  },
  gitlab_list_mrs: {
    running: "Listing GitLab merge requests",
    done: "Listed GitLab merge requests",
    error: "Couldn't list GitLab merge requests",
  },
  gitlab_get_mr: {
    running: "Loading GitLab merge request",
    done: "Loaded GitLab merge request",
    error: "Couldn't load GitLab merge request",
  },
  gitlab_create_mr: {
    running: "Creating GitLab merge request",
    done: "Created GitLab merge request",
    error: "Couldn't create GitLab merge request",
  },
  gitlab_list_issues: {
    running: "Listing GitLab issues",
    done: "Listed GitLab issues",
    error: "Couldn't list GitLab issues",
  },
  gitlab_get_issue: {
    running: "Loading GitLab issue",
    done: "Loaded GitLab issue",
    error: "Couldn't load GitLab issue",
  },
  gitlab_comment_issue: {
    running: "Commenting on GitLab issue",
    done: "Commented on GitLab issue",
    error: "Couldn't comment on GitLab issue",
  },
  gitlab_comment_mr: {
    running: "Commenting on GitLab merge request",
    done: "Commented on GitLab merge request",
    error: "Couldn't comment on GitLab merge request",
  },
  gitlab_pipelines: {
    running: "Checking GitLab pipeline",
    done: "Checked GitLab pipeline",
    error: "Couldn't check GitLab pipeline",
  },
}

function argsRecord(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null
    ? (args as Record<string, unknown>)
    : {}
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function issueReference(args: Record<string, unknown>): string | null {
  const value = args.number ?? args.pr ?? args.mr
  return typeof value === "number" && Number.isFinite(value)
    ? `#${value}`
    : null
}

function toolSummary(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  if (toolName === "semantic_search") return stringArg(args, "query")
  if (toolName === "web_fetch") return stringArg(args, "url")
  if (toolName === "create_automation") {
    return stringArg(args, "name") ?? stringArg(args, "prompt")
  }
  if (toolName.startsWith("github_") || toolName.startsWith("gitlab_")) {
    return (
      issueReference(args) ??
      stringArg(args, "title") ??
      stringArg(args, "search")
    )
  }
  return null
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/[_-]+/g, " ").trim() || "tool"
}

function planLabels(args: Record<string, unknown>): ActivityLabels {
  switch (args.operation) {
    case "list":
      return {
        running: "Listing implementation plans",
        done: "Listed implementation plans",
        error: "Couldn't list implementation plans",
      }
    case "read":
      return {
        running: "Reading implementation plan",
        done: "Read implementation plan",
        error: "Couldn't read implementation plan",
      }
    case "write":
      return {
        running: "Writing implementation plan",
        done: "Wrote implementation plan",
        error: "Couldn't write implementation plan",
      }
    default:
      return {
        running: "Managing implementation plans",
        done: "Managed implementation plans",
        error: "Plan operation failed",
      }
  }
}

/**
 * Human-readable status text for every non-MCP tool call. Known built-ins get
 * specific verbs; unknown tools still read as an action instead of exposing a
 * bare implementation identifier in the transcript.
 */
export function describeToolActivity(msg: ToolMessage): ToolActivity {
  const toolName = msg.toolName.toLowerCase()
  const args = argsRecord(msg.args)
  const labels =
    toolName === "plan" ? planLabels(args) : TOOL_ACTIVITY_LABELS[toolName]

  if (labels) {
    return {
      label: labels[msg.status],
      summary:
        toolName === "plan"
          ? stringArg(args, "path")
          : toolSummary(toolName, args),
    }
  }

  const name = humanizeToolName(msg.toolName)
  return {
    label:
      msg.status === "running"
        ? `Running ${name}`
        : msg.status === "error"
          ? `${name} failed`
          : `Ran ${name}`,
    summary: null,
  }
}
