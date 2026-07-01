import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"
import { SkillAvatar } from "./skill-avatar"
import type { InstalledSkill } from "../types"

export function InstalledSkillCard({
  skill,
  removing,
  onRemove,
  onClick,
}: {
  skill: InstalledSkill
  removing?: boolean
  onRemove: () => void
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
          <span className="line-clamp-1 text-3xs text-muted-foreground/60">
            {skill.description || "No description."}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end">
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
