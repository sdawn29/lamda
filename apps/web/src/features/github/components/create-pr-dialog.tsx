import { useEffect, useState } from "react"
import { ExternalLink, GitPullRequestArrow, Loader2 } from "lucide-react"
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
import { useRepoInfo } from "../queries"
import { useCreatePullRequest } from "../mutations"
import type { RepoContext } from "../types"

export function CreatePrDialog({
  open,
  onOpenChange,
  ctx,
  headBranch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: RepoContext
  /** The branch the PR is opened from (the current branch). */
  headBranch: string | null
}) {
  const { data: repo } = useRepoInfo(ctx, open)
  const createPr = useCreatePullRequest()

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [draft, setDraft] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setTitle("")
      setBody("")
      setDraft(false)
      setCreatedUrl(null)
      createPr.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const base = repo?.defaultBranch ?? null

  async function handleSubmit() {
    if (!title.trim()) return
    const result = await createPr.mutateAsync({
      ...ctx,
      title: title.trim(),
      body: body.trim() || undefined,
      base: base ?? undefined,
      draft,
    })
    setCreatedUrl(result.url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequestArrow className="size-4" />
            Create pull request
          </DialogTitle>
          <DialogDescription>
            {headBranch && base ? (
              <>
                Merge <span className="font-medium">{headBranch}</span> into{" "}
                <span className="font-medium">{base}</span>
                {repo ? ` on ${repo.nameWithOwner}` : ""}.
              </>
            ) : (
              "Open a pull request for the current branch."
            )}
          </DialogDescription>
        </DialogHeader>

        {createdUrl ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Pull request created successfully.
            </p>
            <Button
              variant="outline"
              className="w-fit gap-2"
              onClick={() => void openExternal(createdUrl)}
            >
              <ExternalLink className="size-4" />
              View on GitHub
            </Button>
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pr-title">Title</FieldLabel>
              <Input
                id="pr-title"
                placeholder="Add a concise title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pr-body">Description</FieldLabel>
              <Textarea
                id="pr-body"
                placeholder="Summarize the changes (Markdown supported)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="pr-draft"
                checked={draft}
                onCheckedChange={setDraft}
              />
              <FieldLabel htmlFor="pr-draft">Create as draft</FieldLabel>
            </Field>
            {createPr.isError && (
              <p className="text-sm text-destructive">
                {createPr.error instanceof Error
                  ? createPr.error.message
                  : "Failed to create pull request."}
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
                disabled={!title.trim() || createPr.isPending}
                className="gap-2"
              >
                {createPr.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {createPr.isPending ? "Pushing & creating…" : "Create pull request"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
