import { lazy, Suspense, type ComponentProps } from "react"

const ConflictEditorImpl = lazy(() => import("./conflict-editor"))

type Props = ComponentProps<typeof ConflictEditorImpl>

export function ConflictEditor(props: Props) {
  return (
    <Suspense fallback={null}>
      <ConflictEditorImpl {...props} />
    </Suspense>
  )
}
