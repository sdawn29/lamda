import { useCallback, useState } from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  TerminalSquare,
  PanelLeftIcon,
  PanelRightIcon,
  FolderTreeIcon,
  SettingsIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
  GitCommitHorizontalIcon,
  MessageSquareIcon,
  Loader2,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/shared/ui/command"
import { useCommandPalette } from "../context"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import {
  SHORTCUT_ACTIONS,
  formatBindingParts,
} from "@/shared/lib/keyboard-shortcuts"
import { useWorkspace } from "@/features/workspace"
import { useWorkspaceIndex } from "@/features/workspace/queries"
import { useTerminalForWorkspace } from "@/features/terminal/context"
import { useDiffPanel } from "@/features/git/context"
import { useFileTree } from "@/features/file-tree/context"
import { useSidebar } from "@/shared/ui/sidebar"
import { useSettingsModal } from "@/features/settings"
import { useTheme } from "@/shared/components/theme-provider"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"

function ShortcutHint({ binding }: { binding: string }) {
  const parts = formatBindingParts(binding)
  if (parts.length === 0) return null
  return (
    <CommandShortcut>
      {parts.join("")}
    </CommandShortcut>
  )
}

export function CommandPalette() {
  const { open, openPalette, closePalette } = useCommandPalette()
  const navigate = useNavigate()
  const { threadId: activeThreadId } = useParams({ strict: false }) as { threadId?: string }
  const { workspaces, createThread } = useWorkspace()
  const diffPanel = useDiffPanel()
  const fileTree = useFileTree()
  const { toggleSidebar } = useSidebar()
  const { openSettings } = useSettingsModal()
  const { theme, setTheme } = useTheme()

  const activeWorkspace =
    workspaces.find((ws) => ws.threads.some((t) => t.id === activeThreadId)) ??
    workspaces[0]

  const terminal = useTerminalForWorkspace(
    activeWorkspace?.id ?? "",
    activeWorkspace?.path ?? ""
  )

  const { data: fileEntries = [], isLoading: filesLoading } = useWorkspaceIndex(
    activeWorkspace?.id,
    open
  )
  const allFiles = fileEntries.filter((e) => !e.isDirectory)
  const [search, setSearch] = useState("")
  const searchLower = search.toLowerCase()
  const files = (
    searchLower
      ? allFiles.filter((f) => f.relativePath.toLowerCase().includes(searchLower))
      : allFiles
  ).slice(0, 5)

  const toggleSidebarBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR)
  const toggleTerminalBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_TERMINAL)
  const toggleDiffBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_DIFF_PANEL)
  const toggleFileTreeBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE)
  const newThreadBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_THREAD)
  const openSettingsBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)
  const openCommitBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_COMMIT_DIALOG)

  useShortcutHandler(SHORTCUT_ACTIONS.OPEN_COMMAND_PALETTE, openPalette)

  const run = useCallback(
    (fn: () => void) => {
      closePalette()
      setTimeout(fn, 50)
    },
    [closePalette]
  )

  const handleNavigateToThread = useCallback(
    (threadId: string) => {
      run(() =>
        navigate({ to: "/workspace/$threadId", params: { threadId } })
      )
    },
    [run, navigate]
  )

  const handleNewThread = useCallback(async () => {
    const ws = workspaces[0]
    if (!ws) return
    closePalette()
    const thread = await createThread(ws.id)
    navigate({ to: "/workspace/$threadId", params: { threadId: thread.id } })
  }, [workspaces, closePalette, createThread, navigate])

  const handleToggleTheme = useCallback(() => {
    run(() => setTheme(theme === "dark" ? "light" : "dark"))
  }, [run, theme, setTheme])

  const handleOpenFile = useCallback(
    (relativePath: string) => {
      run(() => {
        const workspacePath = activeWorkspace?.path
        if (!workspacePath) return
        const fileName = relativePath.split(/[/\\]/).pop() || relativePath
        const filePath = `${workspacePath}/${relativePath}`
        diffPanel.open()
        diffPanel.addTab({ title: fileName, type: "file", filePath })
      })
    },
    [run, activeWorkspace, diffPanel]
  )

  const allThreads = workspaces.flatMap((ws) =>
    ws.threads.map((t) => ({ ...t, workspaceName: ws.name }))
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { closePalette(); setSearch("") }
      }}
      title="Command Palette"
      description="Search commands and navigate"
      className="sm:max-w-lg"
    >
      <Command>
        <CommandInput placeholder="Search commands…" autoFocus onValueChange={setSearch} />
        <CommandList className="max-h-[22rem]">
          <CommandEmpty>No results found.</CommandEmpty>

          {files.length > 0 && (
            <>
              <CommandGroup heading={activeWorkspace ? `Files — ${activeWorkspace.name}` : "Files"}>
                {filesLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Indexing workspace…
                  </div>
                ) : (
                  files.map((file) => {
                    const dir = file.relativePath.split(/[/\\]/).slice(0, -1).join("/")
                    return (
                      <CommandItem
                        key={file.relativePath}
                        value={`file ${file.relativePath}`}
                        onSelect={() => handleOpenFile(file.relativePath)}
                      >
                        <Icon icon={`catppuccin:${getIconName(file.name)}`} className="size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span>{file.name}</span>
                          {dir && (
                            <span className="ml-1 text-muted-foreground/50 text-[0.7rem]">
                              {dir}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    )
                  })
                )}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {allThreads.length > 0 && (
            <>
              <CommandGroup heading="Go to thread">
                {allThreads.map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={`thread ${thread.title ?? "Untitled"} ${thread.workspaceName}`}
                    onSelect={() => handleNavigateToThread(thread.id)}
                  >
                    <MessageSquareIcon />
                    <span className="min-w-0 flex-1 truncate">
                      {thread.title || "Untitled thread"}
                    </span>
                    {workspaces.length > 1 && (
                      <CommandShortcut>{thread.workspaceName}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Layout">
            <CommandItem
              value="toggle sidebar panel"
              onSelect={() => run(toggleSidebar)}
            >
              <PanelLeftIcon />
              Toggle Sidebar
              <ShortcutHint binding={toggleSidebarBinding} />
            </CommandItem>
            <CommandItem
              value="toggle terminal panel"
              onSelect={() => run(terminal.toggle)}
            >
              <TerminalSquare />
              {terminal.isOpen ? "Close Terminal" : "Open Terminal"}
              <ShortcutHint binding={toggleTerminalBinding} />
            </CommandItem>
            <CommandItem
              value="toggle diff source control panel"
              onSelect={() => run(diffPanel.toggle)}
            >
              <PanelRightIcon />
              {diffPanel.isOpen ? "Close Diff Panel" : "Open Diff Panel"}
              <ShortcutHint binding={toggleDiffBinding} />
            </CommandItem>
            <CommandItem
              value="toggle file tree explorer panel"
              onSelect={() => run(fileTree.toggle)}
            >
              <FolderTreeIcon />
              {fileTree.isOpen ? "Close File Tree" : "Open File Tree"}
              <ShortcutHint binding={toggleFileTreeBinding} />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              value="new thread create chat"
              onSelect={handleNewThread}
            >
              <PlusIcon />
              New Thread
              <ShortcutHint binding={newThreadBinding} />
            </CommandItem>
            <CommandItem
              value="open settings preferences"
              onSelect={() => run(openSettings)}
            >
              <SettingsIcon />
              Open Settings
              <ShortcutHint binding={openSettingsBinding} />
            </CommandItem>
            <CommandItem
              value="toggle theme dark light mode appearance"
              onSelect={handleToggleTheme}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            </CommandItem>
            <CommandItem
              value="open commit dialog git source control"
              onSelect={() =>
                run(() => {
                  diffPanel.open()
                })
              }
            >
              <GitCommitHorizontalIcon />
              Open Source Control
              <ShortcutHint binding={openCommitBinding} />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
