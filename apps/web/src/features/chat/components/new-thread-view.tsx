import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronsUpDownIcon, FolderIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useWorkspace } from "@/features/workspace"
import {
  updateThreadTitle,
  updateThreadMode,
  updateThreadModel,
} from "@/features/workspace/api"
import { workspacesQueryKey } from "@/features/workspace/queries"
import type { Mode, WorkspaceDto } from "@/features/workspace/api"
import { BranchSelector } from "@/features/git"

import { useBranch, useBranches, useWorkspaceBranch, useWorkspaceBranches } from "@/features/git"
import { checkoutBranch } from "../api"
import {
  ChatTextbox,
  type ChatTextboxHandle,
  type ThinkingLevel,
} from "./chat-textbox"
import { setPendingThreadPreferences } from "./pending-thread-preferences"
import { getNextMode } from "./mode-combobox"
import { sendPrompt, generateTitle } from "../api"
import {
  messagesQueryKey,
  updateLastPageMessages,
  type MessagesInfiniteData,
} from "../queries"

interface NewThreadViewProps {
  initialWorkspaceId?: string
}

export function NewThreadView({ initialWorkspaceId }: NewThreadViewProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { workspaces, createThread } = useWorkspace()

  const initialId =
    initialWorkspaceId && workspaces.some((w) => w.id === initialWorkspaceId)
      ? initialWorkspaceId
      : (workspaces[0]?.id ?? null)

  const [workspaceId, setWorkspaceId] = useState<string | null>(initialId)
  const [wsPickerOpen, setWsPickerOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<
    ThinkingLevel | undefined
  >(undefined)
  const [selectedMode, setSelectedMode] = useState<Mode>("code")
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)

  // Use the first available session from the selected workspace to query branch
  // data — git state is workspace-level, so any session is a valid proxy.
  // Fall back to workspace-level endpoints when no session exists yet.
  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId)
  const refSessionId =
    selectedWorkspace?.threads.find((t) => t.sessionId)?.sessionId ?? ""
  const hasSession = !!refSessionId

  const { data: sessionBranchData } = useBranch(refSessionId)
  const { data: sessionBranchesData } = useBranches(refSessionId)
  const { data: wsBranchData } = useWorkspaceBranch(hasSession ? null : workspaceId)
  const { data: wsBranchesData } = useWorkspaceBranches(hasSession ? null : workspaceId)

  const currentBranch = (hasSession ? sessionBranchData?.branch : wsBranchData?.branch) ?? null
  const branches = (hasSession ? sessionBranchesData?.branches : wsBranchesData?.branches) ?? []
  const hasBranchInfo = currentBranch !== null

  // Reset branch selection when the workspace changes.
  const prevWorkspaceIdRef = useRef(workspaceId)
  if (prevWorkspaceIdRef.current !== workspaceId) {
    prevWorkspaceIdRef.current = workspaceId
    setSelectedBranch(null)
  }

  // Adopt the first workspace once it loads if nothing was preselected.
  useEffect(() => {
    if (workspaceId === null && workspaces.length > 0) {
      setWorkspaceId(workspaces[0].id)
    }
  }, [workspaceId, workspaces])

  useEffect(() => {
    chatTextboxRef.current?.focus()
  }, [])

  const cycleAgentMode = useCallback(() => {
    setSelectedMode((mode) => getNextMode(mode))
  }, [])

  useShortcutHandler(SHORTCUT_ACTIONS.CYCLE_AGENT_MODE, cycleAgentMode)

  const handleSend = useCallback(
    async (
      text: string,
      modelId: string,
      provider: string,
      thinkingLevel?: string
    ) => {
      if (!workspaceId || isSending) return
      setIsSending(true)
      try {
        const thread = await createThread(workspaceId)
        const sessionId = thread.sessionId
        if (!sessionId) {
          throw new Error("Session was not created for the new thread")
        }

        // Checkout the user-selected branch on the new session before sending.
        if (selectedBranch && selectedBranch !== currentBranch) {
          await checkoutBranch(sessionId, selectedBranch)
        }

        // Persist the user's mode + model picks to the thread record before
        // navigating — the new ChatView reads thread.mode and thread.modelId
        // from the workspaces cache to seed its textbox state.
        const persistMode =
          selectedMode !== "code"
            ? updateThreadMode(thread.id, selectedMode)
            : Promise.resolve()
        const threadModelId =
          provider && modelId ? `${provider}::${modelId}` : selectedModelId
        const persistModel = threadModelId
          ? updateThreadModel(thread.id, threadModelId)
          : Promise.resolve()
        await Promise.all([persistMode, persistModel])

        // Sync the workspaces cache with the persisted picks so the route
        // mounts ChatView with the correct initial mode / modelId rather than
        // the createThread defaults (mode "code", modelId null).
        queryClient.setQueryData<WorkspaceDto[]>(workspacesQueryKey, (prev) =>
          prev?.map((ws) =>
            ws.id !== workspaceId
              ? ws
              : {
                  ...ws,
                  threads: ws.threads.map((t) =>
                    t.id !== thread.id
                      ? t
                      : {
                          ...t,
                          mode: selectedMode,
                          modelId: threadModelId ?? t.modelId,
                        }
                  ),
                }
          )
        )
        setPendingThreadPreferences(thread.id, {
          modelId: threadModelId,
          thinkingLevel: thinkingLevel as ThinkingLevel | undefined,
        })

        // Pre-populate the messages cache so the optimistic user message is
        // visible the moment the new thread route mounts.
        const seed: MessagesInfiniteData = {
          pages: [
            {
              messages: [{ role: "user", content: text }],
              hasMore: false,
              oldestBlockIndex: null,
            },
          ],
          pageParams: [undefined],
        }
        queryClient.setQueryData<MessagesInfiniteData>(
          messagesQueryKey(sessionId),
          (prev) =>
            prev
              ? updateLastPageMessages(prev, (msgs) => [
                  ...msgs,
                  { role: "user", content: text },
                ])!
              : seed
        )

        const model = modelId && provider ? { provider, modelId } : undefined
        await sendPrompt(sessionId, { text, model, thinkingLevel })

        // Fire-and-forget — navigate immediately, then update the title in the
        // background. Raw API calls + queryClient survive component unmount.
        const capturedWsId = workspaceId
        const capturedThreadId = thread.id
        generateTitle(text)
          .then(async ({ title }) => {
            await updateThreadTitle(capturedThreadId, title)
            await queryClient.cancelQueries({ queryKey: workspacesQueryKey })
            queryClient.setQueryData<WorkspaceDto[]>(
              workspacesQueryKey,
              (prev) =>
                prev?.map((ws) =>
                  ws.id !== capturedWsId
                    ? ws
                    : {
                        ...ws,
                        threads: ws.threads.map((t) =>
                          t.id !== capturedThreadId ? t : { ...t, title }
                        ),
                      }
                )
            )
          })
          .catch(() => {})

        navigate({
          to: "/workspace/$threadId",
          params: { threadId: thread.id },
        })
      } catch (err) {
        setIsSending(false)
        toast.error("Couldn't start thread", {
          description: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [
      workspaceId,
      isSending,
      selectedBranch,
      currentBranch,
      selectedMode,
      selectedModelId,
      createThread,
      queryClient,
      navigate,
    ]
  )

  const noWorkspaces = workspaces.length === 0

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6">
        <div className="-mt-8 flex w-full max-w-2xl flex-col items-stretch">
          <div className="mb-8 flex flex-col items-center gap-3 text-center select-none">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1c1c1e] shadow-md ring-1 ring-white/5">
              <span
                className="text-3xl leading-none font-black"
                style={{ color: "#d4a017" }}
              >
                Λ
              </span>
            </div>
            <div className="space-y-1.5">
              <p className="text-lg font-semibold tracking-tight">
                Start a new thread
              </p>
              <p className="text-xs text-muted-foreground">
                Pick a workspace, then ask anything to begin the conversation.
              </p>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-2">
            <Popover open={wsPickerOpen} onOpenChange={setWsPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={noWorkspaces}
                    aria-expanded={wsPickerOpen}
                    className="h-8 w-auto"
                  >
                    <FolderIcon data-icon="inline-start" />
                    <span className="whitespace-nowrap">
                      {selectedWorkspace?.name ?? "Select workspace"}
                    </span>
                    <ChevronsUpDownIcon
                      data-icon="inline-end"
                      className="opacity-50"
                    />
                  </Button>
                }
              />
              <PopoverContent
                className="w-auto min-w-40 p-0"
                side="top"
                align="start"
                sideOffset={6}
              >
                <Command>
                  <CommandInput placeholder="Search workspaces…" />
                  <CommandList>
                    <CommandEmpty>No workspaces found</CommandEmpty>
                    <CommandGroup>
                      {workspaces.map((ws) => (
                        <CommandItem
                          key={ws.id}
                          value={ws.name}
                          data-checked={ws.id === workspaceId}
                          className="whitespace-nowrap"
                          onSelect={() => {
                            setWorkspaceId(ws.id)
                            setWsPickerOpen(false)
                          }}
                        >
                          <FolderIcon />
                          {ws.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {hasBranchInfo && (
              <>
                <span className="text-muted-foreground/60">/</span>
                <div className="flex h-8 items-center">
                  <BranchSelector
                    branch={selectedBranch ?? currentBranch}
                    branches={branches}
                    onBranchSelect={setSelectedBranch}
                    sessionId={refSessionId}
                  />
                </div>
              </>
            )}
          </div>

          <ChatTextbox
            ref={chatTextboxRef}
            onSend={handleSend}
            isLoading={isSending}
            workspaceId={workspaceId ?? undefined}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
            selectedThinkingLevel={selectedThinkingLevel}
            onThinkingLevelChange={setSelectedThinkingLevel}
            mode={selectedMode}
            onModeChange={setSelectedMode}
            placeholder={
              noWorkspaces
                ? "Add a workspace to start a thread"
                : "Ask anything… @ for files"
            }
          />
        </div>
      </div>
    </div>
  )
}
