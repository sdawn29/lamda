import type { DiffLine, DiffLineKind } from "./types"

function isSdkFormat(diff: string): boolean {
  const first = diff.split("\n").find(Boolean) ?? ""
  return /^[+\- ]\d+ /.test(first)
}

function parseSdkDiff(diff: string): DiffLine[] {
  return diff
    .split("\n")
    .filter(Boolean)
    .map((raw): DiffLine => {
      const prefix = raw[0]
      const rest = raw.slice(1)
      const spaceIdx = rest.indexOf(" ")
      const lineNum = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)
      const content = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1)
      const isSkipped = prefix === " " && content === "..."
      const kind: DiffLineKind =
        prefix === "+"
          ? "added"
          : prefix === "-"
            ? "removed"
            : isSkipped
              ? "skipped"
              : "context"
      return {
        kind,
        oldLineNum: kind === "removed" || kind === "context" ? lineNum : "",
        newLineNum: kind === "added" || kind === "context" ? lineNum : "",
        content,
      }
    })
}

function parseUnifiedDiff(diff: string): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of diff.split("\n")) {
    if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ")
    ) {
      continue
    }

    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldLine = parseInt(m[1], 10)
        newLine = parseInt(m[2], 10)
      }
      result.push({ kind: "skipped", oldLineNum: "", newLineNum: "", content: "" })
      continue
    }

    if (raw.startsWith("+")) {
      result.push({ kind: "added", oldLineNum: "", newLineNum: String(newLine++), content: raw.slice(1) })
    } else if (raw.startsWith("-")) {
      result.push({ kind: "removed", oldLineNum: String(oldLine++), newLineNum: "", content: raw.slice(1) })
    } else if (raw.startsWith(" ") || raw === "") {
      result.push({ kind: "context", oldLineNum: String(oldLine), newLineNum: String(newLine), content: raw.slice(1) })
      oldLine++
      newLine++
    }
  }

  return result
}

export function parseDiff(diff: string): DiffLine[] {
  return isSdkFormat(diff) ? parseSdkDiff(diff) : parseUnifiedDiff(diff)
}
