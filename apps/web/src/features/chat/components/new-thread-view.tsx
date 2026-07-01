import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  GitBranchPlusIcon,
  MonitorIcon,
} from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { useWorkspace, useCreateWorkspaceAction } from "@/features/workspace"
import { CreateWorkspaceDialog } from "@/features/workspace/components/create-workspace-dialog"
import {
  deleteThread,
  updateThreadTitle,
  enterThreadWorktree,
} from "@/features/workspace/api"
import { workspacesQueryKey, useModes } from "@/features/workspace/queries"
import type { ApprovalMode, Mode, WorkspaceDto } from "@/features/workspace/api"
import { useAppSettings } from "@/features/settings/queries"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import {
  BranchSelector,
  branchNameFromTitle,
  gitKeys,
  useWorkspaceBranch,
  useWorkspaceBranches,
  useInitializeWorkspaceGitRepository,
} from "@/features/git"
import {
  checkoutBranch,
  listSessionWorktrees,
  sendPrompt,
  generateTitle,
} from "../api"
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
  return firstLine.length > 80 ? firstLine.slice(0, 80).trimEnd() : firstLine
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
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | null>(
    null
  )
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
  const [createInWorktree, setCreateInWorktree] = useState(false)
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false)
  // The committed worktree branch name (used at send). `worktreeBranchDraft` is
  // the in-dialog edit buffer, only promoted to the committed value on confirm
  // so cancelling/dismissing the dialog discards the edit.
  const [worktreeBranchName, setWorktreeBranchName] = useState("")
  const [worktreeBranchDraft, setWorktreeBranchDraft] = useState("")
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

  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId)
  const { data: modeData } = useModes(workspaceId)
  const modeList = useMemo(() => modeData ?? [], [modeData])
  // New-thread branch selection is workspace-scoped. Never proxy through an
  // arbitrary existing session: it may be stale or attached to another
  // worktree, which would hide or misreport the workspace's base branch.
  const { data: wsBranchData, isFetched: branchFetched } =
    useWorkspaceBranch(workspaceId)
  const { data: wsBranchesData, isFetched: branchesFetched } =
    useWorkspaceBranches(workspaceId)
  const currentBranch = wsBranchData?.branch ?? null
  const branches = wsBranchesData?.branches ?? []
  const hasBranchInfo = currentBranch !== null || branches.length > 0
  const selectedBaseBranch = selectedBranch ?? currentBranch
  // A worktree must fork from an existing commit. A freshly-initialized repo has
  // an unborn branch (no commits), so worktree creation is offered only once the
  // workspace has at least one commit.
  const canUseWorktree =
    !!selectedBaseBranch && (wsBranchData?.hasCommits ?? true)
  const initWorkspaceRepo = useInitializeWorkspaceGitRepository(workspaceId)
  // Distinguish "not a git repo" from "still loading branch info": only once both
  // workspace git queries have resolved with no branch can we offer to init.
  const isNonGitWorkspace =
    !!workspaceId && branchFetched && branchesFetched && !hasBranchInfo

  // Reset branch selection when the workspace changes.
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId)
  if (prevWorkspaceId !== workspaceId) {
    setPrevWorkspaceId(workspaceId)
    setSelectedBranch(null)
    setCreateInWorktree(false)
    setWorktreeBranchName("")
    setWorktreeBranchDraft("")
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
    setSelectedMode((mode) => getNextMode(mode, modeList))
  }, [modeList])

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
      const baseBranch = selectedBaseBranch

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
          worktree: createInWorktree
            ? {
                newBranch:
                  worktreeBranchName.trim() ||
                  branchNameFromTitle(provisionalTitle),
                baseRef: baseBranch ?? undefined,
              }
            : undefined,
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
                {
                  role: "user",
                  content: text,
                  attachments: displayAttachments,
                },
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
      const capturedBranch = createInWorktree ? null : selectedBranch
      const model = modelId && provider ? { provider, modelId } : undefined
      void (async () => {
        try {
          // Put the new (local) session on the user-selected branch before the
          // prompt runs. A branch checked out in a secondary worktree can't be
          // checked out in place — git would reject it and the prompt would
          // fail — so move the thread into that worktree instead (mirrors
          // ChatView's branch handling).
          if (capturedBranch) {
            const { worktrees } = await listSessionWorktrees(sessionId).catch(
              () => ({ worktrees: [] as { path: string; branch: string }[] })
            )
            if (worktrees.some((w) => w.branch === capturedBranch)) {
              await enterThreadWorktree(capturedThreadId, capturedBranch)
              queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
              queryClient.invalidateQueries({
                queryKey: gitKeys.session(sessionId),
              })
            } else {
              await checkoutBranch(sessionId, capturedBranch)
            }
          }
          await sendPrompt(sessionId, {
            text,
            model,
            thinkingLevel,
            attachments: uploads,
          })
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
      selectedBaseBranch,
      createInWorktree,
      worktreeBranchName,
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

  const workspaceSelector = noWorkspaces ? (
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
            <ChevronDownIcon
              data-icon="inline-end"
              className={`opacity-50 transition-transform duration-200 ${wsPickerOpen ? "rotate-180" : ""}`}
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
          <CommandInput placeholder="Search workspaces" />
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
  )

  const handleInitWorkspaceRepo = useCallback(() => {
    if (!workspaceId || initWorkspaceRepo.isPending) return
    initWorkspaceRepo.mutate(undefined, {
      onSuccess: () => toast.success("Initialized git repository"),
      onError: (err) =>
        toast.error("Couldn't initialize repository", {
          description: err instanceof Error ? err.message : String(err),
        }),
    })
  }, [workspaceId, initWorkspaceRepo])

  // Branch selection and the Local/Worktree location picker only make sense for
  // a git workspace. For a non-git folder, offer to initialize a repo instead;
  // while branch info is still loading, show nothing.
  const contextLeading = noWorkspaces ? null : isNonGitWorkspace ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleInitWorkspaceRepo}
      disabled={initWorkspaceRepo.isPending}
      title="Initialize a git repository in this workspace"
    >
      <GitBranchPlusIcon data-icon="inline-start" />
      <span>
        {initWorkspaceRepo.isPending
          ? "Initializing"
          : "Initialize git repository"}
      </span>
    </Button>
  ) : !hasBranchInfo ? null : (
    <div className="flex min-w-0 items-center">
      {createInWorktree ? (
        // In worktree mode the thread runs on the new branch, not the base —
        // show it here (mirrors ChatView). Click to rename; the base branch is
        // chosen inside the worktree dialog.
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setWorktreeBranchDraft(worktreeBranchName)
            setWorktreeDialogOpen(true)
          }}
          title="Worktree branch — click to edit"
        >
          <GitBranchIcon data-icon="inline-start" />
          <span className="max-w-[12rem] truncate">
            {worktreeBranchName.trim() || "lamda/ (from prompt)"}
          </span>
        </Button>
      ) : (
        <BranchSelector
          branch={selectedBranch ?? currentBranch}
          branches={branches}
          onBranchSelect={setSelectedBranch}
          workspaceId={workspaceId ?? undefined}
        />
      )}
      <Popover open={locationPickerOpen} onOpenChange={setLocationPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={locationPickerOpen}
              title="Choose where the new thread runs"
            >
              {createInWorktree ? (
                <FolderGit2Icon data-icon="inline-start" />
              ) : (
                <MonitorIcon data-icon="inline-start" />
              )}
              <span>{createInWorktree ? "Worktree" : "Local"}</span>
              <ChevronDownIcon
                data-icon="inline-end"
                className={`opacity-50 transition-transform duration-200 ${locationPickerOpen ? "rotate-180" : ""}`}
              />
            </Button>
          }
        />
        <PopoverContent
          className="w-64 p-0"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Command>
            <CommandList>
              <CommandGroup className="p-1">
                <CommandItem
                  className="items-start gap-2 rounded-md px-2 py-1.5"
                  onSelect={() => {
                    setCreateInWorktree(false)
                    setLocationPickerOpen(false)
                  }}
                >
                  <MonitorIcon />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium">Local</span>
                    <span className="text-3xs text-muted-foreground">
                      Checkout the selected branch in the workspace
                    </span>
                  </span>
                  {!createInWorktree && (
                    <CheckIcon className="ml-auto shrink-0" />
                  )}
                </CommandItem>
                <CommandItem
                  disabled={!canUseWorktree}
                  className="items-start gap-2 rounded-md px-2 py-1.5"
                  onSelect={() => {
                    setLocationPickerOpen(false)
                    setWorktreeBranchDraft(worktreeBranchName)
                    setWorktreeDialogOpen(true)
                  }}
                >
                  <FolderGit2Icon />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium">New worktree</span>
                    <span className="text-3xs text-muted-foreground">
                      {canUseWorktree
                        ? "Branch from the selected branch in isolation"
                        : "Needs an initial commit first"}
                    </span>
                  </span>
                  {createInWorktree && (
                    <CheckIcon className="ml-auto shrink-0" />
                  )}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      {pendingSend ? (
        // Working state — mirrors ChatView's layout so the handoff to the real
        // thread view (which mounts with this same message already cached) is
        // seamless. Shown the instant the user sends, before the session exists.
        <>
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-4 pb-8 [overflow-anchor:none]">
            <div className="mx-auto w-full max-w-4xl px-3 pb-3">
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
            <div className="mx-auto w-full max-w-4xl px-3 pt-4 pb-8">
              <ThinkingIndicator className="py-0.5" />
            </div>
          </div>

          <div className="shrink-0 bg-background">
            <div className="mx-auto w-full max-w-4xl px-3 pb-3">
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
          <div className="-mt-12 flex w-full max-w-4xl flex-col items-stretch">
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

            <div className="mb-1 flex min-w-0 items-center gap-1 px-1">
              {workspaceSelector}
              {contextLeading}
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
              placeholder={
                noWorkspaces
                  ? "Add a workspace to start a thread"
                  : "Ask anything / for commands, @ for files"
              }
            />

            {!noWorkspaces && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-2xs text-muted-foreground/70 select-none">
                <HintItem keys="/" label="Commands & skills" />
                <HintItem keys="@" label="Reference files" />
                <HintItem keys={["⇧", "Tab"]} label="Cycle mode" />
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

      <Dialog open={worktreeDialogOpen} onOpenChange={setWorktreeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up worktree</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-thread-worktree-branch">
                New branch
              </FieldLabel>
              <Input
                id="new-thread-worktree-branch"
                value={worktreeBranchDraft}
                placeholder="Generated from your first message"
                onChange={(event) => setWorktreeBranchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  setWorktreeBranchName(worktreeBranchDraft)
                  setCreateInWorktree(true)
                  setWorktreeDialogOpen(false)
                }}
                autoFocus
              />
              <FieldDescription>
                Leave blank to generate a{" "}
                <span className="font-mono">lamda/</span> branch from your first
                prompt.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Base branch</FieldLabel>
              {branches.length > 0 ? (
                <Select
                  value={selectedBaseBranch ?? ""}
                  onValueChange={(value) => setSelectedBranch(value ?? null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {branches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border px-3 py-2 font-mono text-sm">
                  {selectedBaseBranch ?? "Current branch"}
                </div>
              )}
              <FieldDescription>
                The worktree is created from this branch without changing the
                workspace checkout.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWorktreeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setWorktreeBranchName(worktreeBranchDraft)
                setCreateInWorktree(true)
                setWorktreeDialogOpen(false)
              }}
            >
              Use worktree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HintItem({ keys, label }: { keys: string | string[]; label: string }) {
  const keyList = Array.isArray(keys) ? keys : [keys]
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5">
        {keyList.map((k, i) => (
          <kbd
            key={i}
            className="flex h-4 min-w-4 items-center justify-center rounded border border-border/60 bg-muted px-1 font-mono text-[10px] text-muted-foreground"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span>{label}</span>
    </span>
  )
}
