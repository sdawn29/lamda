/**
 * Lazy boundary for the Monaco viewer. Monaco (and its language workers) is a
 * large dependency, so it is only fetched when a file is actually opened — not
 * as part of the initial workspace bundle.
 */
import { lazy, Suspense, type ComponentProps } from "react"
import { Loader2 } from "lucide-react"

const MonacoCodeViewerImpl = lazy(() => import("./monaco-code-viewer"))

type Props = ComponentProps<typeof MonacoCodeViewerImpl>

export function MonacoCodeViewer(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </div>
      }
    >
      <MonacoCodeViewerImpl {...props} />
    </Suspense>
  )
}
