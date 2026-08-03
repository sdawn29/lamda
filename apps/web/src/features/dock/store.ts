import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { DockId, DockTab, FilePreview, FileTabPayload } from "./types"

interface DockZoneState {
  tabIds: string[]
  activeTabId: string | null
  isOpen: boolean
  size: number
}

const DOCK_IDS: DockId[] = ["right", "bottom"]

// Defaults mirror the pre-dock right sidebar (width) and terminal island
// (height) so the first-run layout is unchanged.
const RIGHT_DEFAULT_SIZE = 560
const BOTTOM_DEFAULT_SIZE = 256

/** Bucket for routes with no thread (/new, /automations, /skills). */
export const NO_THREAD_SCOPE = "__no-thread__"

function makeDockZone(size: number): DockZoneState {
  return { tabIds: [], activeTabId: null, isOpen: false, size }
}

/**
 * Everything that follows the active thread: which panels are open, in which
 * dock, the open file previews, and the file tree/fullscreen flags. Global
 * preferences (singletonHome, the splitter widths, defaultSizes) live outside
 * this and are keyed by nothing — see DockStoreState.
 */
interface DockScopeState {
  docks: Record<DockId, DockZoneState>
  tabs: Record<string, DockTab>
  filePreviews: FilePreview[]
  activeFilePreviewId: string | null
  fileTreeOpen: boolean
  /** Right dock only — fullscreen collapses the chat column (see workspace-layout). */
  rightDockFullscreen: boolean
}

function makeScope(defaultSizes: Record<DockId, number>): DockScopeState {
  return {
    docks: {
      right: makeDockZone(defaultSizes.right),
      bottom: makeDockZone(defaultSizes.bottom),
    },
    tabs: {},
    filePreviews: [],
    activeFilePreviewId: null,
    fileTreeOpen: false,
    rightDockFullscreen: false,
  }
}

// Referentially stable fallback returned by activeScope()/getScope() reads for
// a thread that has never been visited, so Zustand's `===` selector check
// never treats an unvisited scope as "changed" on every render. Its dock
// sizes are the base RIGHT/BOTTOM_DEFAULT_SIZE constants rather than the live
// `defaultSizes` — harmless, because an unvisited scope's docks are always
// closed (isOpen: false), so the width is never actually rendered. The scope
// gets a real, correctly-seeded size the moment it's created by getScope().
const DEFAULT_SCOPE = Object.freeze(
  makeScope({ right: RIGHT_DEFAULT_SIZE, bottom: BOTTOM_DEFAULT_SIZE })
) as DockScopeState

interface OpenTabOptions {
  type: string
  singleton: boolean
  defaultDock: DockId
  title: string
  /**
   * Place a newly created tab in this dock, overriding its remembered home.
   * Existing singleton tabs are still revealed wherever they already live.
   */
  dock?: DockId
}

interface DockStoreState {
  /** Per-thread dock layouts, keyed by thread id (or NO_THREAD_SCOPE). */
  scopes: Record<string, DockScopeState>
  activeScopeId: string
  /** Which dock each singleton type last lived in — survives its tab closing. Global. */
  singletonHome: Partial<Record<string, DockId>>
  fileTreeWidth: number
  reviewFilesWidth: number
  /** Tab id currently being dragged between dock headers, or null. Transient UI state. */
  draggingTabId: string | null
  /** Seeds every newly created scope's dock sizes; updated by every resize (see Sizes in the design doc). */
  defaultSizes: Record<DockId, number>

  /**
   * Switches which thread's dock layout is live. `id: null` resolves to
   * NO_THREAD_SCOPE (routes with no thread). `handoff: true` is passed only
   * when the navigation originated on /new — see the merge logic below for
   * why that matters.
   */
  setActiveScope: (id: string | null, opts?: { handoff?: boolean }) => void
  /** Discards a thread's dock layout (called on thread delete). */
  dropScope: (id: string) => void

  openTab: (opts: OpenTabOptions) => void
  toggleTab: (opts: OpenTabOptions) => void
  closeTab: (id: string) => void
  setActiveTab: (dockId: DockId, tabId: string) => void
  moveTab: (tabId: string, targetDock: DockId, index?: number) => void
  reorderTab: (
    dockId: DockId,
    tabId: string,
    targetTabId: string,
    before: boolean
  ) => void
  toggleDock: (dockId: DockId) => void
  closeDock: (dockId: DockId) => void
  setDockSize: (dockId: DockId, size: number) => void
  openFilePreview: (file: FileTabPayload & { title: string }) => void
  closeFilePreview: (id: string) => void
  setActiveFilePreview: (id: string) => void
  reorderFilePreview: (
    draggedId: string,
    targetId: string,
    before: boolean
  ) => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  setReviewFilesWidth: (width: number) => void
  closeWorkspaceFileTabs: (workspacePath: string) => void
  toggleRightDockFullscreen: () => void
  setDraggingTab: (tabId: string | null) => void
}

/** Existing scope for `id`, or a freshly-defaulted one (seeded from defaultSizes) if unvisited. */
function getScope(s: DockStoreState, id: string): DockScopeState {
  return s.scopes[id] ?? makeScope(s.defaultSizes)
}

/** The active thread's scope, or the frozen default if it hasn't been visited yet. */
export function activeScope(s: DockStoreState): DockScopeState {
  return s.scopes[s.activeScopeId] ?? DEFAULT_SCOPE
}

/** Runs `fn` over the active scope and writes the result back into `scopes`. */
function updateScope(
  s: DockStoreState,
  fn: (scope: DockScopeState) => DockScopeState
): Pick<DockStoreState, "scopes"> {
  const id = s.activeScopeId
  return { scopes: { ...s.scopes, [id]: fn(getScope(s, id)) } }
}

function findTabDock(
  docks: Record<DockId, DockZoneState>,
  tabId: string
): DockId | null {
  for (const id of DOCK_IDS) {
    if (docks[id].tabIds.includes(tabId)) return id
  }
  return null
}

function createTab(
  scope: DockScopeState,
  singletonHome: Partial<Record<string, DockId>>,
  opts: OpenTabOptions
): {
  scope: Pick<DockScopeState, "tabs" | "docks">
  singletonHome?: Partial<Record<string, DockId>>
} {
  const id = `dock-${opts.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const tab: DockTab = { id, type: opts.type, title: opts.title }

  // An explicit dock (empty-dock picker) wins. Otherwise singleton panels
  // return to their remembered home, then fall back to their default dock.
  const targetDock: DockId =
    opts.dock ??
    (opts.singleton
      ? (singletonHome[opts.type] ?? opts.defaultDock)
      : opts.defaultDock)

  const dock = scope.docks[targetDock]
  return {
    scope: {
      tabs: { ...scope.tabs, [id]: tab },
      docks: {
        ...scope.docks,
        [targetDock]: {
          ...dock,
          tabIds: [...dock.tabIds, id],
          activeTabId: id,
          isOpen: true,
        },
      },
    },
    // Explicitly placing a singleton also makes that dock its new home.
    ...(opts.dock && opts.singleton
      ? { singletonHome: { ...singletonHome, [opts.type]: opts.dock } }
      : {}),
  }
}

export const useDockStore = create<DockStoreState>()(
  persist(
    (set) => ({
      scopes: {},
      activeScopeId: NO_THREAD_SCOPE,
      singletonHome: {},
      fileTreeWidth: 256,
      reviewFilesWidth: 320,
      draggingTabId: null,
      defaultSizes: { right: RIGHT_DEFAULT_SIZE, bottom: BOTTOM_DEFAULT_SIZE },

      setActiveScope: (id, opts) =>
        set((s) => {
          const nextId = id ?? NO_THREAD_SCOPE
          if (nextId === s.activeScopeId) return s
          if (
            opts?.handoff &&
            s.activeScopeId === NO_THREAD_SCOPE &&
            !s.scopes[nextId]
          ) {
            // Composing on /new can leave panels open in the scratch scope.
            // With strict defaults those would snap shut mid-send, so carry
            // that layout onto the freshly created thread instead — and drop
            // the scratch scope so the next /new visit starts clean (reads
            // fall back to DEFAULT_SCOPE once its key is gone).
            const scopes = { ...s.scopes }
            scopes[nextId] = scopes[NO_THREAD_SCOPE] ?? DEFAULT_SCOPE
            delete scopes[NO_THREAD_SCOPE]
            return { scopes, activeScopeId: nextId }
          }
          return { activeScopeId: nextId }
        }),

      dropScope: (id) =>
        set((s) => {
          if (!s.scopes[id]) return s
          const scopes = { ...s.scopes }
          delete scopes[id]
          return { scopes }
        }),

      openTab: (opts) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          if (opts.singleton) {
            const existing = Object.values(scope.tabs).find(
              (t) => t.type === opts.type
            )
            if (existing) {
              const dockId = findTabDock(scope.docks, existing.id)
              if (dockId) {
                return updateScope(s, () => ({
                  ...scope,
                  docks: {
                    ...scope.docks,
                    [dockId]: {
                      ...scope.docks[dockId],
                      isOpen: true,
                      activeTabId: existing.id,
                    },
                  },
                }))
              }
            }
          }
          const created = createTab(scope, s.singletonHome, opts)
          return {
            scopes: {
              ...s.scopes,
              [s.activeScopeId]: {
                ...scope,
                ...created.scope,
                fileTreeOpen: false,
              },
            },
            ...(created.singletonHome
              ? { singletonHome: created.singletonHome }
              : {}),
          }
        }),

      toggleTab: (opts) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          const existing = Object.values(scope.tabs).find(
            (t) => t.type === opts.type
          )
          if (existing) {
            const dockId = findTabDock(scope.docks, existing.id)
            if (dockId) {
              const dock = scope.docks[dockId]
              if (dock.isOpen && dock.activeTabId === existing.id) {
                // Hide the dock without discarding the tab — mirrors the old
                // panel/terminal "close" (isOpen:false), so live state (e.g.
                // terminal PTYs, tracked elsewhere) is untouched.
                return updateScope(s, () => ({
                  ...scope,
                  docks: {
                    ...scope.docks,
                    [dockId]: { ...dock, isOpen: false },
                  },
                }))
              }
              return updateScope(s, () => ({
                ...scope,
                docks: {
                  ...scope.docks,
                  [dockId]: {
                    ...dock,
                    isOpen: true,
                    activeTabId: existing.id,
                  },
                },
              }))
            }
          }
          const created = createTab(scope, s.singletonHome, opts)
          return {
            scopes: {
              ...s.scopes,
              [s.activeScopeId]: {
                ...scope,
                ...created.scope,
                fileTreeOpen: false,
              },
            },
            ...(created.singletonHome
              ? { singletonHome: created.singletonHome }
              : {}),
          }
        }),

      closeTab: (id) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          const dockId = findTabDock(scope.docks, id)
          if (!dockId) return s
          const dock = scope.docks[dockId]
          const idx = dock.tabIds.indexOf(id)
          const newTabIds = dock.tabIds.filter((t) => t !== id)
          const newTabs = { ...scope.tabs }
          delete newTabs[id]
          const newActiveTabId =
            dock.activeTabId === id
              ? (newTabIds[Math.max(0, idx - 1)] ?? null)
              : dock.activeTabId
          const wasFiles = scope.tabs[id]?.type === "files"
          return updateScope(s, () => ({
            ...scope,
            filePreviews: wasFiles ? [] : scope.filePreviews,
            activeFilePreviewId: wasFiles ? null : scope.activeFilePreviewId,
            tabs: newTabs,
            docks: {
              ...scope.docks,
              [dockId]: {
                ...dock,
                tabIds: newTabIds,
                activeTabId: newActiveTabId,
                // Keep an emptied dock visible so DockZone can show its
                // all-panels picker after the final tab is closed.
                isOpen: dock.isOpen,
              },
            },
          }))
        }),

      setActiveTab: (dockId, tabId) =>
        set((s) =>
          updateScope(s, (scope) => ({
            ...scope,
            docks: {
              ...scope.docks,
              [dockId]: { ...scope.docks[dockId], activeTabId: tabId },
            },
          }))
        ),

      moveTab: (tabId, targetDock, index) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          const sourceDock = findTabDock(scope.docks, tabId)
          if (!sourceDock) return s
          const tab = scope.tabs[tabId]
          if (sourceDock === targetDock) {
            return updateScope(s, () => ({
              ...scope,
              docks: {
                ...scope.docks,
                [targetDock]: { ...scope.docks[targetDock], activeTabId: tabId },
              },
            }))
          }
          const srcState = scope.docks[sourceDock]
          const dstState = scope.docks[targetDock]
          const newSrcTabIds = srcState.tabIds.filter((t) => t !== tabId)
          const newSrcActive =
            srcState.activeTabId === tabId
              ? (newSrcTabIds[newSrcTabIds.length - 1] ?? null)
              : srcState.activeTabId
          const insertAt = index ?? dstState.tabIds.length
          const newDstTabIds = [
            ...dstState.tabIds.slice(0, insertAt),
            tabId,
            ...dstState.tabIds.slice(insertAt),
          ]
          return {
            singletonHome: tab
              ? { ...s.singletonHome, [tab.type]: targetDock }
              : s.singletonHome,
            ...updateScope(s, () => ({
              ...scope,
              docks: {
                ...scope.docks,
                [sourceDock]: {
                  ...srcState,
                  tabIds: newSrcTabIds,
                  activeTabId: newSrcActive,
                  isOpen: newSrcTabIds.length > 0 ? srcState.isOpen : false,
                },
                [targetDock]: {
                  ...dstState,
                  tabIds: newDstTabIds,
                  activeTabId: tabId,
                  isOpen: true,
                },
              },
            })),
          }
        }),

      reorderTab: (dockId, tabId, targetTabId, before) =>
        set((s) => {
          if (tabId === targetTabId) return s
          const scope = getScope(s, s.activeScopeId)
          const dock = scope.docks[dockId]
          if (
            !dock.tabIds.includes(tabId) ||
            !dock.tabIds.includes(targetTabId)
          ) {
            return s
          }
          const without = dock.tabIds.filter((t) => t !== tabId)
          const targetIdx = without.indexOf(targetTabId)
          const insertAt = before ? targetIdx : targetIdx + 1
          const newTabIds = [
            ...without.slice(0, insertAt),
            tabId,
            ...without.slice(insertAt),
          ]
          return updateScope(s, () => ({
            ...scope,
            docks: { ...scope.docks, [dockId]: { ...dock, tabIds: newTabIds } },
          }))
        }),

      toggleDock: (dockId) =>
        set((s) =>
          updateScope(s, (scope) => ({
            ...scope,
            docks: {
              ...scope.docks,
              [dockId]: {
                ...scope.docks[dockId],
                isOpen: !scope.docks[dockId].isOpen,
              },
            },
          }))
        ),

      closeDock: (dockId) =>
        set((s) =>
          updateScope(s, (scope) => ({
            ...scope,
            fileTreeOpen: false,
            docks: {
              ...scope.docks,
              [dockId]: { ...scope.docks[dockId], isOpen: false },
            },
          }))
        ),

      setDockSize: (dockId, size) =>
        set((s) => ({
          ...updateScope(s, (scope) => ({
            ...scope,
            docks: { ...scope.docks, [dockId]: { ...scope.docks[dockId], size } },
          })),
          // Sizes are per-scope but seeded from this global default (see the
          // Sizes section of the design doc) — without also writing it here,
          // a resized dock would forget its width the moment the user visits
          // a different (or new) thread.
          defaultSizes: { ...s.defaultSizes, [dockId]: size },
        })),

      openFilePreview: (file) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          const existing = scope.filePreviews.find(
            (candidate) =>
              candidate.filePath === file.filePath &&
              candidate.sourceUrl === file.sourceUrl &&
              candidate.workspacePath === file.workspacePath
          )
          if (existing) {
            return updateScope(s, () => ({
              ...scope,
              filePreviews: scope.filePreviews.map((candidate) =>
                candidate.id === existing.id
                  ? { ...candidate, ...file, id: candidate.id }
                  : candidate
              ),
              activeFilePreviewId: existing.id,
              fileTreeOpen: false,
            }))
          }

          const preview: FilePreview = {
            ...file,
            id: `file-preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }
          return updateScope(s, () => ({
            ...scope,
            filePreviews: [...scope.filePreviews, preview],
            activeFilePreviewId: preview.id,
            fileTreeOpen: false,
          }))
        }),

      closeFilePreview: (id) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          const index = scope.filePreviews.findIndex((file) => file.id === id)
          if (index === -1) return s
          const filePreviews = scope.filePreviews.filter(
            (file) => file.id !== id
          )
          const activeFilePreviewId =
            scope.activeFilePreviewId === id
              ? (filePreviews[Math.max(0, index - 1)]?.id ?? null)
              : scope.activeFilePreviewId
          return updateScope(s, () => ({
            ...scope,
            filePreviews,
            activeFilePreviewId,
          }))
        }),

      setActiveFilePreview: (id) =>
        set((s) => {
          const scope = getScope(s, s.activeScopeId)
          if (!scope.filePreviews.some((file) => file.id === id)) return s
          return updateScope(s, () => ({ ...scope, activeFilePreviewId: id }))
        }),

      reorderFilePreview: (draggedId, targetId, before) =>
        set((s) => {
          if (draggedId === targetId) return s
          const scope = getScope(s, s.activeScopeId)
          if (
            !scope.filePreviews.some((file) => file.id === draggedId) ||
            !scope.filePreviews.some((file) => file.id === targetId)
          ) {
            return s
          }
          const dragged = scope.filePreviews.find(
            (file) => file.id === draggedId
          )
          if (!dragged) return s
          const without = scope.filePreviews.filter(
            (file) => file.id !== draggedId
          )
          const targetIndex = without.findIndex((file) => file.id === targetId)
          const insertAt = before ? targetIndex : targetIndex + 1
          return updateScope(s, () => ({
            ...scope,
            filePreviews: [
              ...without.slice(0, insertAt),
              dragged,
              ...without.slice(insertAt),
            ],
          }))
        }),
      toggleFileTree: () =>
        set((s) =>
          updateScope(s, (scope) => ({
            ...scope,
            fileTreeOpen: !scope.fileTreeOpen,
          }))
        ),
      setFileTreeWidth: (width) => set({ fileTreeWidth: width }),
      setReviewFilesWidth: (width) => set({ reviewFilesWidth: width }),

      // Sweeps every scope, not just the active one — a deleted workspace's
      // files can be open in the Files panel of several threads at once.
      closeWorkspaceFileTabs: (workspacePath) =>
        set((s) => {
          let changed = false
          const scopes: Record<string, DockScopeState> = {}
          for (const [id, scope] of Object.entries(s.scopes)) {
            const filePreviews = scope.filePreviews.filter(
              (file) => file.workspacePath !== workspacePath
            )
            if (filePreviews.length === scope.filePreviews.length) {
              scopes[id] = scope
              continue
            }
            changed = true
            const activeFilePreviewId = filePreviews.some(
              (file) => file.id === scope.activeFilePreviewId
            )
              ? scope.activeFilePreviewId
              : (filePreviews[0]?.id ?? null)
            scopes[id] = { ...scope, filePreviews, activeFilePreviewId }
          }
          return changed ? { scopes } : s
        }),

      toggleRightDockFullscreen: () =>
        set((s) =>
          updateScope(s, (scope) =>
            scope.rightDockFullscreen
              ? { ...scope, rightDockFullscreen: false }
              : {
                  // Entering fullscreen must also open the dock — a closed
                  // dock renders w-0, which would collapse the chat column
                  // against nothing (the shortcut can fire while hidden).
                  ...scope,
                  rightDockFullscreen: true,
                  docks: {
                    ...scope.docks,
                    right: { ...scope.docks.right, isOpen: true },
                  },
                }
          )
        ),

      setDraggingTab: (tabId) => set({ draggingTabId: tabId }),
    }),
    {
      name: "layout:dock",
      storage: createJSONStorage(() => localStorage),
      // `scopes`/`activeScopeId` are memory-only — tabs and open/active state
      // are session-only (matches the old right-sidebar/terminal behavior of
      // starting closed on reload). Only sizes, the file tree width, and
      // where singleton tabs live persist.
      partialize: (s) => ({
        defaultSizes: s.defaultSizes,
        singletonHome: s.singletonHome,
        fileTreeWidth: s.fileTreeWidth,
        reviewFilesWidth: s.reviewFilesWidth,
      }),
      merge: mergeDockPersisted,
    }
  )
)

/** Shape zustand/persist hands `merge` — either the old or new persisted payload, or garbage. */
export interface PersistedDockShape {
  defaultSizes?: Partial<Record<DockId, number>>
  // Pre-migration shape — read as a fallback so an existing localStorage
  // entry doesn't lose the user's dock widths.
  docks?: { right?: { size?: number }; bottom?: { size?: number } }
  singletonHome?: Partial<Record<string, DockId>>
  fileTreeWidth?: number
  reviewFilesWidth?: number
}

/**
 * Reconciles a persisted `layout:dock` payload with the store's freshly
 * constructed initial state. Exported (rather than inlined in the `persist`
 * config) so it's directly unit-testable without going through localStorage.
 */
export function mergeDockPersisted(
  persisted: unknown,
  current: DockStoreState
): DockStoreState {
  const p = (persisted ?? {}) as PersistedDockShape
  return {
    ...current,
    defaultSizes: {
      right:
        typeof p.defaultSizes?.right === "number"
          ? p.defaultSizes.right
          : typeof p.docks?.right?.size === "number"
            ? p.docks.right.size
            : current.defaultSizes.right,
      bottom:
        typeof p.defaultSizes?.bottom === "number"
          ? p.defaultSizes.bottom
          : typeof p.docks?.bottom?.size === "number"
            ? p.docks.bottom.size
            : current.defaultSizes.bottom,
    },
    singletonHome:
      p.singletonHome && typeof p.singletonHome === "object"
        ? p.singletonHome
        : current.singletonHome,
    fileTreeWidth:
      typeof p.fileTreeWidth === "number"
        ? p.fileTreeWidth
        : current.fileTreeWidth,
    reviewFilesWidth:
      typeof p.reviewFilesWidth === "number"
        ? p.reviewFilesWidth
        : current.reviewFilesWidth,
  }
}

/** Pure helper (no hook) — is this type's tab currently visible in its dock? */
export function isTabVisible(state: DockStoreState, type: string): boolean {
  const scope = activeScope(state)
  const tab = Object.values(scope.tabs).find((t) => t.type === type)
  if (!tab) return false
  for (const id of DOCK_IDS) {
    const dock = scope.docks[id]
    if (dock.tabIds.includes(tab.id))
      return dock.isOpen && dock.activeTabId === tab.id
  }
  return false
}

/** Open a file inside the singleton Files panel. Callable from anywhere. */
export function openFileTab(input: {
  title: string
  filePath: string
  workspacePath?: string
  openWithAppId?: string | null
  scrollToLine?: number
  sourceUrl?: string
}): void {
  const store = useDockStore.getState()
  store.openFilePreview(input)
  store.openTab({
    type: "files",
    singleton: true,
    defaultDock: "right",
    title: "Files",
  })
}

export function openReviewPanel(): void {
  useDockStore.getState().openTab({
    type: "review",
    singleton: true,
    defaultDock: "right",
    title: "Review",
  })
}

export function toggleReviewPanel(): void {
  useDockStore.getState().toggleTab({
    type: "review",
    singleton: true,
    defaultDock: "right",
    title: "Review",
  })
}
