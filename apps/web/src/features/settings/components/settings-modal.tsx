import { Dialog, DialogContent } from "@/shared/ui/dialog"
import { useSettingsModal } from "../store"
import { SettingsPage } from "./settings-page"

export function SettingsModal() {
  const { open, closeSettings } = useSettingsModal()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeSettings()
      }}
    >
      <DialogContent
        showCloseButton={true}
        className="h-[85vh] max-h-[760px] w-full gap-0 overflow-hidden bg-background p-0 sm:max-w-[920px]"
      >
        <SettingsPage />
      </DialogContent>
    </Dialog>
  )
}
