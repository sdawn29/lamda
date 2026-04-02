import * as React from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ChatTextboxProps {
  onSend?: (message: string) => void
  isLoading?: boolean
  onStop?: () => void
  placeholder?: string
  className?: string
}

export function ChatTextbox({
  onSend,
  isLoading = false,
  onStop,
  placeholder = "Ask anything…",
  className,
}: ChatTextboxProps) {
  const [value, setValue] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const canSend = value.trim().length > 0 && !isLoading

  function handleSend() {
    if (!canSend) return
    onSend?.(value.trim())
    setValue("")
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className={cn(
        "relative flex w-full flex-col gap-2 rounded-xl border border-input bg-card p-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        className
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="border-none bg-card px-0 py-0 shadow-none ring-0 outline-none focus-visible:border-none focus-visible:ring-0"
      />

      <div className="flex items-center justify-between">
        <p className="text-[0.625rem] text-muted-foreground">
          Press{" "}
          <kbd className="rounded border border-border px-0.5 font-mono">
            Enter
          </kbd>{" "}
          to send,{" "}
          <kbd className="rounded border border-border px-0.5 font-mono">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>

        {isLoading ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onStop}
                  aria-label="Stop generation"
                >
                  <SquareIcon />
                </Button>
              }
            />
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  <ArrowUpIcon />
                </Button>
              }
            />
            <TooltipContent>Send</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
