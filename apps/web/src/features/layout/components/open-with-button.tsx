import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, ExternalLink, Loader2 } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

const OPEN_WITH_STORAGE_KEY = "lambda:open-with:v1"

const isMac =
  typeof window !== "undefined" && window.electronAPI?.platform === "darwin"

type OpenWithApp = {
  id: string
  name: string
  iconDataUrl: string | null
}

type IconLookup = Record<string, string | null | undefined>

type StoredSelections = {
  version: 1
  workspaceSelections: Record<string, string>
}

function readStoredSelections(): Record<string, string> {
  if (typeof window === "undefined") return {}

  try {
    const raw = localStorage.getItem(OPEN_WITH_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Partial<StoredSelections>
    if (
      parsed.version !== 1 ||
      typeof parsed.workspaceSelections !== "object" ||
      parsed.workspaceSelections === null
    ) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed.workspaceSelections).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    )
  } catch {
    return {}
  }
}

function writeStoredSelections(selections: Record<string, string>) {
  if (typeof window === "undefined") return

  localStorage.setItem(
    OPEN_WITH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      workspaceSelections: selections,
    } satisfies StoredSelections)
  )
}

function AppIcon({
  appName,
  iconDataUrl,
  className,
}: {
  appName: string
  iconDataUrl: string | null
  className?: string
}) {
  const [failedIconDataUrl, setFailedIconDataUrl] = useState<string | null>(
    null
  )
  const hasLoadError = iconDataUrl !== null && failedIconDataUrl === iconDataUrl

  if (iconDataUrl && !hasLoadError) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn("size-4 shrink-0 rounded-lg object-contain", className)}
        draggable={false}
        onError={() => {
          setFailedIconDataUrl(iconDataUrl)
        }}
        src={iconDataUrl}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-lg bg-muted text-[0.625rem] font-semibold text-muted-foreground",
        className
      )}
    >
      {appName.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function OpenWithButton({ workspacePath }: { workspacePath?: string }) {
  const [apps, setApps] = useState<OpenWithApp[]>([])
  const [iconsByAppId, setIconsByAppId] = useState<IconLookup>({})
  const [isLoadingApps, setIsLoadingApps] = useState(isMac)
  const [isOpening, setIsOpening] = useState(false)
  const [storedSelections, setStoredSelections] = useState<
    Record<string, string>
  >(() => readStoredSelections())

  useEffect(() => {
    if (!isMac || !window.electronAPI?.listOpenWithApps) {
      setIsLoadingApps(false)
      return
    }

    let cancelled = false

    void window.electronAPI
      .listOpenWithApps()
      .then((nextApps) => {
        if (!cancelled) {
          setApps(nextApps)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingApps(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.getOpenWithAppIcon || apps.length === 0) {
      return
    }

    let cancelled = false
    const appsMissingIcons = apps.filter(
      (editorApp) => iconsByAppId[editorApp.id] === undefined
    )

    if (appsMissingIcons.length === 0) {
      return
    }

    void Promise.all(
      appsMissingIcons.map(async (editorApp) => ({
        id: editorApp.id,
        iconDataUrl: await window.electronAPI!.getOpenWithAppIcon(editorApp.id),
      }))
    ).then((iconResults) => {
      if (cancelled) {
        return
      }

      setIconsByAppId((currentIcons) =>
        iconResults.reduce<IconLookup>(
          (nextIcons, result) => {
            nextIcons[result.id] = result.iconDataUrl
            return nextIcons
          },
          { ...currentIcons }
        )
      )
    })

    return () => {
      cancelled = true
    }
  }, [apps, iconsByAppId])

  const selectedAppId = workspacePath
    ? storedSelections[workspacePath]
    : undefined
  const selectedApp = useMemo(() => {
    if (apps.length === 0) return null
    return apps.find((editorApp) => editorApp.id === selectedAppId) ?? apps[0]
  }, [apps, selectedAppId])

  const persistSelection = (appId: string) => {
    if (!workspacePath) return

    setStoredSelections((currentSelections) => {
      if (currentSelections[workspacePath] === appId) {
        return currentSelections
      }

      const nextSelections = {
        ...currentSelections,
        [workspacePath]: appId,
      }
      writeStoredSelections(nextSelections)
      return nextSelections
    })
  }

  const openWorkspace = async (appId?: string) => {
    if (!workspacePath || !window.electronAPI?.openWorkspaceWithApp) return

    const targetApp = appId
      ? (apps.find((editorApp) => editorApp.id === appId) ?? null)
      : selectedApp
    if (!targetApp) return

    setIsOpening(true)
    try {
      await window.electronAPI.openWorkspaceWithApp(workspacePath, targetApp.id)
      persistSelection(targetApp.id)
    } catch (error) {
      console.error("Failed to open workspace with external editor", error)
    } finally {
      setIsOpening(false)
    }
  }

  if (!isMac || !workspacePath) {
    return null
  }

  if (!isLoadingApps && apps.length === 0) {
    return null
  }

  const disabled = isOpening || isLoadingApps || !selectedApp
  const selectedAppName = selectedApp?.name ?? "Editor"
  const selectedAppIconDataUrl = selectedApp
    ? (iconsByAppId[selectedApp.id] ?? selectedApp.iconDataUrl)
    : null

  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border bg-input/30 text-foreground shadow-xs">
      <button
        className="inline-flex h-7 max-w-44 items-center gap-1.5 px-2 transition-colors hover:bg-input/50 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={() => {
          void openWorkspace()
        }}
        type="button"
      >
        {isOpening || isLoadingApps ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <AppIcon
            appName={selectedAppName}
            iconDataUrl={selectedAppIconDataUrl}
          />
        )}
        <span className="truncate text-xs">{selectedAppName}</span>
        <ExternalLink className="size-3 text-muted-foreground" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-7 items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
        >
          <ChevronDown className="size-3.5" />
          <span className="sr-only">Choose editor</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Open workspace in</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {apps.map((editorApp) => (
              <DropdownMenuItem
                key={editorApp.id}
                onClick={() => {
                  void openWorkspace(editorApp.id)
                }}
              >
                <AppIcon
                  appName={editorApp.name}
                  className="size-4"
                  iconDataUrl={
                    iconsByAppId[editorApp.id] ?? editorApp.iconDataUrl
                  }
                />
                <span className="min-w-0 flex-1 truncate">
                  {editorApp.name}
                </span>
                <Check
                  className={cn(
                    "ml-auto size-3.5 text-foreground/70",
                    selectedApp?.id === editorApp.id
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
