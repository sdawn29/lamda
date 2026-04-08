import { useState, useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Sun, Moon, Monitor, Trash2, AlertTriangle, Eye, EyeOff, Check, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useProviders } from "@/queries/use-providers"
import { useUpdateProviders } from "@/mutations/use-update-providers"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

const PROVIDERS: { id: string; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "google", label: "Google Gemini", placeholder: "AIza..." },
  { id: "mistral", label: "Mistral", placeholder: "..." },
  { id: "groq", label: "Groq", placeholder: "gsk_..." },
  { id: "cerebras", label: "Cerebras", placeholder: "..." },
  { id: "xai", label: "xAI", placeholder: "xai-..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
  { id: "vercel-ai-gateway", label: "Vercel AI Gateway", placeholder: "..." },
  { id: "huggingface", label: "Hugging Face", placeholder: "hf_..." },
  { id: "kimi-coding", label: "Kimi For Coding", placeholder: "..." },
  { id: "minimax", label: "MiniMax", placeholder: "..." },
  { id: "minimax-cn", label: "MiniMax (China)", placeholder: "..." },
  { id: "zai", label: "ZAI", placeholder: "..." },
  { id: "opencode", label: "OpenCode Zen", placeholder: "..." },
  { id: "opencode-go", label: "OpenCode Go", placeholder: "..." },
  { id: "azure-openai-responses", label: "Azure OpenAI", placeholder: "..." },
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

          {/* Providers */}
          <ProvidersCard />

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

function ProvidersCard() {
  const { data: savedKeys, isLoading } = useProviders()
  const { mutate: saveProviders, isPending, isSuccess } = useUpdateProviders()

  const [keys, setKeys] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (savedKeys) setKeys(savedKeys)
  }, [savedKeys])

  useEffect(() => {
    if (isSuccess) {
      setSaved(true)
      const t = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [isSuccess])

  function handleSave() {
    saveProviders(keys)
  }

  function toggleVisible(id: string) {
    setVisible((v) => ({ ...v, [id]: !v[id] }))
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Providers</CardTitle>
        <CardDescription>
          API keys stored in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            ~/.pi/agent/auth.json
          </code>
          . Leave blank to remove a key.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map(({ id, label, placeholder }, i) => (
              <div key={id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <p className="text-xs font-medium">{label}</p>
                  </div>
                  <div className="relative flex-1">
                    <Input
                      type={visible[id] ? "text" : "password"}
                      value={keys[id] ?? ""}
                      onChange={(e) =>
                        setKeys((k) => ({ ...k, [id]: e.target.value }))
                      }
                      placeholder={placeholder}
                      className="h-7 pr-8 font-mono text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisible(id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {visible[id] ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {(savedKeys?.[id] ?? "") !== "" && (keys[id] ?? "") === (savedKeys?.[id] ?? "") && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 pt-2">
              {saved && (
                <span className="text-xs text-green-500">Saved</span>
              )}
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
