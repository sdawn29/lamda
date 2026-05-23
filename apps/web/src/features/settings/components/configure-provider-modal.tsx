import { Key } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog"
import { Tabs, TabsContent } from "@/shared/ui/tabs"
import { cn } from "@/shared/lib/utils"
import { useConfigureProvider, type ConfigureProviderTab } from "../configure-provider-store"
import { SubscriptionsCard, ApiKeysCard } from "./provider-cards"

const TABS: { id: ConfigureProviderTab; label: string }[] = [
  { id: "subscriptions", label: "Subscriptions" },
  { id: "api-keys", label: "API Keys" },
]

export function ConfigureProviderModal() {
  const { open, tab, setTab, closeConfigure } = useConfigureProvider()

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeConfigure() }}>
      <DialogContent
        showCloseButton
        className="flex h-[70vh] max-h-[580px] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ConfigureProviderTab)}
          className="flex h-full flex-col gap-0"
        >
          <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted/50">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle>Configure Provider</DialogTitle>
                <DialogDescription>
                  Sign in with OAuth or add an API key to start chatting.
                </DialogDescription>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1 rounded-lg bg-muted/40 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-all duration-150 select-none",
                    tab === t.id
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground/70"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <TabsContent value="subscriptions">
              <SubscriptionsCard />
            </TabsContent>
            <TabsContent value="api-keys">
              <ApiKeysCard />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
