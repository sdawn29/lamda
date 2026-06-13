import { useMemo, useState } from "react"
import { Bug, Lightbulb, MessageSquare } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"
import { useElectronPlatform, useOpenExternal } from "@/features/electron"

const GITHUB_REPO_URL = "https://github.com/sdawn29/lambda"

type FeedbackType = "bug" | "feature" | "feedback"

const FEEDBACK_TYPES: {
  value: FeedbackType
  label: string
  icon: typeof Bug
  // GitHub labels applied to the created issue.
  labels: string[]
  titlePrefix: string
  placeholder: string
}[] = [
  {
    value: "bug",
    label: "Bug",
    icon: Bug,
    labels: ["bug"],
    titlePrefix: "[Bug]",
    placeholder: "What happened, and what did you expect instead?",
  },
  {
    value: "feature",
    label: "Idea",
    icon: Lightbulb,
    labels: ["enhancement"],
    titlePrefix: "[Feature]",
    placeholder: "What would you like to see, and how would it help?",
  },
  {
    value: "feedback",
    label: "Other",
    icon: MessageSquare,
    labels: ["feedback"],
    titlePrefix: "[Feedback]",
    placeholder: "Share your thoughts, questions, or anything else.",
  },
]

const APP_VERSION = import.meta.env.DEV ? "dev build" : `v${__APP_VERSION__}`

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<FeedbackType>("bug")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const openExternal = useOpenExternal()
  const { data: platform } = useElectronPlatform()

  const selected = useMemo(
    () => FEEDBACK_TYPES.find((t) => t.value === type) ?? FEEDBACK_TYPES[0],
    [type]
  )

  function reset() {
    setType("bug")
    setTitle("")
    setDescription("")
  }

  function handleSubmit() {
    if (!title.trim()) return

    const issueTitle = `${selected.titlePrefix} ${title.trim()}`.trim()

    const body = [
      description.trim(),
      "",
      "---",
      "_Environment_",
      `- App version: ${APP_VERSION}`,
      `- Platform: ${platform ?? navigator.platform ?? "web"}`,
    ].join("\n")

    const url =
      `${GITHUB_REPO_URL}/issues/new?` +
      new URLSearchParams({
        title: issueTitle,
        body,
        labels: selected.labels.join(","),
      }).toString()

    openExternal
      .mutateAsync(url)
      .then((opened) => {
        if (!opened) window.open(url, "_blank", "noopener,noreferrer")
      })
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"))

    onOpenChange(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            We'll open a pre-filled GitHub issue for you to review.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {FEEDBACK_TYPES.map((t) => {
              const Icon = t.icon
              const active = t.value === type
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors focus-visible:outline-none",
                    active
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a short summary"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit()
            }}
          />

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={selected.placeholder}
            className="min-h-28"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            Open on GitHub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
