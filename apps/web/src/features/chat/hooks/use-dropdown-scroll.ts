import { useEffect, useRef } from "react"

export function useDropdownScroll(selectedIndex: number) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])
  return listRef
}
