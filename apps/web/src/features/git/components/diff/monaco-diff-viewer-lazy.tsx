import { lazy, Suspense, type ComponentProps } from "react"

const MonacoDiffViewerImpl = lazy(() => import("./monaco-diff-viewer"))

type Props = ComponentProps<typeof MonacoDiffViewerImpl>

export function MonacoDiffViewer(props: Props) {
  return (
    <Suspense fallback={null}>
      <MonacoDiffViewerImpl {...props} />
    </Suspense>
  )
}
