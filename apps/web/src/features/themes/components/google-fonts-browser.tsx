import * as React from "react"
import { ChevronsUpDown } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/shared/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"

import {
  GOOGLE_FONTS,
  GOOGLE_FONT_CATEGORIES,
  type GoogleFontCategory,
} from "../google-fonts-data"
import { loadGoogleFont } from "../google-fonts-loader"
import { resolveFontLabel, type FontOption } from "../font-options"

// ── Lazy font loader via IntersectionObserver ────────────────────────────────

const fontLoadedSet = new Set<string>()

function useLazyFont<T extends HTMLElement>(family: string | null) {
  const ref = React.useRef<T | null>(null)
  const [loaded, setLoaded] = React.useState(() =>
    family ? fontLoadedSet.has(family) : true
  )

  React.useEffect(() => {
    if (!family || fontLoadedSet.has(family)) {
      setLoaded(true)
      return
    }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          loadGoogleFont(family)
          fontLoadedSet.add(family)
          setLoaded(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [family])

  return { ref, loaded }
}

// ── Font item ────────────────────────────────────────────────────────────────

interface FontItemProps {
  /** Unique font ID (`gf:Family` or a bundled option ID). */
  id: string
  label: string
  /** CSS font-family used to render the label as its own preview. */
  fontFamily: string
  /** Google Fonts family to lazy-load, or null for bundled fonts. */
  lazyFamily: string | null
  selected: boolean
  onSelect: (id: string) => void
}

function FontItem({
  id,
  label,
  fontFamily,
  lazyFamily,
  selected,
  onSelect,
}: FontItemProps) {
  const { ref, loaded } = useLazyFont<HTMLDivElement>(lazyFamily)

  return (
    <CommandItem
      ref={ref}
      value={id}
      data-checked={selected}
      onSelect={() => onSelect(id)}
    >
      <span
        className="truncate text-sm"
        style={loaded ? { fontFamily } : undefined}
      >
        {label}
      </span>
    </CommandItem>
  )
}

// ── Main combobox ────────────────────────────────────────────────────────────

interface GoogleFontsBrowserProps {
  value: string
  onChange: (id: string) => void
  bundledOptions: FontOption[]
  /** Category of the bundled fonts; its group is listed first. */
  defaultCategory?: GoogleFontCategory | "all"
}

export function GoogleFontsBrowser({
  value,
  onChange,
  bundledOptions,
  defaultCategory = "all",
}: GoogleFontsBrowserProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const query = search.trim().toLowerCase()

  const filteredBuiltIns = React.useMemo(
    () =>
      bundledOptions.filter(
        (o) => !query || o.label.toLowerCase().includes(query)
      ),
    [bundledOptions, query]
  )

  // Category groups, with the picker's natural category first.
  const categoryGroups = React.useMemo(() => {
    const categories = GOOGLE_FONT_CATEGORIES.filter(
      (c): c is { id: GoogleFontCategory; label: string } => c.id !== "all"
    ).sort((a, b) =>
      a.id === defaultCategory ? -1 : b.id === defaultCategory ? 1 : 0
    )

    return categories
      .map((cat) => ({
        ...cat,
        fonts: GOOGLE_FONTS.filter(
          (f) =>
            f.category === cat.id &&
            (!query || f.family.toLowerCase().includes(query))
        ),
      }))
      .filter((group) => group.fonts.length > 0)
  }, [defaultCategory, query])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setSearch("")
  }

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
  }

  const currentLabel = resolveFontLabel(value, bundledOptions)
  const currentFontFamily = value.startsWith("gf:")
    ? `"${value.slice(3)}", sans-serif`
    : bundledOptions.find((o) => o.id === value)?.value

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 min-w-40 justify-between gap-2 px-2.5 text-xs"
          />
        }
      >
        <span
          className="truncate"
          style={currentFontFamily ? { fontFamily: currentFontFamily } : undefined}
        >
          {currentLabel}
        </span>
        <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <Command shouldFilter={false} defaultValue={value}>
          <CommandInput
            placeholder="Search fonts…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No fonts found.</CommandEmpty>

            {filteredBuiltIns.length > 0 && (
              <CommandGroup heading="Built-in">
                {filteredBuiltIns.map((option) => (
                  <FontItem
                    key={option.id}
                    id={option.id}
                    label={option.label}
                    fontFamily={option.value}
                    lazyFamily={null}
                    selected={value === option.id}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            )}

            {categoryGroups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.fonts.map((font) => (
                  <FontItem
                    key={font.family}
                    id={`gf:${font.family}`}
                    label={font.family}
                    fontFamily={`"${font.family}", sans-serif`}
                    lazyFamily={font.family}
                    selected={value === `gf:${font.family}`}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
