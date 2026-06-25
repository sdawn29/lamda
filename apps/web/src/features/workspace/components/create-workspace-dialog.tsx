import { useState, useCallback } from "react"
import { ChevronRight, FolderOpen, GitBranch, Loader2 } from "lucide-react"
import { Github as GithubIcon } from "@lobehub/icons"

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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { useSelectFolder } from "@/features/electron"
import { useGhStatus, useRepositories } from "@/features/github"
import type { GhRepositorySummary, GhStatus } from "@/features/github"

interface CreateWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateLocal: (path: string) => Promise<void>
  onCreateRemote: (url: string, folder: string) => Promise<void>
}

type Step = "options" | "github" | "remote"

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreateLocal,
  onCreateRemote,
}: CreateWorkspaceDialogProps) {
  const [step, setStep] = useState<Step>("options")
  const [repoUrl, setRepoUrl] = useState("")
  const [selectedRepoUrl, setSelectedRepoUrl] = useState("")
  const [cloneFolder, setCloneFolder] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectFolderMutation = useSelectFolder()
  const ghStatus = useGhStatus()
  const canLoadRepositories =
    open &&
    step === "github" &&
    Boolean(ghStatus.data?.installed && ghStatus.data?.authenticated)
  const repositoriesQuery = useRepositories(canLoadRepositories)

  const handleClose = useCallback(() => {
    setStep("options")
    setRepoUrl("")
    setSelectedRepoUrl("")
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

  const handleGithubOptionClick = useCallback(() => {
    setError(null)
    setRepoUrl("")
    setSelectedRepoUrl("")
    setStep("github")
  }, [])

  const handleRemoteOptionClick = useCallback(() => {
    setError(null)
    setRepoUrl("")
    setSelectedRepoUrl("")
    setStep("remote")
  }, [])

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const url = selectedRepoUrl || repoUrl.trim()
      if (!url || !cloneFolder.trim()) return

      setError(null)
      setIsLoading(true)
      try {
        await onCreateRemote(url, cloneFolder.trim())
        handleClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clone repository")
      } finally {
        setIsLoading(false)
      }
    },
    [selectedRepoUrl, repoUrl, cloneFolder, onCreateRemote, handleClose]
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
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
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
                icon={<FolderOpen className="size-4" />}
                title="Local repository"
                description="Select an existing folder or create a new one."
                onClick={handleLocalClick}
                disabled={isLoading}
                loading={isLoading}
              />
              <WorkspaceOption
                icon={<GithubIcon size={16} />}
                title="Open GitHub"
                description="Choose from your GitHub projects."
                onClick={handleGithubOptionClick}
                disabled={isLoading}
              />
              <WorkspaceOption
                icon={<GitBranch className="size-4" />}
                title="Clone Git repository"
                description="Paste any Git origin URL, including SSH remotes."
                onClick={handleRemoteOptionClick}
                disabled={isLoading}
              />
              {error && <FieldError className="px-1">{error}</FieldError>}
            </div>
          </>
        ) : (
          <form onSubmit={handleCloneSubmit} className="flex flex-col gap-0">
            <DialogHeader className="border-b px-4 pt-4 pb-3">
              <DialogTitle className="text-sm font-semibold">
                {step === "github" ? "Open GitHub" : "Clone Git repository"}
              </DialogTitle>
              <DialogDescription>
                {step === "github"
                  ? "Select a GitHub project, then choose where to clone it."
                  : "Enter a Git origin URL, then choose where to clone it."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-4 py-5">
              {step === "github" && (
                <GithubRepositoryPicker
                  status={ghStatus.data}
                  repositories={repositoriesQuery.data ?? []}
                  isLoading={ghStatus.isLoading || repositoriesQuery.isLoading}
                  selectedUrl={selectedRepoUrl}
                  onSelect={(repo) => {
                    setSelectedRepoUrl(repo.url)
                    setRepoUrl("")
                  }}
                />
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="repo-url" className="text-xs font-medium">
                  Repository URL
                </label>
                <Input
                  id="repo-url"
                  type="text"
                  placeholder={
                    selectedRepoUrl ||
                    (step === "github"
                      ? "https://github.com/user/repo.git"
                      : "git@github.com:user/repo.git")
                  }
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value)
                    setSelectedRepoUrl("")
                  }}
                  className="h-8 text-xs"
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
                disabled={
                  !(selectedRepoUrl || repoUrl.trim()) ||
                  !cloneFolder.trim() ||
                  isLoading
                }
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

function GithubRepositoryPicker({
  status,
  repositories,
  isLoading,
  selectedUrl,
  onSelect,
}: {
  status: GhStatus | undefined
  repositories: GhRepositorySummary[]
  isLoading: boolean
  selectedUrl: string
  onSelect: (repo: GhRepositorySummary) => void
}) {
  const connected = Boolean(status?.installed && status.authenticated)
  const selected = repositories.find((repo) => repo.url === selectedUrl)

  if (status && !connected) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-medium">GitHub is not connected</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {status.installed
            ? "Sign in with the GitHub CLI to list your projects here."
            : "Install the GitHub CLI to list your projects here."}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">GitHub projects</label>
      <Command className="h-56 rounded-lg border bg-background">
        <CommandInput placeholder="Search GitHub projects…" />
        <CommandList className="max-h-44">
          {isLoading ? (
            <CommandEmpty>Loading GitHub projects…</CommandEmpty>
          ) : (
            <CommandEmpty>No GitHub projects found</CommandEmpty>
          )}
          <CommandGroup>
            {repositories.map((repo) => (
              <CommandItem
                key={repo.nameWithOwner}
                value={`${repo.nameWithOwner} ${repo.description ?? ""}`}
                data-checked={repo.url === selectedUrl}
                onSelect={() => onSelect(repo)}
              >
                <GithubIcon size={14} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{repo.nameWithOwner}</p>
                  {repo.description && (
                    <p className="truncate text-muted-foreground">
                      {repo.description}
                    </p>
                  )}
                </div>
                <span className="text-2xs text-muted-foreground">
                  {repo.isPrivate ? "Private" : "Public"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Selected {selected.nameWithOwner}
        </p>
      )}
    </div>
  )
}

interface WorkspaceOptionProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

function WorkspaceOption({
  icon,
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
        {icon}
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
