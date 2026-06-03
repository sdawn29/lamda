import { lazy, Suspense } from "react"

import { detectLanguage } from "@/features/git"
import { useSyntaxTheme } from "@/features/themes"

const PrismCode = lazy(() => import("./prism-code"))

interface WriteViewProps {
  content: string
  filePath: string
  live: boolean
}

export function WriteView({ content, filePath, live }: WriteViewProps) {
  const syntax = useSyntaxTheme()
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
          style={syntax.prism}
          fontSize="0.75rem"
          showLineNumbers={true}
          opacity={live ? 0.6 : 0.85}
        />
      </Suspense>
    </div>
  )
}
