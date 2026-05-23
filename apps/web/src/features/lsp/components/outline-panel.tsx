import { useState } from "react"
import { ChevronDown, ChevronRight, ListTree } from "lucide-react"
import type { DocumentSymbol, DocumentSymbolResult } from "../types"
import { cn } from "@/shared/lib/utils"

interface OutlinePanelProps {
  symbols: DocumentSymbolResult | null
  onJumpToLine: (line: number) => void
}

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
}

function isHierarchical(symbols: DocumentSymbolResult): symbols is DocumentSymbol[] {
  return symbols.length > 0 && "range" in symbols[0]
}

export function OutlinePanel({ symbols, onJumpToLine }: OutlinePanelProps) {
  const [open, setOpen] = useState(false)
  if (!symbols || symbols.length === 0) return null

  return (
    <div className="border-b bg-muted/10 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-muted-foreground hover:bg-muted/30"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <ListTree className="size-3.5" />
        <span>Outline</span>
        <span className="ml-auto text-muted-foreground/70">{symbols.length}</span>
      </button>
      {open && (
        <div className="max-h-64 overflow-auto border-t bg-background/50 py-1">
          {isHierarchical(symbols) ? (
            <SymbolTree symbols={symbols} depth={0} onJumpToLine={onJumpToLine} />
          ) : (
            <ul>
              {symbols.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onJumpToLine(s.location.range.start.line + 1)}
                    className="flex w-full items-center gap-2 px-3 py-0.5 text-left hover:bg-muted/40"
                  >
                    <span className="text-muted-foreground/70">{SYMBOL_KIND_NAMES[s.kind] ?? "?"}</span>
                    <span>{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function SymbolTree({
  symbols,
  depth,
  onJumpToLine,
}: {
  symbols: DocumentSymbol[]
  depth: number
  onJumpToLine: (line: number) => void
}) {
  return (
    <ul>
      {symbols.map((s, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onJumpToLine(s.range.start.line + 1)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-0.5 text-left hover:bg-muted/40",
            )}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
          >
            <span className="text-muted-foreground/70">
              {SYMBOL_KIND_NAMES[s.kind] ?? "?"}
            </span>
            <span>{s.name}</span>
            {s.detail && (
              <span className="ml-2 truncate text-muted-foreground/60">{s.detail}</span>
            )}
          </button>
          {s.children && s.children.length > 0 && (
            <SymbolTree
              symbols={s.children}
              depth={depth + 1}
              onJumpToLine={onJumpToLine}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
