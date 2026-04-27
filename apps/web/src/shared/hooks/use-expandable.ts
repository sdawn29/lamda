import { useState, useCallback } from "react"

interface UseExpandableOptions {
  /** Initial expanded state (default: false) */
  initialExpanded?: boolean
  /** Allow keyboard toggle with Space/Enter */
  keyboardToggle?: boolean
}

interface UseExpandableResult {
  /** Whether the item is currently expanded */
  expanded: boolean
  /** Toggle the expanded state */
  toggle: () => void
  /** Set to a specific state */
  setExpanded: (expanded: boolean) => void
  /** Event handlers for button/trigger element */
  triggerProps: {
    onClick: (e: React.MouseEvent) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    "aria-expanded": boolean
  }
}

/**
 * Hook for managing expand/collapse state with optional keyboard support.
 */
export function useExpandable({
  initialExpanded = false,
  keyboardToggle = true,
}: UseExpandableOptions = {}): UseExpandableResult {
  const [expanded, setExpanded] = useState(initialExpanded)

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggle()
    },
    [toggle]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!keyboardToggle) return
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }
    },
    [toggle, keyboardToggle]
  )

  return {
    expanded,
    toggle,
    setExpanded,
    triggerProps: {
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      "aria-expanded": expanded,
    },
  }
}
