import { describe, expect, it } from "vitest"
import { describeToolActivity } from "./tool-activity"
import type { ToolMessage } from "../types"

function tool(
  toolName: string,
  status: ToolMessage["status"] = "done",
  args: unknown = {}
): ToolMessage {
  return {
    role: "tool",
    toolCallId: "call-1",
    toolName,
    args,
    status,
  }
}

describe("describeToolActivity", () => {
  it.each([
    ["read", "Read file"],
    ["grep", "Searched file contents"],
    ["find", "Found files"],
    ["ls", "Listed directory"],
    ["bash", "Ran command"],
    ["edit", "Edited file"],
    ["write", "Wrote file"],
    ["web_fetch", "Fetched web page"],
    ["semantic_search", "Searched code by meaning"],
    ["create_automation", "Created automation"],
    ["github_checks", "Checked GitHub CI"],
    ["gitlab_pipelines", "Checked GitLab pipeline"],
  ])("renders %s as a completed action", (name, expected) => {
    expect(describeToolActivity(tool(name)).label).toBe(expected)
  })

  it("changes copy with execution status", () => {
    expect(describeToolActivity(tool("grep", "running")).label).toBe(
      "Searching file contents"
    )
    expect(describeToolActivity(tool("grep", "error")).label).toBe(
      "File-content search failed"
    )
  })

  it("describes each plan operation", () => {
    expect(
      describeToolActivity(tool("plan", "done", { operation: "list" })).label
    ).toBe("Listed implementation plans")
    expect(
      describeToolActivity(
        tool("plan", "running", { operation: "write", path: "search.md" })
      )
    ).toEqual({
      label: "Writing implementation plan",
      summary: "search.md",
    })
  })

  it("surfaces useful arguments for app and Git-host tools", () => {
    expect(
      describeToolActivity(
        tool("semantic_search", "done", { query: "session recovery" })
      ).summary
    ).toBe("session recovery")
    expect(
      describeToolActivity(tool("github_get_pr", "done", { number: 42 }))
        .summary
    ).toBe("#42")
  })

  it("gives future tools a verbose fallback", () => {
    expect(describeToolActivity(tool("inspect_cache")).label).toBe(
      "Ran inspect cache"
    )
  })
})
