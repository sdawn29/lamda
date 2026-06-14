import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronsUpDownIcon, FolderIcon, FolderPlusIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { LambdaMark } from "@/shared/components/lambda-mark"
import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useWorkspace, useCreateWorkspaceAction } from "@/features/workspace"
import { CreateWorkspaceDialog } from "@/features/workspace/components/create-workspace-dialog"
import {
  deleteThread,
  updateThreadTitle,
} from "@/features/workspace/api"
import { workspacesQueryKey } from "@/features/workspace/queries"
import type { ApprovalMode, Mode, WorkspaceDto } from "@/features/workspace/api"
import { useAppSettings } from "@/features/settings/queries"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import {
  BranchSelector,
  useBranch,
  useBranches,
  useWorkspaceBranch,
  useWorkspaceBranches,
} from "@/features/git"
import { checkoutBranch, sendPrompt, generateTitle } from "../api"
import {
  ChatComposer,
  type ChatComposerHandle,
  type ThinkingLevel,
  type PendingAttachment,
} from "./chat-composer"
import { pendingToUploads, pendingToDisplay } from "../lib/attachments"
import { setPendingThreadPreferences } from "./pending-thread-preferences"
import { getNextMode } from "./mode-combobox"
import { ThinkingIndicator } from "./thinking-indicator"
import { UserMessageContent } from "./user-message"
import { markPendingPrompt, clearPendingPrompt } from "../pending-prompts"
import type { UserMessage } from "../types"
import {
  messagesQueryKey,
  updateLastPageMessages,
  type MessagesInfiniteData,
} from "../queries"

interface NewThreadViewProps {
  initialWorkspaceId?: string
}

// Derive a provisional thread title from the user's first message. Shown
// immediately (in place of "New Thread") until the generated title arrives.
function deriveTitleFromMessage(text: string): string {
  const firstLine = text.trim().split("\n")[0]?.trim() ?? ""
  if (!firstLine) return "New Thread"
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine
}

export function NewThreadView({ initialWorkspaceId }: NewThreadViewProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { workspaces, createThread } = useWorkspace()
  const { data: appSettings, isFetched: settingsFetched } = useAppSettings()
  const updateAppSetting = useUpdateAppSetting()
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()

  // The user's explicit pick; until they pick, the workspace is derived below
  // from the ?ws= param, then the last-used workspace, then the first one.
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | null>(null)
  const [wsPickerOpen, setWsPickerOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<
    ThinkingLevel | undefined
  >(undefined)
  const [selectedMode, setSelectedMode] = useState<Mode>("agent")
  const [selectedApprovalMode, setSelectedApprovalMode] =
    useState<ApprovalMode>("ask")
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  // The just-submitted message. Set the instant the user hits enter so the view
  // flips straight to the working/conversation state — we don't wait for the
  // (slow) thread + session creation to finish before transitioning.
  const [pendingSend, setPendingSend] = useState<{
    text: string
    attachments?: NonNullable<UserMessage["attachments"]>
  } | null>(null)
  const chatTextboxRef = useRef<ChatComposerHandle>(null)

  // An explicit ?ws= navigation overrides any earlier in-page pick.
  const [prevInitialWorkspaceId, setPrevInitialWorkspaceId] =
    useState(initialWorkspaceId)
  if (prevInitialWorkspaceId !== initialWorkspaceId) {
    setPrevInitialWorkspaceId(initialWorkspaceId)
    setPickedWorkspaceId(null)
  }

  const workspaceExists = (id: string | null | undefined): id is string =>
    !!id && workspaces.some((w) => w.id === id)

  const lastUsedWorkspaceId = settingsFetched
    ? appSettings?.[APP_SETTINGS_KEYS.NEW_THREAD_WORKSPACE]
    : undefined
  const defaultWorkspaceId = workspaceExists(initialWorkspaceId)
    ? initialWorkspaceId
    : workspaceExists(lastUsedWorkspaceId)
      ? lastUsedWorkspaceId
      : (workspaces[0]?.id ?? null)
  const workspaceId = workspaceExists(pickedWorkspaceId)
    ? pickedWorkspaceId
    : defaultWorkspaceId

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
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId)
  if (prevWorkspaceId !== workspaceId) {
    setPrevWorkspaceId(workspaceId)
    setSelectedBranch(null)
  }

  // Reflect the effective workspace in ?ws= so the surrounding layout (right
  // sidebar, file tree) resolves the same workspace as the picker.
  useEffect(() => {
    if (!workspaceId || workspaceId === initialWorkspaceId) return
    navigate({ to: "/new", search: { ws: workspaceId }, replace: true })
  }, [workspaceId, initialWorkspaceId, navigate])

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
      thinkingLevel?: string,
      attachments?: PendingAttachment[]
    ) => {
      if (!workspaceId || isSending) return
      setIsSending(true)

      // Flip to the working state immediately — show the user's message and a
      // thinking indicator while the thread + session are built in the
      // background. This makes the transition feel instant instead of stalling
      // on the centered hero until the slow session setup returns.
      const displayAttachments = attachments
        ? pendingToDisplay(attachments)
        : undefined
      setPendingSend({ text, attachments: displayAttachments })

      // Seed the title with the user's message so it shows up instead of
      // "New Thread" until the generated title arrives below.
      const provisionalTitle = deriveTitleFromMessage(text)
      const threadModelId =
        provider && modelId ? `${provider}::${modelId}` : selectedModelId

      // Create the thread with its title, mode, and model in one call — the
      // server persists them before building the session, so the session gets
      // the right mode-specific tools and the workspaces cache (updated by the
      // createThread mutation) seeds ChatView's textbox state correctly.
      let thread
      try {
        thread = await createThread(workspaceId, {
          title: provisionalTitle,
          mode: selectedMode,
          approvalMode: selectedApprovalMode,
          modelId: threadModelId,
        })
      } catch (err) {
        setIsSending(false)
        // Thread creation failed — drop back to the hero so the user can retry.
        setPendingSend(null)
        toast.error("Couldn't start thread", {
          description: err instanceof Error ? err.message : String(err),
        })
        return
      }

      const sessionId = thread.sessionId
      if (!sessionId) {
        // Don't leave an unusable thread behind in the sidebar.
        deleteThread(thread.id).catch(() => {})
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
        setIsSending(false)
        setPendingSend(null)
        toast.error("Couldn't start thread", {
          description: "Session was not created for the new thread",
        })
        return
      }

      // Remember this workspace as the default for the next new thread.
      updateAppSetting.mutate({
        key: APP_SETTINGS_KEYS.NEW_THREAD_WORKSPACE,
        value: workspaceId,
      })

      setPendingThreadPreferences(thread.id, {
        modelId: threadModelId,
        thinkingLevel: thinkingLevel as ThinkingLevel | undefined,
      })

      const uploads = attachments ? pendingToUploads(attachments) : undefined

      // Pre-populate the messages cache so the optimistic user message is
      // visible the moment the new thread route mounts.
      const seed: MessagesInfiniteData = {
        pages: [
          {
            messages: [
              { role: "user", content: text, attachments: displayAttachments },
            ],
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
                { role: "user", content: text, attachments: displayAttachments },
              ])!
            : seed
      )

      // Tell the thread view a prompt is already on its way, so it shows the
      // working state immediately instead of waiting for the stream's first
      // agent_start event (which lags behind on slow model starts).
      markPendingPrompt(sessionId)

      // Navigate immediately — the optimistic message is already in the cache.
      // Checkout, prompt, and title generation continue in the background; raw
      // API calls + queryClient survive component unmount.
      navigate({
        to: "/workspace/$threadId",
        params: { threadId: thread.id },
      })

      const capturedWsId = workspaceId
      const capturedThreadId = thread.id
      const capturedBranch = selectedBranch
      const model = modelId && provider ? { provider, modelId } : undefined
      void (async () => {
        try {
          // Checkout the user-selected branch before the prompt runs. Always
          // honor an explicit pick — the branch shown in the selector comes
          // from a *reference* session, so the new session isn't guaranteed
          // to already be on it.
          if (capturedBranch) {
            await checkoutBranch(sessionId, capturedBranch)
          }
          await sendPrompt(sessionId, { text, model, thinkingLevel, attachments: uploads })
        } catch (err) {
          // The prompt never reached the agent — drop the optimistic message
          // by refetching server truth, clear the optimistic working hint, and
          // tell the user.
          clearPendingPrompt(sessionId)
          queryClient.invalidateQueries({
            queryKey: messagesQueryKey(sessionId),
          })
          toast.error("Couldn't send message", {
            description: err instanceof Error ? err.message : String(err),
          })
          return
        }

        try {
          const { title } = await generateTitle(text)
          await updateThreadTitle(capturedThreadId, title)
          await queryClient.cancelQueries({ queryKey: workspacesQueryKey })
          queryClient.setQueryData<WorkspaceDto[]>(workspacesQueryKey, (prev) =>
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
        } catch {
          // Provisional title stays — not worth surfacing.
        }
      })()
    },
    [
      workspaceId,
      isSending,
      selectedBranch,
      selectedMode,
      selectedApprovalMode,
      selectedModelId,
      createThread,
      updateAppSetting,
      queryClient,
      navigate,
    ]
  )

  const noWorkspaces = workspaces.length === 0

  // The workspace picker + branch selector live inside the composer's context
  // strip so workspace, branch, and approval read as one connected bar — the
  // Cursor-style composer header. Branch creation still works because the
  // selector keeps the reference session.
  const contextLeading = noWorkspaces ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={() => setCreateWorkspaceOpen(true)}
    >
      <FolderPlusIcon data-icon="inline-start" />
      <span className="whitespace-nowrap">Add workspace</span>
    </Button>
  ) : (
    <div className="flex min-w-0 items-center">
      <Popover open={wsPickerOpen} onOpenChange={setWsPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={wsPickerOpen}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <FolderIcon data-icon="inline-start" />
              <span className="max-w-[12rem] truncate">
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
                      setPickedWorkspaceId(ws.id)
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
          <span className="px-0.5 text-muted-foreground/50">/</span>
          <BranchSelector
            branch={selectedBranch ?? currentBranch}
            branches={branches}
            onBranchSelect={setSelectedBranch}
            sessionId={refSessionId}
          />
        </>
      )}
    </div>
  )

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      {pendingSend ? (
        // Working state — mirrors ChatView's layout so the handoff to the real
        // thread view (which mounts with this same message already cached) is
        // seamless. Shown the instant the user sends, before the session exists.
        <>
          <div className="flex w-full min-h-0 flex-1 flex-col overflow-y-auto pt-4 pb-8 [overflow-anchor:none]">
            <div className="mx-auto w-full max-w-3xl px-6 pb-3">
              <div className="flex flex-col items-end gap-1.5 self-end">
                <div
                  className="max-w-3/4 rounded-xl bg-muted/70 px-2 py-2 text-sm wrap-break-word whitespace-pre-wrap ring-1 ring-foreground/5"
                  data-selectable
                >
                  <UserMessageContent
                    content={pendingSend.text}
                    attachments={pendingSend.attachments}
                  />
                </div>
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-8">
              <ThinkingIndicator className="py-0.5" />
            </div>
          </div>

          <div className="shrink-0 bg-background">
            <div className="mx-auto w-full max-w-3xl px-6 pb-2">
              <ChatComposer
                onSend={() => {}}
                isLoading
                workspaceId={workspaceId ?? undefined}
                selectedModelId={selectedModelId}
                onModelChange={setSelectedModelId}
                selectedThinkingLevel={selectedThinkingLevel}
                onThinkingLevelChange={setSelectedThinkingLevel}
                mode={selectedMode}
                onModeChange={setSelectedMode}
                approvalMode={selectedApprovalMode}
                onApprovalModeChange={setSelectedApprovalMode}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-6">
          <div className="-mt-12 flex w-full max-w-2xl flex-col items-stretch">
            <div className="mb-7 flex flex-col items-center gap-3 text-center select-none">
              <LambdaMark />
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold tracking-tight">
                  What should we build?
                </h1>
                <p className="text-sm text-muted-foreground">
                  {noWorkspaces
                    ? "Add a workspace to begin your first conversation."
                    : "Type / for skills and commands, @ to reference files."}
                </p>
              </div>
            </div>

            <ChatComposer
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
              approvalMode={selectedApprovalMode}
              onApprovalModeChange={setSelectedApprovalMode}
              contextLeading={contextLeading}
              placeholder={
                noWorkspaces
                  ? "Add a workspace to start a thread"
                  : "Ask anything… / for commands, @ for files"
              }
            />

            {!noWorkspaces && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-2xs text-muted-foreground/70 select-none">
                <HintItem keys="/" label="Commands & skills" />
                <HintItem keys="@" label="Reference files" />
                <HintItem keys="⏎" label="Send" />
              </div>
            )}
          </div>
        </div>
      )}

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateLocal={handleCreateLocal}
        onCreateRemote={handleCreateRemote}
      />
    </div>
  )
}

function HintItem({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="flex h-4 min-w-4 items-center justify-center rounded border border-border/60 bg-muted px-1 font-mono text-[10px] text-muted-foreground">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  )
}
