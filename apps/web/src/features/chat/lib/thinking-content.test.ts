import { describe, expect, it } from "vitest"

import { cleanThinkingContent } from "./thinking-content"

describe("cleanThinkingContent", () => {
  it("removes repeated empty HTML comment separators", () => {
    expect(
      cleanThinkingContent("First thought\n<!-- -->\n<!--   -->\nNext thought")
    ).toBe("First thought\n\n\nNext thought")
  })

  it("removes comments containing provider metadata", () => {
    expect(cleanThinkingContent("Before <!-- internal --> after")).toBe(
      "Before  after"
    )
  })

  it("removes entity-escaped comments", () => {
    expect(cleanThinkingContent("Before &lt;!-- --&gt; after")).toBe(
      "Before  after"
    )
  })

  it("hides an unfinished trailing comment while thinking streams", () => {
    expect(cleanThinkingContent("Visible reasoning\n<!-- pending")).toBe(
      "Visible reasoning\n"
    )
  })

  it("preserves ordinary Markdown and comparison operators", () => {
    const content = "**Reasoning:** `a < b` and `c > d`"
    expect(cleanThinkingContent(content)).toBe(content)
  })
})
