import { useState, useCallback } from "react"
import { FolderOpen, Globe, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useSelectFolder } from "@/features/electron"
import { cn } from "@/shared/lib/utils"

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
  }, [selectFolderMutation, onCreateLocal])

  const handleRemoteOptionClick = useCallback(() => {
    setError(null)
    setStep("remote")
  }, [])

  const handleRemoteSubmit = useCallback(async (e: React.FormEvent) => {
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
  }, [repoUrl, cloneFolder, onCreateRemote])

  const handleClose = () => {
    setStep("options")
    setRepoUrl("")
    setCloneFolder("")
    setError(null)
    onOpenChange(false)
  }

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
      <DialogContent className="sm:max-w-md">
        {step === "options" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>
                Choose how you want to set up your workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <button
                type="button"
                onClick={handleLocalClick}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                  isLoading ? "" : "border-border"
                )}
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <FolderOpen className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Local Repository</p>
                  <p className="text-xs text-muted-foreground">
                    Select an existing local folder or create a new one.
                  </p>
                </div>
                {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </button>

              <button
                type="button"
                onClick={handleRemoteOptionClick}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                  isLoading ? "" : "border-border"
                )}
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Globe className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Connect Remote Repository</p>
                  <p className="text-xs text-muted-foreground">
                    Clone a repository from GitHub, GitLab, or any Git host.
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleRemoteSubmit}>
            <DialogHeader>
              <DialogTitle>Connect Remote Repository</DialogTitle>
              <DialogDescription>
                Enter the URL of the repository you want to clone.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="repo-url" className="text-xs font-medium">
                  Repository URL
                </label>
                <Input
                  id="repo-url"
                  type="url"
                  placeholder="https://github.com/user/repo.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="clone-folder" className="text-xs font-medium">
                  Clone to folder
                </label>
                <div className="flex gap-2">
                  <Input
                    id="clone-folder"
                    placeholder="/path/to/workspace"
                    value={cloneFolder}
                    onChange={(e) => setCloneFolder(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBrowseFolder}
                    disabled={selectFolderMutation.isPending}
                  >
                    Browse
                  </Button>
                </div>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("options")
                  setError(null)
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={!repoUrl.trim() || !cloneFolder.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Cloning...
                  </>
                ) : (
                  "Clone Repository"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}