import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import type { PluggableList } from "unified"
import { AlertTriangle, Check, Download } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Progress, ProgressLabel, ProgressValue } from "@/shared/ui/progress"
import { cn } from "@/shared/lib/utils"

import { useDownloadUpdate, useInstallUpdate } from "./mutations"
import type { ElectronReleaseNote, ElectronUpdateStatus } from "./api"

const remarkPlugins: PluggableList = [remarkGfm]
// GitHub's release feed (the source for electron-updater's `releaseNotes`)
// delivers the changelog as HTML, so parse the raw HTML and sanitize it before
// rendering. Plain-markdown notes still pass through untouched.
const rehypePlugins: PluggableList = [rehypeRaw, rehypeSanitize]

// Release notes are read-only inside the app: links (markdown or raw HTML)
// render as plain text so nothing in the changelog is clickable.
const markdownComponents: Components = {
  a: ({ children }) => <span>{children}</span>,
}

const proseClass =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-headings:text-sm prose-headings:leading-[1.4] prose-headings:my-0 prose-p:leading-[1.6] prose-p:mt-0 prose-p:mb-[0.75em] prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 [&_li]:leading-[1.6] [&_li]:text-sm [&_li>p]:my-0 [&>*+*]:mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"

function NoteBody({ note }: { note: string | null }) {
  if (!note || !note.trim()) {
    return (
      <p className="text-xs text-muted-foreground">
        No changelog was published for this release.
      </p>
    )
  }
  return (
    <div className={proseClass}>
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {note}
      </Markdown>
    </div>
  )
}

/**
 * Renders update release notes as markdown. When the update spans several
 * releases (the client skipped versions), each release gets its own section
 * under a version rule so the whole gap is covered. Links are inert.
 */
export function ReleaseNotes({
  notes,
  className,
}: {
  notes: ElectronReleaseNote[] | null | undefined
  className?: string
}) {
  const entries = notes ?? []
  if (entries.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No changelog was published for this release.
      </p>
    )
  }

  if (entries.length === 1) {
    return (
      <div className={className}>
        <NoteBody note={entries[0].note} />
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {entries.map((entry) => (
        <section key={entry.version}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-2xs font-semibold text-muted-foreground tabular-nums">
              v{entry.version}
            </span>
            <span aria-hidden className="h-px flex-1 bg-border/60" />
          </div>
          <NoteBody note={entry.note} />
        </section>
      ))}
    </div>
  )
}

function releaseNotesFor(
  status: ElectronUpdateStatus
): ElectronReleaseNote[] | null {
  switch (status.phase) {
    case "available":
    case "downloading":
    case "ready":
      return status.releaseNotes
    default:
      return null
  }
}

/**
 * Dialog that surfaces the changelog for a pending update along with the
 * download / install actions for the current update phase.
 */
export function UpdateDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ElectronUpdateStatus
}) {
  const downloadUpdate = useDownloadUpdate()
  const installUpdate = useInstallUpdate()

  const version =
    status.phase === "available" ||
    status.phase === "downloading" ||
    status.phase === "ready"
      ? status.version
      : null
  const releaseCount = releaseNotesFor(status)?.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {version ? `What's new in v${version}` : "Update"}
          </DialogTitle>
          <DialogDescription>
            {status.phase === "ready"
              ? "Restart to finish installing the update."
              : status.phase === "downloading"
                ? "The update is downloading."
                : "A new version is available to download."}
            {releaseCount > 1 &&
              ` Includes changes from ${releaseCount} releases since your version.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {status.phase === "error" ? (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{status.message}</span>
            </div>
          ) : (
            <ReleaseNotes notes={releaseNotesFor(status)} />
          )}
        </div>

        {status.phase === "downloading" && (
          <Progress value={status.percent} className="flex-col gap-1.5">
            <ProgressLabel>Downloading update</ProgressLabel>
            <ProgressValue>
              {() => `${Math.round(status.percent)}%`}
            </ProgressValue>
          </Progress>
        )}

        <DialogFooter showCloseButton>
          {status.phase === "available" && (
            <Button
              onClick={() => downloadUpdate.mutate()}
              disabled={downloadUpdate.isPending}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          )}
          {status.phase === "ready" && (
            <Button onClick={() => installUpdate.mutate()}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Restart & install
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
