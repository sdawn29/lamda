import { Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"
import { SkillAvatar } from "./skill-avatar"
import type { InstalledSkill } from "../types"

export function InstalledSkillCard({
  skill,
  removing,
  updateAvailable,
  updating,
  onRemove,
  onUpdate,
  onClick,
}: {
  skill: InstalledSkill
  removing?: boolean
  /** True when the registry has a newer version than what's installed. */
  updateAvailable?: boolean
  updating?: boolean
  onRemove: () => void
  /** Reinstalls from `skill.source` to pick up the newer version. */
  onUpdate?: () => void
  onClick?: () => void
}) {
  const clickable = !!onClick

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) onClick?.()
      }}
      className={cn(
        "flex flex-col gap-2.5 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition-shadow",
        clickable && "cursor-pointer hover:ring-foreground/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <SkillAvatar name={skill.name} className="size-9" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium">{skill.name}</span>
        </div>
        {updateAvailable && (
          <Badge
            variant="secondary"
            className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            Update available
          </Badge>
        )}
      </div>

      <p className="line-clamp-2 text-2xs leading-snug text-muted-foreground">
        {skill.description || "No description."}
      </p>

      <div className="flex items-center justify-end gap-1">
        {updateAvailable && onUpdate && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  disabled={updating}
                  onClick={(e) => {
                    e.stopPropagation()
                    onUpdate()
                  }}
                >
                  {updating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Update
                </Button>
              }
            />
            <TooltipContent>Reinstall from {skill.source}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                disabled={removing}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
              >
                {removing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Remove
              </Button>
            }
          />
          <TooltipContent>Remove from ~/.lamda/skills</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
