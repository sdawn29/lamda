/**
 * Lazy boundary for the Monaco viewer. Monaco (and its language workers) is a
 * large dependency, so it is only fetched when a file is actually opened — not
 * as part of the initial workspace bundle.
 */
import { lazy, Suspense, type ComponentProps } from "react"

const MonacoCodeViewerImpl = lazy(() => import("./monaco-code-viewer"))

type Props = ComponentProps<typeof MonacoCodeViewerImpl>

export function MonacoCodeViewer(props: Props) {
  return (
    <Suspense fallback={null}>
      <MonacoCodeViewerImpl {...props} />
    </Suspense>
  )
}
