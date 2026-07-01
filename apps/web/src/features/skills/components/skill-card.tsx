import { Download, Loader2 } from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { SkillAvatar } from "./skill-avatar"

function formatInstalls(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return `${count}`
}

export function SkillCard({
  name,
  subtitle,
  installs,
  installed,
  installing,
  onInstall,
  onClick,
}: {
  name: string
  /** Author/source line, e.g. "vercel-labs/agent-skills". */
  subtitle: string
  installs?: number
  installed: boolean
  installing?: boolean
  onInstall?: () => void
  onClick?: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.()
      }}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition-shadow",
        "hover:ring-foreground/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <SkillAvatar name={name} className="size-9" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium">{name}</span>
          <span className="truncate text-3xs text-muted-foreground/60">
            {subtitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {installs !== undefined && installs > 0 && (
          <span className="text-3xs text-muted-foreground/50">
            {formatInstalls(installs)} installs
          </span>
        )}
        <div className="ml-auto">
          {installed ? (
            <Badge
              variant="secondary"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              Installed
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              disabled={installing}
              onClick={(e) => {
                e.stopPropagation()
                onInstall?.()
              }}
            >
              {installing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              Install
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
