import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Sun, Moon, Monitor, Trash2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useWorkspace } from "@/hooks/workspace-context"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

function SettingsPage() {
  const { resetAll } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    try {
      await resetAll()
      setShowConfirm(false)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pb-12 pt-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your preferences and application data.
          </p>
        </div>

        <div className="space-y-4">
          {/* Appearance */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Choose how the application looks.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Press{" "}
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      D
                    </kbd>{" "}
                    to toggle quickly.
                  </p>
                </div>
                <div className="flex gap-1 rounded-lg border border-border p-1">
                  {THEMES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        theme === value
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Data</CardTitle>
              <CardDescription>
                Manage your locally stored application data.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">Delete all data</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Permanently removes all workspaces, threads, and
                        messages. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setShowConfirm(true)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete all
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>About</CardTitle>
              <CardDescription>Application information.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <Row label="Version" value="0.0.1" />
                <Separator />
                <Row label="Runtime" value="Electron + React 19" />
                <Separator />
                <Row label="Data location" value="Local storage" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirm delete dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all workspaces, threads, and
              messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
              disabled={resetting}
            >
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  )
}
