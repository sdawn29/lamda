import { lazy, Suspense } from "react"

import { detectLanguage } from "@/features/git"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { useTheme } from "@/shared/components/theme-provider"

const PrismCode = lazy(() => import("./prism-code"))

interface WriteViewProps {
  content: string
  filePath: string
  live: boolean
}

export function WriteView({ content, filePath, live }: WriteViewProps) {
  const { theme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const language = detectLanguage(filePath) ?? "text"

  return (
    <div className="max-h-72 overflow-auto rounded border border-border/30 text-xs">
      <Suspense
        fallback={
          <pre className="overflow-auto px-3 py-2 text-xs text-muted-foreground/60">
            {content}
          </pre>
        }
      >
        <PrismCode
          code={content}
          language={language}
          style={isDark ? jellybeansdark : jellybeanslight}
          fontSize="0.75rem"
          showLineNumbers={true}
          opacity={live ? 0.6 : 0.85}
        />
      </Suspense>
    </div>
  )
}
