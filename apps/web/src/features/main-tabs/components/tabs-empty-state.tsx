import { MessageSquarePlus, Search, FolderPlus } from "lucide-react"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useKeyboardShortcuts } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_LABELS } from "@/shared/lib/keyboard-shortcuts"

const HINTS = [
  { action: "new_thread", icon: MessageSquarePlus, description: "Start a fresh conversation" } as const,
  { action: "open_command_palette", icon: Search, description: "Jump to any action or file" } as const,
  { action: "new_workspace", icon: FolderPlus, description: "Open a local or remote repo" } as const,
]

export function TabsEmptyState() {
  const { shortcuts } = useKeyboardShortcuts()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 select-none">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1c1c1e] ring-1 ring-white/5 shadow-md">
          <span className="font-black text-2xl leading-none" style={{ color: "#d4a017" }}>Λ</span>
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold tracking-tight">Lamda</p>
          <p className="max-w-[200px] text-xs text-muted-foreground">
            Your AI-powered coding workspace
          </p>
        </div>
      </div>

      <div className="w-80 overflow-hidden rounded-xl border bg-card/60">
        {HINTS.map(({ action, icon: Icon, description }, i) => (
          <div
            key={action}
            className={`group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/50 ${i !== 0 ? "border-t" : ""}`}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary/70 group-hover:bg-primary/12 transition-colors">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-foreground/80">{SHORTCUT_LABELS[action]}</p>
              <p className="truncate text-[10px] text-muted-foreground">{description}</p>
            </div>
            <ShortcutKbd binding={shortcuts[action]} />
          </div>
        ))}
      </div>
    </div>
  )
}
