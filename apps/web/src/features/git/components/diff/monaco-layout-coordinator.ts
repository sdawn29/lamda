// Shared layout coordinator for Monaco diff editors.
//
// Monaco's per-editor `automaticLayout: true` installs an independent
// observer per editor and relays out synchronously on every size change.
// With many inline diffs mounted in the chat, a single window resize fans
// out into N expensive `layout()` calls per frame and the UI stutters.
//
// Instead we share one ResizeObserver across all editors, coalesce the work
// into a single requestAnimationFrame, and skip editors whose box didn't
// actually change. Net effect: at most one batched layout pass per frame.

interface Layoutable {
  layout: (dimension?: { width: number; height: number }) => void
}

const registry = new Map<Element, Layoutable>()
const lastSize = new WeakMap<Element, { w: number; h: number }>()
let pending: Set<Element> | null = null
let rafId = 0
let observer: ResizeObserver | null = null

function measure(el: Element): { w: number; h: number } {
  const node = el as HTMLElement
  return { w: node.clientWidth, h: node.clientHeight }
}

function relayout(el: Element, size: { w: number; h: number }) {
  // Pass explicit dimensions rather than relying on Monaco's no-arg
  // `layout()` self-measure, which can be a no-op depending on the editor's
  // internal observer state — leaving the diff stuck at its creation size.
  registry.get(el)?.layout({ width: size.w, height: size.h })
}

function flush() {
  rafId = 0
  const targets = pending
  pending = null
  if (!targets) return
  for (const el of targets) {
    relayout(el, lastSize.get(el) ?? measure(el))
  }
}

function ensureObserver(): ResizeObserver | null {
  if (observer || typeof ResizeObserver === "undefined") return observer
  observer = new ResizeObserver((entries) => {
    let scheduled = false
    for (const entry of entries) {
      const el = entry.target
      if (!registry.has(el)) continue
      const { width, height } = entry.contentRect
      const prev = lastSize.get(el)
      if (prev && prev.w === width && prev.h === height) continue
      lastSize.set(el, { w: width, h: height })
      ;(pending ??= new Set()).add(el)
      scheduled = true
    }
    if (scheduled && rafId === 0) rafId = requestAnimationFrame(flush)
  })
  return observer
}

/**
 * Register a Monaco (diff) editor for size-driven relayout, keyed by the
 * element whose dimensions should drive it (typically the editor's container).
 * Returns a disposer that unregisters and stops observing.
 */
export function registerMonacoLayout(
  el: Element,
  target: Layoutable
): () => void {
  const ro = ensureObserver()
  registry.set(el, target)
  // Lay out synchronously on registration so the editor is correctly sized on
  // first paint instead of waiting for the ResizeObserver's async first
  // delivery (which, for an unchanged box, may never re-fire). Seed `lastSize`
  // so that first delivery is correctly skipped as a no-op.
  const size = measure(el)
  if (size.w > 0 && size.h > 0) {
    lastSize.set(el, size)
    relayout(el, size)
  }
  ro?.observe(el)
  return () => {
    registry.delete(el)
    lastSize.delete(el)
    pending?.delete(el)
    ro?.unobserve(el)
  }
}
