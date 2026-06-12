import * as React from "react"
import { Check, ChevronDown, Search } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import {
  GOOGLE_FONTS,
  GOOGLE_FONT_CATEGORIES,
  type GoogleFontCategory,
} from "../google-fonts-data"
import { loadGoogleFont } from "../google-fonts-loader"
import { resolveFontLabel, type FontOption } from "../font-options"

// ── Lazy font loader via IntersectionObserver ────────────────────────────────

const fontLoadedSet = new Set<string>()

function useLazyFont(family: string | null) {
  const ref = React.useRef<HTMLButtonElement | null>(null)
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

// ── Built-in font section ────────────────────────────────────────────────────

interface BuiltInFontItemProps {
  option: FontOption
  selected: boolean
  onSelect: () => void
}

function BuiltInFontItem({ option, selected, onSelect }: BuiltInFontItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent"
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className="text-sm font-medium leading-none"
          style={{ fontFamily: option.value }}
        >
          {option.label}
        </span>
        <span className="text-xs text-muted-foreground">Built-in</span>
      </div>
      {selected && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  )
}

// ── Google font item ─────────────────────────────────────────────────────────

interface GoogleFontItemProps {
  family: string
  category: GoogleFontCategory
  selected: boolean
  onSelect: () => void
}

function GoogleFontItem({
  family,
  category,
  selected,
  onSelect,
}: GoogleFontItemProps) {
  const { ref, loaded } = useLazyFont(family)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent"
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className="text-sm leading-none"
          style={loaded ? { fontFamily: `"${family}", sans-serif` } : undefined}
        >
          {family}
        </span>
        <span className="text-xs capitalize text-muted-foreground">
          {category.replace("-", " ")}
        </span>
      </div>
      {selected && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  )
}

// ── Main browser ─────────────────────────────────────────────────────────────

type CategoryFilter = GoogleFontCategory | "all"

interface GoogleFontsBrowserProps {
  value: string
  onChange: (id: string) => void
  bundledOptions: FontOption[]
  /** Which category tab to open first. */
  defaultCategory?: CategoryFilter
}

export function GoogleFontsBrowser({
  value,
  onChange,
  bundledOptions,
  defaultCategory = "all",
}: GoogleFontsBrowserProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [category, setCategory] = React.useState<CategoryFilter>(defaultCategory)

  const filteredFonts = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return GOOGLE_FONTS.filter(
      (f) =>
        (category === "all" || f.category === category) &&
        (!q || f.family.toLowerCase().includes(q))
    )
  }, [search, category])

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
  }

  const currentLabel = resolveFontLabel(value, bundledOptions)
  const currentFontFamily = value.startsWith("gf:")
    ? `"${value.slice(3)}", sans-serif`
    : bundledOptions.find((o) => o.id === value)?.value

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-7 min-w-40 justify-between gap-2 px-2.5 text-xs" />
        }
      >
        <span
          className="truncate"
          style={currentFontFamily ? { fontFamily: currentFontFamily } : undefined}
        >
          {currentLabel}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-50" />
      </DialogTrigger>

      <DialogContent className="flex max-h-[80vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3">
          <DialogTitle>Choose a font</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="shrink-0 border-b border-border/50 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search fonts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8"
              autoFocus
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="shrink-0 border-b border-border/50 px-3 py-1.5">
          <Tabs value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
            <TabsList variant="line" className="gap-0.5">
              {GOOGLE_FONT_CATEGORIES.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id}>
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Font list */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Built-in section — only shown when not searching */}
          {!search && (category === "all" || bundledOptions.some(() => true)) && (
            <div className="mb-2">
              <div className="mb-1 px-3 py-1">
                <span className="text-xs font-medium text-muted-foreground">Built-in</span>
              </div>
              {bundledOptions.map((option) => (
                <BuiltInFontItem
                  key={option.id}
                  option={option}
                  selected={value === option.id}
                  onSelect={() => handleSelect(option.id)}
                />
              ))}
            </div>
          )}

          {/* Google Fonts */}
          {filteredFonts.length > 0 ? (
            <div>
              {!search && (
                <div className="mb-1 px-3 py-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Google Fonts
                  </span>
                </div>
              )}
              {filteredFonts.map((font) => (
                <GoogleFontItem
                  key={font.family}
                  family={font.family}
                  category={font.category}
                  selected={value === `gf:${font.family}`}
                  onSelect={() => handleSelect(`gf:${font.family}`)}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No fonts match &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
