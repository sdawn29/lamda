import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/shared/ui/command"
import { getFileIcon } from "@/shared/ui/file-icon"
import { useWorkspaceIndex } from "@/features/workspace/queries"

interface FileSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Called with the relative path of the selected file (relative to workspace root) */
  onSelect: (relativePath: string) => void
}

export function FileSearchModal({
  open,
  onOpenChange,
  workspaceId,
  onSelect,
}: FileSearchModalProps) {
  const { data: entries = [], isLoading } = useWorkspaceIndex(workspaceId)

  const files = entries.filter((e) => !e.isDirectory)

  const handleSelect = useCallback(
    (relativePath: string) => {
      onSelect(relativePath)
      onOpenChange(false)
    },
    [onSelect, onOpenChange]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open File"
      description="Search for a file to open"
      className="sm:max-w-xl"
    >
      <Command shouldFilter>
        <CommandInput placeholder="Search files…" autoFocus />
        <CommandList className="max-h-96">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Indexing workspace…
            </div>
          )}
          {!isLoading && <CommandEmpty>No files found.</CommandEmpty>}
          {!isLoading && files.length > 0 && (
            <CommandGroup>
              {files.map((file) => {
                const FileIcon = getFileIcon(file.name)
                const dir = file.relativePath
                  .split(/[/\\]/)
                  .slice(0, -1)
                  .join("/")
                return (
                  <CommandItem
                    key={file.relativePath}
                    value={file.relativePath}
                    onSelect={() => handleSelect(file.relativePath)}
                  >
                    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{file.name}</span>
                      {dir && (
                        <span className="text-muted-foreground/50">
                          {" "}
                          — {dir}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
