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

function makeDockZone(size: number): DockZoneState {
  return { tabIds: [], activeTabId: null, isOpen: false, size }
}

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
  docks: Record<DockId, DockZoneState>
  tabs: Record<string, DockTab>
  /** Which dock each singleton type last lived in — survives its tab closing. */
  singletonHome: Partial<Record<string, DockId>>
  /** File tabs rendered inside the singleton Files panel. */
  filePreviews: FilePreview[]
  activeFilePreviewId: string | null
  fileTreeOpen: boolean
  fileTreeWidth: number
  reviewFilesWidth: number
  /** Right dock only — fullscreen collapses the chat column (see workspace-layout). */
  rightDockFullscreen: boolean
  /** Tab id currently being dragged between dock headers, or null. Transient UI state. */
  draggingTabId: string | null

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
  s: DockStoreState,
  opts: OpenTabOptions
): Pick<DockStoreState, "tabs" | "docks"> &
  Partial<Pick<DockStoreState, "singletonHome">> {
  const id = `dock-${opts.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const tab: DockTab = { id, type: opts.type, title: opts.title }

  // An explicit dock (empty-dock picker) wins. Otherwise singleton panels
  // return to their remembered home, then fall back to their default dock.
  const targetDock: DockId =
    opts.dock ??
    (opts.singleton
      ? (s.singletonHome[opts.type] ?? opts.defaultDock)
      : opts.defaultDock)

  const dock = s.docks[targetDock]
  return {
    tabs: { ...s.tabs, [id]: tab },
    // Explicitly placing a singleton also makes that dock its new home.
    ...(opts.dock && opts.singleton
      ? { singletonHome: { ...s.singletonHome, [opts.type]: opts.dock } }
      : {}),
    docks: {
      ...s.docks,
      [targetDock]: {
        ...dock,
        tabIds: [...dock.tabIds, id],
        activeTabId: id,
        isOpen: true,
      },
    },
  }
}

export const useDockStore = create<DockStoreState>()(
  persist(
    (set) => ({
      docks: {
        right: makeDockZone(RIGHT_DEFAULT_SIZE),
        bottom: makeDockZone(BOTTOM_DEFAULT_SIZE),
      },
      tabs: {},
      singletonHome: {},
      filePreviews: [],
      activeFilePreviewId: null,
      fileTreeOpen: false,
      fileTreeWidth: 256,
      reviewFilesWidth: 320,
      rightDockFullscreen: false,
      draggingTabId: null,

      openTab: (opts) =>
        set((s) => {
          if (opts.singleton) {
            const existing = Object.values(s.tabs).find(
              (t) => t.type === opts.type
            )
            if (existing) {
              const dockId = findTabDock(s.docks, existing.id)
              if (dockId) {
                return {
                  docks: {
                    ...s.docks,
                    [dockId]: {
                      ...s.docks[dockId],
                      isOpen: true,
                      activeTabId: existing.id,
                    },
                  },
                }
              }
            }
            return { ...createTab(s, opts), fileTreeOpen: false }
          }

          return { ...createTab(s, opts), fileTreeOpen: false }
        }),

      toggleTab: (opts) =>
        set((s) => {
          const existing = Object.values(s.tabs).find(
            (t) => t.type === opts.type
          )
          if (existing) {
            const dockId = findTabDock(s.docks, existing.id)
            if (dockId) {
              const dock = s.docks[dockId]
              if (dock.isOpen && dock.activeTabId === existing.id) {
                // Hide the dock without discarding the tab — mirrors the old
                // panel/terminal "close" (isOpen:false), so live state (e.g.
                // terminal PTYs, tracked elsewhere) is untouched.
                return {
                  docks: { ...s.docks, [dockId]: { ...dock, isOpen: false } },
                }
              }
              return {
                docks: {
                  ...s.docks,
                  [dockId]: {
                    ...dock,
                    isOpen: true,
                    activeTabId: existing.id,
                  },
                },
              }
            }
          }
          return { ...createTab(s, opts), fileTreeOpen: false }
        }),

      closeTab: (id) =>
        set((s) => {
          const dockId = findTabDock(s.docks, id)
          if (!dockId) return s
          const dock = s.docks[dockId]
          const idx = dock.tabIds.indexOf(id)
          const newTabIds = dock.tabIds.filter((t) => t !== id)
          const newTabs = { ...s.tabs }
          delete newTabs[id]
          const newActiveTabId =
            dock.activeTabId === id
              ? (newTabIds[Math.max(0, idx - 1)] ?? null)
              : dock.activeTabId
          return {
            filePreviews: s.tabs[id]?.type === "files" ? [] : s.filePreviews,
            activeFilePreviewId:
              s.tabs[id]?.type === "files" ? null : s.activeFilePreviewId,
            tabs: newTabs,
            docks: {
              ...s.docks,
              [dockId]: {
                ...dock,
                tabIds: newTabIds,
                activeTabId: newActiveTabId,
                // Keep an emptied dock visible so DockZone can show its
                // all-panels picker after the final tab is closed.
                isOpen: dock.isOpen,
              },
            },
          }
        }),

      setActiveTab: (dockId, tabId) =>
        set((s) => ({
          docks: {
            ...s.docks,
            [dockId]: { ...s.docks[dockId], activeTabId: tabId },
          },
        })),

      moveTab: (tabId, targetDock, index) =>
        set((s) => {
          const sourceDock = findTabDock(s.docks, tabId)
          if (!sourceDock) return s
          const tab = s.tabs[tabId]
          if (sourceDock === targetDock) {
            return {
              docks: {
                ...s.docks,
                [targetDock]: { ...s.docks[targetDock], activeTabId: tabId },
              },
            }
          }
          const srcState = s.docks[sourceDock]
          const dstState = s.docks[targetDock]
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
            docks: {
              ...s.docks,
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
          }
        }),

      reorderTab: (dockId, tabId, targetTabId, before) =>
        set((s) => {
          if (tabId === targetTabId) return s
          const dock = s.docks[dockId]
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
          return {
            docks: { ...s.docks, [dockId]: { ...dock, tabIds: newTabIds } },
          }
        }),

      toggleDock: (dockId) =>
        set((s) => ({
          docks: {
            ...s.docks,
            [dockId]: {
              ...s.docks[dockId],
              isOpen: !s.docks[dockId].isOpen,
            },
          },
        })),

      closeDock: (dockId) =>
        set((s) => ({
          fileTreeOpen: false,
          docks: {
            ...s.docks,
            [dockId]: { ...s.docks[dockId], isOpen: false },
          },
        })),

      setDockSize: (dockId, size) =>
        set((s) => ({
          docks: { ...s.docks, [dockId]: { ...s.docks[dockId], size } },
        })),

      openFilePreview: (file) =>
        set((s) => {
          const existing = s.filePreviews.find(
            (candidate) =>
              candidate.filePath === file.filePath &&
              candidate.sourceUrl === file.sourceUrl &&
              candidate.workspacePath === file.workspacePath
          )
          if (existing) {
            return {
              filePreviews: s.filePreviews.map((candidate) =>
                candidate.id === existing.id
                  ? { ...candidate, ...file, id: candidate.id }
                  : candidate
              ),
              activeFilePreviewId: existing.id,
              fileTreeOpen: false,
            }
          }

          const preview: FilePreview = {
            ...file,
            id: `file-preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }
          return {
            filePreviews: [...s.filePreviews, preview],
            activeFilePreviewId: preview.id,
            fileTreeOpen: false,
          }
        }),

      closeFilePreview: (id) =>
        set((s) => {
          const index = s.filePreviews.findIndex((file) => file.id === id)
          if (index === -1) return s
          const filePreviews = s.filePreviews.filter((file) => file.id !== id)
          const activeFilePreviewId =
            s.activeFilePreviewId === id
              ? (filePreviews[Math.max(0, index - 1)]?.id ?? null)
              : s.activeFilePreviewId
          return { filePreviews, activeFilePreviewId }
        }),

      setActiveFilePreview: (id) =>
        set((s) =>
          s.filePreviews.some((file) => file.id === id)
            ? { activeFilePreviewId: id }
            : s
        ),

      reorderFilePreview: (draggedId, targetId, before) =>
        set((s) => {
          if (draggedId === targetId) return s
          if (
            !s.filePreviews.some((file) => file.id === draggedId) ||
            !s.filePreviews.some((file) => file.id === targetId)
          ) {
            return s
          }
          const dragged = s.filePreviews.find((file) => file.id === draggedId)
          if (!dragged) return s
          const without = s.filePreviews.filter((file) => file.id !== draggedId)
          const targetIndex = without.findIndex((file) => file.id === targetId)
          const insertAt = before ? targetIndex : targetIndex + 1
          return {
            filePreviews: [
              ...without.slice(0, insertAt),
              dragged,
              ...without.slice(insertAt),
            ],
          }
        }),
      toggleFileTree: () => set((s) => ({ fileTreeOpen: !s.fileTreeOpen })),
      setFileTreeWidth: (width) => set({ fileTreeWidth: width }),
      setReviewFilesWidth: (width) => set({ reviewFilesWidth: width }),

      closeWorkspaceFileTabs: (workspacePath) =>
        set((s) => {
          const filePreviews = s.filePreviews.filter(
            (file) => file.workspacePath !== workspacePath
          )
          if (filePreviews.length === s.filePreviews.length) return s
          const activeFilePreviewId = filePreviews.some(
            (file) => file.id === s.activeFilePreviewId
          )
            ? s.activeFilePreviewId
            : (filePreviews[0]?.id ?? null)
          return { filePreviews, activeFilePreviewId }
        }),

      toggleRightDockFullscreen: () =>
        set((s) =>
          s.rightDockFullscreen
            ? { rightDockFullscreen: false }
            : {
                // Entering fullscreen must also open the dock — a closed dock
                // renders w-0, which would collapse the chat column against
                // nothing (the shortcut can fire while the dock is hidden).
                rightDockFullscreen: true,
                docks: {
                  ...s.docks,
                  right: { ...s.docks.right, isOpen: true },
                },
              }
        ),

      setDraggingTab: (tabId) => set({ draggingTabId: tabId }),
    }),
    {
      name: "layout:dock",
      storage: createJSONStorage(() => localStorage),
      // Tabs and open/active state are session-only (matches the old
      // right-sidebar/terminal behavior of starting closed on reload) — only
      // sizes, the file tree width, and where singleton tabs live persist.
      partialize: (s) => ({
        docks: {
          right: { size: s.docks.right.size },
          bottom: { size: s.docks.bottom.size },
        },
        singletonHome: s.singletonHome,
        fileTreeWidth: s.fileTreeWidth,
        reviewFilesWidth: s.reviewFilesWidth,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as {
          docks?: { right?: { size?: number }; bottom?: { size?: number } }
          singletonHome?: Partial<Record<string, DockId>>
          fileTreeWidth?: number
          reviewFilesWidth?: number
        }
        return {
          ...current,
          docks: {
            right: {
              ...current.docks.right,
              size:
                typeof p.docks?.right?.size === "number"
                  ? p.docks.right.size
                  : current.docks.right.size,
            },
            bottom: {
              ...current.docks.bottom,
              size:
                typeof p.docks?.bottom?.size === "number"
                  ? p.docks.bottom.size
                  : current.docks.bottom.size,
            },
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
      },
    }
  )
)

/** Pure helper (no hook) — is this type's tab currently visible in its dock? */
export function isTabVisible(state: DockStoreState, type: string): boolean {
  const tab = Object.values(state.tabs).find((t) => t.type === type)
  if (!tab) return false
  for (const id of DOCK_IDS) {
    const dock = state.docks[id]
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
