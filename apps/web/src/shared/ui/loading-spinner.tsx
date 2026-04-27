import { Loader2 } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface LoadingSpinnerProps {
  className?: string
  /** Size variant: sm = 12px, md = 16px, lg = 20px */
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
}

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn(sizeClasses[size], "shrink-0 animate-spin text-muted-foreground", className)}
    />
  )
}
