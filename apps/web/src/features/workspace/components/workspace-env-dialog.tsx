import { useState, useRef } from "react"
import { Plus, Trash2, Upload, Download } from "lucide-react"
import { toast } from "sonner"
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
import { Textarea } from "@/shared/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs"
import { useUpdateWorkspaceEnv } from "../mutations"
import { parseEnv, serializeEnv } from "../env-format"
import type { WorkspaceDto } from "../api"

interface EnvRow {
  key: string
  value: string
}

type EnvTab = "table" | "editor"

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }))
}

function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const { key, value } of rows) {
    if (key.trim()) result[key.trim()] = value
  }
  return result
}

interface WorkspaceEnvDialogProps {
  workspace: WorkspaceDto
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkspaceEnvDialog({ workspace, open, onOpenChange }: WorkspaceEnvDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col sm:max-w-[90vw]">
        {/* Remounts each time the dialog opens so state is seeded from the
            current workspace env without a synchronizing effect. */}
        {open && <EnvDialogBody workspace={workspace} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function EnvDialogBody({
  workspace,
  onOpenChange,
}: Pick<WorkspaceEnvDialogProps, "workspace" | "onOpenChange">) {
  const initialEnv = workspace.env ?? {}
  const [tab, setTab] = useState<EnvTab>("table")
  const [rows, setRows] = useState<EnvRow[]>(() => envToRows(initialEnv))
  const [text, setText] = useState(() => serializeEnv(initialEnv))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateEnv = useUpdateWorkspaceEnv()

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }])
  }

  function updateRow(index: number, field: "key" | "value", val: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)))
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function handleTabChange(next: string) {
    // Convert between views at the boundary so neither side goes stale.
    if (next === "editor") {
      setText(serializeEnv(rowsToEnv(rows)))
    } else {
      setRows(envToRows(parseEnv(text)))
    }
    setTab(next as EnvTab)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-importing the same file
    if (!file) return
    try {
      const content = await file.text()
      const env = parseEnv(content)
      if (Object.keys(env).length === 0) {
        toast.error("No variables found in that file")
        return
      }
      setRows(envToRows(env))
      // Keep the raw file content in the editor so comments/formatting survive.
      setText(content)
      toast.success(`Imported ${Object.keys(env).length} variable(s)`)
    } catch {
      toast.error("Couldn't read that file")
    }
  }

  function handleExport() {
    const content = tab === "editor" ? text : serializeEnv(rowsToEnv(rows))
    if (!content.trim()) {
      toast.error("Nothing to export")
      return
    }
    const blob = new Blob([content.endsWith("\n") ? content : `${content}\n`], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = ".env"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function handleSave() {
    const env = tab === "editor" ? parseEnv(text) : rowsToEnv(rows)
    updateEnv.mutate(
      { workspaceId: workspace.id, env },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Environment Variables</DialogTitle>
        <DialogDescription>
          Variables are injected into every Claude session for this workspace.
        </DialogDescription>
      </DialogHeader>

      <input
        ref={fileInputRef}
        type="file"
        accept=".env,text/plain"
        className="hidden"
        onChange={handleImportFile}
      />

      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Import .env
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Export .env
            </Button>
          </div>
        </div>

        <TabsContent
          value="table"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1"
        >
          {rows.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-0.5 pb-0.5">
              <span className="text-xs font-medium text-muted-foreground">Key</span>
              <span className="text-xs font-medium text-muted-foreground">Value</span>
              <span />
            </div>
          )}
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => updateRow(i, "key", e.target.value)}
                placeholder="VARIABLE_NAME"
                className="font-mono text-xs h-8"
                spellCheck={false}
              />
              <Input
                value={row.value}
                onChange={(e) => updateRow(i, "value", e.target.value)}
                placeholder="value"
                className="font-mono text-xs h-8"
                spellCheck={false}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-fit gap-1.5 text-xs"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5" />
            Add variable
          </Button>
        </TabsContent>

        <TabsContent value="editor" className="flex min-h-0 flex-1 flex-col py-1">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"# Paste your .env file here\nKEY=value\nANOTHER_KEY=another value"}
            className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={updateEnv.isPending}>
          {updateEnv.isPending ? "Saving" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  )
}
