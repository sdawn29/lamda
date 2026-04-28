import { useState } from "react"
import { FolderOpen } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { CreateWorkspaceDialog } from "./create-workspace-dialog"
import { useCreateWorkspaceAction } from "../context"

export function WorkspaceEmptyState() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()

  return (
    <>
      <div className="flex h-full items-center justify-center">
        <Card className="animate-in fade-in-0 zoom-in-95 duration-300 w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>
              Create or select a workspace to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setDialogOpen(true)}>Create Workspace</Button>
          </CardContent>
        </Card>
      </div>
      <CreateWorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreateLocal={handleCreateLocal}
        onCreateRemote={handleCreateRemote}
      />
    </>
  )
}