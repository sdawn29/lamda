import { useEffect, useState } from "react"
import { ExternalLink, GitMerge, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Button } from "@/shared/ui/button"
import { Switch } from "@/shared/ui/switch"
import { openExternal } from "@/features/electron/api"
import { useGitlabRepoInfo } from "../queries"
import { useCreateMergeRequest } from "../mutations"
import type { RepoContext } from "../types"

export function CreateMrDialog({
  open,
  onOpenChange,
  ctx,
  sourceBranch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: RepoContext
  /** The branch the MR is opened from (the current branch). */
  sourceBranch: string | null
}) {
  const { data: repo } = useGitlabRepoInfo(ctx, open)
  const createMr = useCreateMergeRequest()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [draft, setDraft] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setTitle("")
      setDescription("")
      setDraft(false)
      setCreatedUrl(null)
      createMr.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const target = repo?.defaultBranch ?? null

  async function handleSubmit() {
    if (!title.trim()) return
    const result = await createMr.mutateAsync({
      ...ctx,
      title: title.trim(),
      description: description.trim() || undefined,
      sourceBranch: sourceBranch ?? undefined,
      targetBranch: target ?? undefined,
      draft,
    })
    setCreatedUrl(result.url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-4" />
            Create merge request
          </DialogTitle>
          <DialogDescription>
            {sourceBranch && target ? (
              <>
                Merge <span className="font-medium">{sourceBranch}</span> into{" "}
                <span className="font-medium">{target}</span>
                {repo ? ` on ${repo.nameWithOwner}` : ""}.
              </>
            ) : (
              "Open a merge request for the current branch."
            )}
          </DialogDescription>
        </DialogHeader>

        {createdUrl ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Merge request created successfully.
            </p>
            <Button
              variant="outline"
              className="w-fit gap-2"
              onClick={() => void openExternal(createdUrl)}
            >
              <ExternalLink className="size-4" />
              View on GitLab
            </Button>
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mr-title">Title</FieldLabel>
              <Input
                id="mr-title"
                placeholder="Add a concise title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="mr-description">Description</FieldLabel>
              <Textarea
                id="mr-description"
                placeholder="Summarize the changes (Markdown supported)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="mr-draft"
                checked={draft}
                onCheckedChange={setDraft}
              />
              <FieldLabel htmlFor="mr-draft">Create as draft</FieldLabel>
            </Field>
            {createMr.isError && (
              <p className="text-sm text-destructive">
                {createMr.error instanceof Error
                  ? createMr.error.message
                  : "Failed to create merge request."}
              </p>
            )}
          </FieldGroup>
        )}

        <DialogFooter>
          {createdUrl ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!title.trim() || createMr.isPending}
                className="gap-2"
              >
                {createMr.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {createMr.isPending
                  ? "Pushing & creating"
                  : "Create merge request"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
