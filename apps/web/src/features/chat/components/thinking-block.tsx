import { memo } from "react"

export const ThinkingBlock = memo(function ThinkingBlock({
  thinking,
}: {
  thinking: string
}) {
  const paragraphs = thinking
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/_(.+?)_/g, "$1")
        .replace(/~~(.+?)~~/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    )

  return (
    <>
      {paragraphs.map((text, i) => (
        <p
          key={i}
          className="text-xs leading-relaxed text-muted-foreground/55 italic"
        >
          {text}
        </p>
      ))}
    </>
  )
})
