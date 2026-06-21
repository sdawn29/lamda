import { useState, useCallback } from "react"
import { ChevronRight, FolderOpen, Globe, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { FieldError } from "@/shared/ui/field"
import { useSelectFolder } from "@/features/electron"

interface CreateWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateLocal: (path: string) => Promise<void>
  onCreateRemote: (url: string, folder: string) => Promise<void>
}

type Step = "options" | "remote"

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreateLocal,
  onCreateRemote,
}: CreateWorkspaceDialogProps) {
  const [step, setStep] = useState<Step>("options")
  const [repoUrl, setRepoUrl] = useState("")
  const [cloneFolder, setCloneFolder] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectFolderMutation = useSelectFolder()

  const handleClose = useCallback(() => {
    setStep("options")
    setRepoUrl("")
    setCloneFolder("")
    setError(null)
    onOpenChange(false)
  }, [onOpenChange])

  const handleLocalClick = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const folderPath = await selectFolderMutation.mutateAsync({
        canCreateFolder: true,
      })
      if (folderPath) {
        await onCreateLocal(folderPath)
        handleClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace")
    } finally {
      setIsLoading(false)
    }
  }, [selectFolderMutation, onCreateLocal, handleClose])

  const handleRemoteOptionClick = useCallback(() => {
    setError(null)
    setStep("remote")
  }, [])

  const handleRemoteSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!repoUrl.trim() || !cloneFolder.trim()) return

      setError(null)
      setIsLoading(true)
      try {
        await onCreateRemote(repoUrl.trim(), cloneFolder.trim())
        handleClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clone repository")
      } finally {
        setIsLoading(false)
      }
    },
    [repoUrl, cloneFolder, onCreateRemote, handleClose]
  )

  const handleBrowseFolder = useCallback(async () => {
    const folderPath = await selectFolderMutation.mutateAsync({
      canCreateFolder: true,
    })
    if (folderPath) {
      setCloneFolder(folderPath)
    }
  }, [selectFolderMutation])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[400px]">
        {step === "options" ? (
          <>
            <DialogHeader className="border-b px-4 pt-4 pb-3">
              <DialogTitle className="text-sm font-semibold">New workspace</DialogTitle>
              <DialogDescription>
                Choose how you want to set up your workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 px-4 py-4">
              <WorkspaceOption
                icon={FolderOpen}
                title="Local repository"
                description="Select an existing folder or create a new one."
                onClick={handleLocalClick}
                disabled={isLoading}
                loading={isLoading}
              />
              <WorkspaceOption
                icon={Globe}
                title="Connect remote repository"
                description="Clone from GitHub, GitLab, or any Git host."
                onClick={handleRemoteOptionClick}
                disabled={isLoading}
              />
              {error && <FieldError className="px-1">{error}</FieldError>}
            </div>
          </>
        ) : (
          <form onSubmit={handleRemoteSubmit} className="flex flex-col gap-0">
            <DialogHeader className="border-b px-4 pt-4 pb-3">
              <DialogTitle className="text-sm font-semibold">
                Connect remote repository
              </DialogTitle>
              <DialogDescription>
                Enter the URL of the repository you want to clone.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-4 py-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="repo-url" className="text-xs font-medium">
                  Repository URL
                </label>
                <Input
                  id="repo-url"
                  type="url"
                  placeholder="https://github.com/user/repo.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="clone-folder" className="text-xs font-medium">
                  Clone into folder
                </label>
                <div className="flex gap-2">
                  <Input
                    id="clone-folder"
                    placeholder="/path/to/workspace"
                    value={cloneFolder}
                    onChange={(e) => setCloneFolder(e.target.value)}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={handleBrowseFolder}
                    disabled={selectFolderMutation.isPending}
                  >
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A subfolder named after the repository will be created here.
                </p>
              </div>

              {error && <FieldError>{error}</FieldError>}
            </div>

            <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("options")
                  setError(null)
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!repoUrl.trim() || !cloneFolder.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Cloning…
                  </>
                ) : (
                  "Clone repository"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface WorkspaceOptionProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

function WorkspaceOption({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  loading,
}: WorkspaceOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {loading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  )
}
